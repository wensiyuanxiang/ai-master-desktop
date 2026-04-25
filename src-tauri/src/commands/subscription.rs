use crate::db;
use crate::error::{AppError, AppResult};
use crate::services::{AppState, crypto};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    pub api_key_masked: String,
    pub base_url: String,
    pub model: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSubscriptionInput {
    pub provider_id: String,
    pub name: String,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSubscriptionInput {
    pub provider_id: Option<String>,
    pub name: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

fn mask_api_key(key: &str) -> String {
    if key.len() <= 8 {
        return "****".to_string();
    }
    format!("{}****{}", &key[..4], &key[key.len() - 4..])
}

fn row_to_subscription(row: &rusqlite::Row) -> rusqlite::Result<Subscription> {
    let api_key_encrypted: String = row.get(3)?;
    Ok(Subscription {
        id: row.get(0)?,
        provider_id: row.get(1)?,
        name: row.get(2)?,
        api_key_masked: mask_api_key(&api_key_encrypted),
        base_url: row.get(4)?,
        model: row.get(5)?,
        start_date: row.get(6)?,
        end_date: row.get(7)?,
        is_active: row.get::<_, i32>(8)? != 0,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[tauri::command]
pub fn list_subscriptions(
    app_handle: tauri::AppHandle,
    provider_id: Option<String>,
    search: Option<String>,
) -> AppResult<Vec<Subscription>> {
    let conn = db::open_connection(&app_handle)?;

    let sql = if provider_id.is_some() && search.is_some() {
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions WHERE provider_id = ?1 AND (name LIKE ?2 OR model LIKE ?3) ORDER BY updated_at DESC"
    } else if provider_id.is_some() {
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions WHERE provider_id = ?1 ORDER BY updated_at DESC"
    } else if search.is_some() {
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions WHERE name LIKE ?1 OR model LIKE ?1 ORDER BY updated_at DESC"
    } else {
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions ORDER BY updated_at DESC"
    };

    let mut stmt = conn.prepare(sql)?;

    let subs = if let (Some(pid), Some(s)) = (&provider_id, &search) {
        let pattern = format!("%{}%", s);
        stmt.query_map(rusqlite::params![pid.as_str(), pattern.clone(), pattern], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    } else if let Some(pid) = &provider_id {
        stmt.query_map(rusqlite::params![pid.as_str()], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    } else if let Some(s) = &search {
        let pattern = format!("%{}%", s);
        stmt.query_map(rusqlite::params![pattern], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        stmt.query_map([], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?
    };

    Ok(subs)
}

#[tauri::command]
pub fn create_subscription(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    input: CreateSubscriptionInput,
) -> AppResult<Subscription> {
    let conn = db::open_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let api_key_encrypted = crypto::encrypt(&input.api_key, &state.crypto_key)?;

    conn.execute(
        "INSERT INTO subscriptions (id, provider_id, name, api_key_encrypted, base_url, model, start_date, end_date) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            id, input.provider_id, input.name, api_key_encrypted,
            input.base_url, input.model, input.start_date, input.end_date
        ],
    )?;

    Ok(conn.query_row(
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions WHERE id = ?1",
        [&id],
        row_to_subscription,
    )?)
}

#[tauri::command]
pub fn update_subscription(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: UpdateSubscriptionInput,
) -> AppResult<Subscription> {
    let conn = db::open_connection(&app_handle)?;

    if let Some(ref provider_id) = input.provider_id {
        conn.execute(
            "UPDATE subscriptions SET provider_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![provider_id, id],
        )?;
    }
    if let Some(ref name) = input.name {
        conn.execute(
            "UPDATE subscriptions SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![name, id],
        )?;
    }
    if let Some(ref api_key) = input.api_key {
        let encrypted = crypto::encrypt(api_key, &state.crypto_key)?;
        conn.execute(
            "UPDATE subscriptions SET api_key_encrypted = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![encrypted, id],
        )?;
    }
    if let Some(ref base_url) = input.base_url {
        conn.execute(
            "UPDATE subscriptions SET base_url = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![base_url, id],
        )?;
    }
    if let Some(ref model) = input.model {
        conn.execute(
            "UPDATE subscriptions SET model = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![model, id],
        )?;
    }
    if let Some(ref start_date) = input.start_date {
        conn.execute(
            "UPDATE subscriptions SET start_date = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![start_date, id],
        )?;
    }
    if let Some(ref end_date) = input.end_date {
        conn.execute(
            "UPDATE subscriptions SET end_date = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![end_date, id],
        )?;
    }

    Ok(conn.query_row(
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions WHERE id = ?1",
        [&id],
        row_to_subscription,
    )?)
}

#[tauri::command]
pub fn delete_subscription(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute("DELETE FROM subscriptions WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub fn set_active_subscription(
    app_handle: tauri::AppHandle,
    id: String,
) -> AppResult<Subscription> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute("UPDATE subscriptions SET is_active = 0", [])?;
    conn.execute(
        "UPDATE subscriptions SET is_active = 1 WHERE id = ?1",
        rusqlite::params![id],
    )?;

    Ok(conn.query_row(
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions WHERE id = ?1",
        [&id],
        row_to_subscription,
    )?)
}

#[tauri::command]
pub fn get_active_subscription(app_handle: tauri::AppHandle) -> AppResult<Option<Subscription>> {
    let conn = db::open_connection(&app_handle)?;
    let result = conn.query_row(
        "SELECT id, provider_id, name, api_key_encrypted, base_url, model, \
         start_date, end_date, is_active, created_at, updated_at \
         FROM subscriptions WHERE is_active = 1 LIMIT 1",
        [],
        row_to_subscription,
    );
    match result {
        Ok(sub) => Ok(Some(sub)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}
