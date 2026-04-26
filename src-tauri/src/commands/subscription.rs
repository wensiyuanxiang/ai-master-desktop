use crate::db;
use crate::error::{AppError, AppResult};
use crate::services::{AppState, crypto};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

const SELECT_FIELDS: &str =
    "id, provider_id, name, api_key_encrypted, base_url, model, \
     start_date, end_date, api_format, is_active, created_at, updated_at, \
     admin_url, username, password_encrypted";

#[derive(Debug, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    pub api_key_masked: String,
    pub base_url: String,
    pub model: String,
    pub api_format: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Optional provider portal URL (e.g. https://platform.openai.com). When non-empty the
    /// UI surfaces this on the subscription card as a clickable link to the official console.
    pub admin_url: String,
    /// Optional login name for the provider portal. Stored as plaintext (not a secret); only
    /// the password is encrypted.
    pub username: String,
    /// True iff `password_encrypted` is non-empty so the UI can decide whether to render the
    /// reveal/copy controls without a separate round-trip.
    pub has_password: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateSubscriptionInput {
    pub provider_id: String,
    pub name: String,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub api_format: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub admin_url: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSubscriptionInput {
    pub provider_id: Option<String>,
    pub name: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub api_format: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub admin_url: Option<String>,
    pub username: Option<String>,
    /// `Some("")` clears the saved password; `None` leaves it unchanged. Allows the UI to
    /// distinguish "user wiped the field" from "user didn't touch the field".
    pub password: Option<String>,
}

fn mask_api_key(key: &str) -> String {
    if key.len() <= 8 { "****".to_string() }
    else { format!("{}****{}", &key[..4], &key[key.len() - 4..]) }
}

fn row_to_subscription(row: &rusqlite::Row) -> rusqlite::Result<Subscription> {
    let api_key_encrypted: String = row.get(3)?;
    let password_encrypted: String = row.get::<_, Option<String>>(14)?.unwrap_or_default();
    Ok(Subscription {
        id: row.get(0)?,
        provider_id: row.get(1)?,
        name: row.get(2)?,
        api_key_masked: mask_api_key(&api_key_encrypted),
        base_url: row.get(4)?,
        model: row.get(5)?,
        start_date: row.get(6)?,
        end_date: row.get(7)?,
        api_format: row.get(8)?,
        is_active: row.get::<_, i32>(9)? != 0,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        admin_url: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
        username: row.get::<_, Option<String>>(13)?.unwrap_or_default(),
        has_password: !password_encrypted.is_empty(),
    })
}

#[tauri::command]
pub fn list_subscriptions(
    app_handle: tauri::AppHandle,
    provider_id: Option<String>,
    search: Option<String>,
) -> AppResult<Vec<Subscription>> {
    let conn = db::open_connection(&app_handle)?;
    let sql = build_list_sql(&provider_id, &search);
    let mut stmt = conn.prepare(&sql)?;

    let subs = if let (Some(pid), Some(s)) = (&provider_id, &search) {
        let p = format!("%{}%", s);
        stmt.query_map(rusqlite::params![pid.as_str(), p.clone(), p], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    } else if let Some(pid) = &provider_id {
        stmt.query_map(rusqlite::params![pid.as_str()], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    } else if let Some(s) = &search {
        let p = format!("%{}%", s);
        stmt.query_map(rusqlite::params![p], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        stmt.query_map([], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    };
    Ok(subs)
}

fn build_list_sql(provider_id: &Option<String>, search: &Option<String>) -> String {
    let mut sql = format!("SELECT {} FROM subscriptions", SELECT_FIELDS);
    let mut has_where = false;
    if provider_id.is_some() { sql.push_str(" WHERE provider_id = ?1"); has_where = true; }
    if search.is_some() {
        if has_where { sql.push_str(" AND (name LIKE ?2 OR model LIKE ?3)"); }
        else { sql.push_str(" WHERE (name LIKE ?1 OR model LIKE ?1)"); }
    }
    sql.push_str(" ORDER BY updated_at DESC");
    sql
}

#[tauri::command]
pub fn create_subscription(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    input: CreateSubscriptionInput,
) -> AppResult<Subscription> {
    let conn = db::open_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let encrypted = crypto::encrypt(&input.api_key, &state.crypto_key)?;
    let api_format = input.api_format.unwrap_or_else(|| "openai".to_string());
    let admin_url = input.admin_url.unwrap_or_default();
    let username = input.username.unwrap_or_default();
    let password_encrypted = match input.password.as_deref() {
        Some(pw) if !pw.is_empty() => crypto::encrypt(pw, &state.crypto_key)?,
        _ => String::new(),
    };

    conn.execute(
        "INSERT INTO subscriptions (id, provider_id, name, api_key_encrypted, base_url, model, api_format, start_date, end_date, admin_url, username, password_encrypted) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![id, input.provider_id, input.name, encrypted, input.base_url, input.model, api_format, input.start_date, input.end_date, admin_url, username, password_encrypted],
    )?;

    // Mirror legacy single-endpoint columns into a default subscription_endpoint row so the
    // new endpoint-aware code paths have a route from day one.
    let endpoint_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO subscription_endpoints (id, subscription_id, api_format, base_url, model, is_default) \
         VALUES (?1, ?2, ?3, ?4, ?5, 1)",
        rusqlite::params![endpoint_id, id, api_format, input.base_url, input.model],
    )?;

    query_by_id(&conn, &id)
}

#[tauri::command]
pub fn update_subscription(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: UpdateSubscriptionInput,
) -> AppResult<Subscription> {
    let conn = db::open_connection(&app_handle)?;

    macro_rules! update_field {
        ($field:expr, $val:expr) => {
            if let Some(ref v) = $val {
                conn.execute(&format!("UPDATE subscriptions SET {} = ?1, updated_at = datetime('now') WHERE id = ?2", $field), rusqlite::params![v, id])?;
            }
        };
    }
    update_field!("provider_id", input.provider_id);
    update_field!("name", input.name);
    if let Some(ref api_key) = input.api_key {
        let enc = crypto::encrypt(api_key, &state.crypto_key)?;
        conn.execute("UPDATE subscriptions SET api_key_encrypted = ?1, updated_at = datetime('now') WHERE id = ?2", rusqlite::params![enc, id])?;
    }
    update_field!("base_url", input.base_url);
    update_field!("model", input.model);
    update_field!("api_format", input.api_format);
    update_field!("start_date", input.start_date);
    update_field!("end_date", input.end_date);
    update_field!("admin_url", input.admin_url);
    update_field!("username", input.username);
    if let Some(ref password) = input.password {
        // Empty string explicitly clears the saved password (encrypted blob set to "").
        let stored = if password.is_empty() {
            String::new()
        } else {
            crypto::encrypt(password, &state.crypto_key)?
        };
        conn.execute(
            "UPDATE subscriptions SET password_encrypted = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![stored, id],
        )?;
    }

    // Keep the default endpoint in sync with legacy columns so old UI paths remain consistent
    // until phase 2's endpoint-list editor takes over.
    if input.base_url.is_some() || input.model.is_some() || input.api_format.is_some() {
        let default_endpoint: Option<(String, String, String, String)> = conn
            .query_row(
                "SELECT id, api_format, base_url, model FROM subscription_endpoints \
                 WHERE subscription_id = ?1 ORDER BY is_default DESC, created_at ASC LIMIT 1",
                rusqlite::params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .ok();
        if let Some((eid, cur_fmt, cur_url, cur_model)) = default_endpoint {
            let new_fmt = input.api_format.clone().unwrap_or(cur_fmt);
            let new_url = input.base_url.clone().unwrap_or(cur_url);
            let new_model = input.model.clone().unwrap_or(cur_model);
            conn.execute(
                "UPDATE subscription_endpoints SET api_format = ?1, base_url = ?2, model = ?3, \
                 updated_at = datetime('now') WHERE id = ?4",
                rusqlite::params![new_fmt, new_url, new_model, eid],
            )?;
        }
    }

    let result = query_by_id(&conn, &id);
    drop(conn);

    // Any change that could touch the rendered preset payload (api key / base url / model /
    // api format) must trigger a resync so the stored snapshots reflect the new source. The
    // tool_preset command also emits a `tool-preset-resynced` event for the UI to pick up.
    let touches_render = input.api_key.is_some()
        || input.base_url.is_some()
        || input.model.is_some()
        || input.api_format.is_some();
    if touches_render {
        let _ = crate::commands::tool_preset::resync_subscription_presets(
            app_handle.clone(),
            state,
            id.clone(),
        );
    }

    result
}

#[tauri::command]
pub fn delete_subscription(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute("DELETE FROM subscriptions WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub fn set_active_subscription(app_handle: tauri::AppHandle, id: String) -> AppResult<Subscription> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute("UPDATE subscriptions SET is_active = 0", [])?;
    conn.execute("UPDATE subscriptions SET is_active = 1 WHERE id = ?1", rusqlite::params![id])?;
    query_by_id(&conn, &id)
}

#[tauri::command]
pub fn get_active_subscription(app_handle: tauri::AppHandle) -> AppResult<Option<Subscription>> {
    let conn = db::open_connection(&app_handle)?;
    match conn.query_row(
        &format!("SELECT {} FROM subscriptions WHERE is_active = 1 LIMIT 1", SELECT_FIELDS),
        [],
        row_to_subscription,
    ) {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

#[tauri::command]
pub fn get_subscription_api_key(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<String> {
    let conn = db::open_connection(&app_handle)?;
    let encrypted: String = conn.query_row(
        "SELECT api_key_encrypted FROM subscriptions WHERE id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    )?;
    let decrypted = crypto::decrypt(&encrypted, &state.crypto_key)?;
    Ok(decrypted)
}

#[tauri::command]
pub fn get_subscription_password(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<String> {
    let conn = db::open_connection(&app_handle)?;
    let encrypted: Option<String> = conn
        .query_row(
            "SELECT password_encrypted FROM subscriptions WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok();
    match encrypted {
        Some(enc) if !enc.is_empty() => Ok(crypto::decrypt(&enc, &state.crypto_key)?),
        _ => Ok(String::new()),
    }
}

fn query_by_id(conn: &rusqlite::Connection, id: &str) -> AppResult<Subscription> {
    let sql = format!("SELECT {} FROM subscriptions WHERE id = ?1", SELECT_FIELDS);
    Ok(conn.query_row(&sql, [id], row_to_subscription)?)
}
