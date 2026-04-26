use crate::db;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub subscription_id: Option<String>,
    pub endpoint_id: Option<String>,
    pub role_id: Option<String>,
    pub working_directory: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateConversationInput {
    pub subscription_id: Option<String>,
    pub endpoint_id: Option<String>,
    pub role_id: Option<String>,
    pub working_directory: Option<String>,
}

const SELECT_FIELDS: &str =
    "id, title, subscription_id, endpoint_id, role_id, working_directory, created_at, updated_at";

fn row_to_conversation(row: &rusqlite::Row) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
        subscription_id: row.get(2)?,
        endpoint_id: row.get(3)?,
        role_id: row.get(4)?,
        working_directory: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

#[tauri::command]
pub fn list_conversations(
    app_handle: tauri::AppHandle,
    search: Option<String>,
) -> AppResult<Vec<Conversation>> {
    let conn = db::open_connection(&app_handle)?;
    let mut sql = format!("SELECT {} FROM conversations WHERE 1=1", SELECT_FIELDS);
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref s) = search {
        sql.push_str(" AND title LIKE ?");
        params.push(Box::new(format!("%{}%", s)));
    }
    sql.push_str(" ORDER BY updated_at DESC");

    let mut stmt = conn.prepare(&sql)?;
    let conversations = stmt
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
            row_to_conversation,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(conversations)
}

#[tauri::command]
pub fn create_conversation(
    app_handle: tauri::AppHandle,
    input: CreateConversationInput,
) -> AppResult<Conversation> {
    let conn = db::open_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let working_directory = input.working_directory.unwrap_or_default();

    conn.execute(
        "INSERT INTO conversations (id, title, subscription_id, endpoint_id, role_id, working_directory) \
         VALUES (?1, 'New Chat', ?2, ?3, ?4, ?5)",
        rusqlite::params![id, input.subscription_id, input.endpoint_id, input.role_id, working_directory],
    )?;

    let sql = format!("SELECT {} FROM conversations WHERE id = ?1", SELECT_FIELDS);
    let mut stmt = conn.prepare(&sql)?;
    let convo = stmt.query_row([&id], row_to_conversation)?;
    Ok(convo)
}

#[tauri::command]
pub fn get_conversation(app_handle: tauri::AppHandle, id: String) -> AppResult<Conversation> {
    let conn = db::open_connection(&app_handle)?;
    let sql = format!("SELECT {} FROM conversations WHERE id = ?1", SELECT_FIELDS);
    let mut stmt = conn.prepare(&sql)?;
    let convo = stmt.query_row([&id], row_to_conversation)?;
    Ok(convo)
}

#[tauri::command]
pub fn update_conversation(
    app_handle: tauri::AppHandle,
    id: String,
    title: Option<String>,
    subscription_id: Option<String>,
    endpoint_id: Option<String>,
    role_id: Option<String>,
    working_directory: Option<String>,
) -> AppResult<Conversation> {
    let conn = db::open_connection(&app_handle)?;

    if let Some(ref t) = title {
        conn.execute(
            "UPDATE conversations SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![t, id],
        )?;
    }
    if let Some(ref sid) = subscription_id {
        conn.execute(
            "UPDATE conversations SET subscription_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![sid, id],
        )?;
    }
    if let Some(ref eid) = endpoint_id {
        // Empty string clears the binding so chat reverts to the subscription's default endpoint.
        let value: Option<&str> = if eid.is_empty() { None } else { Some(eid.as_str()) };
        conn.execute(
            "UPDATE conversations SET endpoint_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![value, id],
        )?;
    }
    if let Some(ref rid) = role_id {
        conn.execute(
            "UPDATE conversations SET role_id = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![rid, id],
        )?;
    }
    if let Some(ref wd) = working_directory {
        conn.execute(
            "UPDATE conversations SET working_directory = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![wd, id],
        )?;
    }

    let sql = format!("SELECT {} FROM conversations WHERE id = ?1", SELECT_FIELDS);
    let mut stmt = conn.prepare(&sql)?;
    let convo = stmt.query_row([&id], row_to_conversation)?;
    Ok(convo)
}

#[tauri::command]
pub fn rename_conversation(app_handle: tauri::AppHandle, id: String, title: String) -> AppResult<Conversation> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![title, id],
    )?;

    let sql = format!("SELECT {} FROM conversations WHERE id = ?1", SELECT_FIELDS);
    let mut stmt = conn.prepare(&sql)?;
    let convo = stmt.query_row([&id], row_to_conversation)?;
    Ok(convo)
}

#[tauri::command]
pub fn delete_conversation(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}
