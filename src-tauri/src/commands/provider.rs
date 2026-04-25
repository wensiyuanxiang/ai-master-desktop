use crate::db;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[tauri::command]
pub fn list_providers(app_handle: tauri::AppHandle) -> AppResult<Vec<Provider>> {
    let conn = db::open_connection(&app_handle)?;
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at FROM providers ORDER BY name ASC"
    )?;
    let providers = stmt
        .query_map([], |row| {
            Ok(Provider {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(providers)
}

#[tauri::command]
pub fn create_provider(app_handle: tauri::AppHandle, name: String) -> AppResult<Provider> {
    let conn = db::open_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO providers (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )?;
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at FROM providers WHERE id = ?1"
    )?;
    let provider = stmt.query_row([&id], |row| {
        Ok(Provider {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?;
    Ok(provider)
}

#[tauri::command]
pub fn delete_provider(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute("DELETE FROM providers WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}
