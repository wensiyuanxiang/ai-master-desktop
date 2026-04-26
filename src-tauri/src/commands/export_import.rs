use crate::db;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub providers_imported: u32,
    pub subscriptions_imported: u32,
    pub roles_imported: u32,
    pub conversations_imported: u32,
    pub messages_imported: u32,
    pub backups_imported: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportData {
    providers: Vec<serde_json::Value>,
    subscriptions: Vec<serde_json::Value>,
    roles: Vec<serde_json::Value>,
    conversations: Vec<serde_json::Value>,
    messages: Vec<serde_json::Value>,
    backups: Vec<serde_json::Value>,
}

#[tauri::command]
pub fn export_all_data(app_handle: tauri::AppHandle, dest_path: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;

    let exports = ExportData {
        providers: export_table(&conn, "providers")?,
        subscriptions: export_table(&conn, "subscriptions")?,
        roles: export_table(&conn, "roles")?,
        conversations: export_table(&conn, "conversations")?,
        messages: export_table(&conn, "messages")?,
        backups: export_table(&conn, "config_backups")?,
    };

    let json = serde_json::to_string_pretty(&exports)?;
    std::fs::write(&dest_path, json)?;
    Ok(())
}

#[tauri::command]
pub fn import_all_data(app_handle: tauri::AppHandle, file_path: String) -> AppResult<ImportResult> {
    let content = std::fs::read_to_string(&file_path)?;
    let data: ExportData = serde_json::from_str(&content)?;
    let conn = db::open_connection(&app_handle)?;

    let mut result = ImportResult {
        providers_imported: 0,
        subscriptions_imported: 0,
        roles_imported: 0,
        conversations_imported: 0,
        messages_imported: 0,
        backups_imported: 0,
    };

    for p in &data.providers {
        conn.execute(
            "INSERT OR REPLACE INTO providers (id, name, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![p["id"].as_str().unwrap_or(""), p["name"].as_str().unwrap_or(""), p["created_at"].as_str().unwrap_or("")],
        )?;
        result.providers_imported += 1;
    }

    for s in &data.subscriptions {
        conn.execute(
            "INSERT OR REPLACE INTO subscriptions (id, provider_id, name, api_key_encrypted, base_url, \
             model, start_date, end_date, is_active, created_at, updated_at, admin_url, username, password_encrypted) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                s["id"].as_str().unwrap_or(""), s["provider_id"].as_str().unwrap_or(""),
                s["name"].as_str().unwrap_or(""), s["api_key_encrypted"].as_str().unwrap_or(""),
                s["base_url"].as_str().unwrap_or(""), s["model"].as_str().unwrap_or(""),
                s["start_date"].as_str().unwrap_or(""), s["end_date"].as_str().unwrap_or(""),
                s["is_active"].as_str().unwrap_or("0"), s["created_at"].as_str().unwrap_or(""),
                s["updated_at"].as_str().unwrap_or(""),
                s["admin_url"].as_str().unwrap_or(""),
                s["username"].as_str().unwrap_or(""),
                s["password_encrypted"].as_str().unwrap_or("")
            ],
        )?;
        result.subscriptions_imported += 1;
    }

    for r in &data.roles {
        conn.execute(
            "INSERT OR REPLACE INTO roles (id, name, description, tags, system_prompt, is_pinned, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                r["id"].as_str().unwrap_or(""), r["name"].as_str().unwrap_or(""),
                r["description"].as_str().unwrap_or(""), r["tags"].as_str().unwrap_or("[]"),
                r["system_prompt"].as_str().unwrap_or(""), r["is_pinned"].as_str().unwrap_or("0"),
                r["created_at"].as_str().unwrap_or(""), r["updated_at"].as_str().unwrap_or("")
            ],
        )?;
        result.roles_imported += 1;
    }

    for c in &data.conversations {
        conn.execute(
            "INSERT OR REPLACE INTO conversations (id, title, subscription_id, role_id, working_directory, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                c["id"].as_str().unwrap_or(""), c["title"].as_str().unwrap_or("New Chat"),
                c["subscription_id"].as_str().unwrap_or(""), c["role_id"].as_str().unwrap_or(""),
                c["working_directory"].as_str().unwrap_or(""), c["created_at"].as_str().unwrap_or(""),
                c["updated_at"].as_str().unwrap_or("")
            ],
        )?;
        result.conversations_imported += 1;
    }

    for m in &data.messages {
        conn.execute(
            "INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                m["id"].as_str().unwrap_or(""), m["conversation_id"].as_str().unwrap_or(""),
                m["role"].as_str().unwrap_or("user"), m["content"].as_str().unwrap_or(""),
                m["created_at"].as_str().unwrap_or("")
            ],
        )?;
        result.messages_imported += 1;
    }

    for b in &data.backups {
        conn.execute(
            "INSERT OR REPLACE INTO config_backups (id, tool_name, subscription_name, file_path, content, checksum, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                b["id"].as_str().unwrap_or(""), b["tool_name"].as_str().unwrap_or(""),
                b["subscription_name"].as_str().unwrap_or(""), b["file_path"].as_str().unwrap_or(""),
                b["content"].as_str().unwrap_or(""), b["checksum"].as_str().unwrap_or(""),
                b["created_at"].as_str().unwrap_or("")
            ],
        )?;
        result.backups_imported += 1;
    }

    Ok(result)
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn export_table(conn: &rusqlite::Connection, table: &str) -> AppResult<Vec<serde_json::Value>> {
    let sql = format!("SELECT * FROM {}", table);
    let mut stmt = conn.prepare(&sql)?;
    let col_count = stmt.column_count();
    let rows = stmt
        .query_map([], |row| {
            let mut map = serde_json::Map::new();
            for i in 0..col_count {
                let name = row.as_ref().column_name(i).unwrap_or("").to_string();
                let value: String = row.get::<_, String>(i).unwrap_or_default();
                map.insert(name, serde_json::Value::String(value));
            }
            Ok(serde_json::Value::Object(map))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
