use crate::db;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const SELECT_FIELDS: &str =
    "id, subscription_id, api_format, base_url, model, is_default, created_at, updated_at";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubscriptionEndpoint {
    pub id: String,
    pub subscription_id: String,
    pub api_format: String,
    pub base_url: String,
    pub model: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateEndpointInput {
    pub subscription_id: String,
    pub api_format: String,
    pub base_url: String,
    pub model: String,
    pub is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEndpointInput {
    pub api_format: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

fn row_to_endpoint(row: &rusqlite::Row) -> rusqlite::Result<SubscriptionEndpoint> {
    Ok(SubscriptionEndpoint {
        id: row.get(0)?,
        subscription_id: row.get(1)?,
        api_format: row.get(2)?,
        base_url: row.get(3)?,
        model: row.get(4)?,
        is_default: row.get::<_, i32>(5)? != 0,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn validate_format(fmt: &str) -> AppResult<()> {
    if fmt == "openai" || fmt == "anthropic" {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "api_format must be 'openai' or 'anthropic', got '{}'",
            fmt
        )))
    }
}

#[tauri::command]
pub fn list_endpoints(
    app_handle: tauri::AppHandle,
    subscription_id: String,
) -> AppResult<Vec<SubscriptionEndpoint>> {
    let conn = db::open_connection(&app_handle)?;
    let sql = format!(
        "SELECT {} FROM subscription_endpoints WHERE subscription_id = ?1 \
         ORDER BY is_default DESC, created_at ASC",
        SELECT_FIELDS
    );
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map([subscription_id], row_to_endpoint)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

#[tauri::command]
pub fn create_endpoint(
    app_handle: tauri::AppHandle,
    input: CreateEndpointInput,
) -> AppResult<SubscriptionEndpoint> {
    validate_format(&input.api_format)?;
    let mut conn = db::open_connection(&app_handle)?;
    let tx = conn.transaction()?;

    let id = Uuid::new_v4().to_string();
    let make_default = input.is_default.unwrap_or(false);
    if make_default {
        tx.execute(
            "UPDATE subscription_endpoints SET is_default = 0 WHERE subscription_id = ?1",
            rusqlite::params![input.subscription_id],
        )?;
    }
    // First endpoint for a subscription is always default.
    let existing_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM subscription_endpoints WHERE subscription_id = ?1",
        rusqlite::params![input.subscription_id],
        |row| row.get(0),
    )?;
    let final_default = make_default || existing_count == 0;

    tx.execute(
        "INSERT INTO subscription_endpoints (id, subscription_id, api_format, base_url, model, is_default) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            id,
            input.subscription_id,
            input.api_format,
            input.base_url,
            input.model,
            if final_default { 1 } else { 0 }
        ],
    )?;

    let sql = format!("SELECT {} FROM subscription_endpoints WHERE id = ?1", SELECT_FIELDS);
    let endpoint = tx.query_row(&sql, [&id], row_to_endpoint)?;
    tx.commit()?;
    Ok(endpoint)
}

#[tauri::command]
pub fn update_endpoint(
    app_handle: tauri::AppHandle,
    id: String,
    input: UpdateEndpointInput,
) -> AppResult<SubscriptionEndpoint> {
    let conn = db::open_connection(&app_handle)?;
    if let Some(ref fmt) = input.api_format {
        validate_format(fmt)?;
        conn.execute(
            "UPDATE subscription_endpoints SET api_format = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![fmt, id],
        )?;
    }
    if let Some(ref url) = input.base_url {
        conn.execute(
            "UPDATE subscription_endpoints SET base_url = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![url, id],
        )?;
    }
    if let Some(ref model) = input.model {
        conn.execute(
            "UPDATE subscription_endpoints SET model = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![model, id],
        )?;
    }

    let sql = format!("SELECT {} FROM subscription_endpoints WHERE id = ?1", SELECT_FIELDS);
    let endpoint = conn.query_row(&sql, [&id], row_to_endpoint)?;
    Ok(endpoint)
}

#[tauri::command]
pub fn delete_endpoint(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let mut conn = db::open_connection(&app_handle)?;
    let tx = conn.transaction()?;

    let (subscription_id, was_default): (String, bool) = {
        let (sid, def): (String, i32) = tx.query_row(
            "SELECT subscription_id, is_default FROM subscription_endpoints WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        (sid, def != 0)
    };

    tx.execute("DELETE FROM subscription_endpoints WHERE id = ?1", rusqlite::params![id])?;

    // If we removed the default endpoint, promote the oldest remaining one to keep the
    // subscription routable.
    if was_default {
        let next_id: Option<String> = tx
            .query_row(
                "SELECT id FROM subscription_endpoints WHERE subscription_id = ?1 \
                 ORDER BY created_at ASC LIMIT 1",
                rusqlite::params![subscription_id],
                |row| row.get(0),
            )
            .ok();
        if let Some(nid) = next_id {
            tx.execute(
                "UPDATE subscription_endpoints SET is_default = 1, updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![nid],
            )?;
        }
    }

    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn set_default_endpoint(
    app_handle: tauri::AppHandle,
    id: String,
) -> AppResult<SubscriptionEndpoint> {
    let mut conn = db::open_connection(&app_handle)?;
    let tx = conn.transaction()?;

    let subscription_id: String = tx.query_row(
        "SELECT subscription_id FROM subscription_endpoints WHERE id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    )?;

    tx.execute(
        "UPDATE subscription_endpoints SET is_default = 0 WHERE subscription_id = ?1",
        rusqlite::params![subscription_id],
    )?;
    tx.execute(
        "UPDATE subscription_endpoints SET is_default = 1, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )?;

    let sql = format!("SELECT {} FROM subscription_endpoints WHERE id = ?1", SELECT_FIELDS);
    let endpoint = tx.query_row(&sql, [&id], row_to_endpoint)?;
    tx.commit()?;
    Ok(endpoint)
}

/// Resolve an endpoint to use for a given subscription:
///   - If `endpoint_id` is provided and belongs to the subscription, return it.
///   - Otherwise pick the subscription's default endpoint.
///   - If the subscription has no endpoints, return None (callers must fallback to the legacy
///     base_url/model columns on `subscriptions`).
pub fn resolve_endpoint(
    conn: &rusqlite::Connection,
    subscription_id: &str,
    endpoint_id: Option<&str>,
) -> AppResult<Option<SubscriptionEndpoint>> {
    if let Some(eid) = endpoint_id {
        let sql = format!(
            "SELECT {} FROM subscription_endpoints WHERE id = ?1 AND subscription_id = ?2",
            SELECT_FIELDS
        );
        match conn.query_row(&sql, rusqlite::params![eid, subscription_id], row_to_endpoint) {
            Ok(ep) => return Ok(Some(ep)),
            Err(rusqlite::Error::QueryReturnedNoRows) => {}
            Err(e) => return Err(AppError::Database(e)),
        }
    }
    let sql = format!(
        "SELECT {} FROM subscription_endpoints WHERE subscription_id = ?1 \
         ORDER BY is_default DESC, created_at ASC LIMIT 1",
        SELECT_FIELDS
    );
    match conn.query_row(&sql, rusqlite::params![subscription_id], row_to_endpoint) {
        Ok(ep) => Ok(Some(ep)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}
