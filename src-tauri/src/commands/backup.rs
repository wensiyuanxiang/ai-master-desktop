use crate::db;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use sha2::Digest;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigBackup {
    pub id: String,
    pub tool_name: String,
    pub subscription_name: String,
    pub file_path: String,
    pub checksum: String,
    pub created_at: String,
}

fn row_to_backup(row: &rusqlite::Row) -> rusqlite::Result<ConfigBackup> {
    Ok(ConfigBackup {
        id: row.get(0)?,
        tool_name: row.get(1)?,
        subscription_name: row.get(2)?,
        file_path: row.get(3)?,
        checksum: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[tauri::command]
pub fn list_backups(
    app_handle: tauri::AppHandle,
    tool_name: Option<String>,
) -> AppResult<Vec<ConfigBackup>> {
    let conn = db::open_connection(&app_handle)?;

    if let Some(ref _tn) = tool_name {
        let mut stmt = conn.prepare(
            "SELECT id, tool_name, subscription_name, file_path, checksum, created_at \
             FROM config_backups WHERE tool_name = ?1 ORDER BY created_at DESC"
        )?;
        Ok(stmt
            .query_map([_tn.as_str()], row_to_backup)?
            .collect::<Result<Vec<_>, _>>()?)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, tool_name, subscription_name, file_path, checksum, created_at \
             FROM config_backups ORDER BY created_at DESC"
        )?;
        Ok(stmt
            .query_map([], row_to_backup)?
            .collect::<Result<Vec<_>, _>>()?)
    }
}

#[tauri::command]
pub fn restore_backup(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    let (_tool_name, file_path, content): (String, String, String) = conn.query_row(
        "SELECT tool_name, file_path, content FROM config_backups WHERE id = ?1",
        [&id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    // Backup current config before restoring
    if let Ok(current) = std::fs::read_to_string(&file_path) {
        let checksum = format!("{:x}", sha2::Sha256::digest(current.as_bytes()));
        crate::services::config_file::insert_backup(
            &conn,
            &_tool_name,
            "pre-restore",
            &file_path,
            &current,
            &checksum,
        )?;
    }

    std::fs::write(&file_path, &content)?;
    Ok(())
}

#[tauri::command]
pub fn delete_backup(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute("DELETE FROM config_backups WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub fn export_backup(app_handle: tauri::AppHandle, id: String, dest_path: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    let content: String = conn.query_row(
        "SELECT content FROM config_backups WHERE id = ?1",
        [&id],
        |row| row.get(0),
    )?;
    std::fs::write(&dest_path, &content)?;
    Ok(())
}

#[tauri::command]
pub fn export_all_backups(
    app_handle: tauri::AppHandle,
    tool_name: String,
    dest_dir: String,
) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    let mut stmt = conn.prepare(
        "SELECT id, subscription_name, created_at, content \
         FROM config_backups WHERE tool_name = ?1 ORDER BY created_at DESC"
    )?;
    let backups: Vec<(String, String, String, String)> = stmt
        .query_map([&tool_name], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    std::fs::create_dir_all(&dest_dir)?;
    for (_id, sub_name, created_at, content) in &backups {
        let safe_name = format!(
            "{}_{}_{}.json",
            tool_name,
            sub_name.replace(['/', '\\', ' '], "_"),
            created_at.replace([':', ' '], "_")
        );
        std::fs::write(format!("{}/{}", dest_dir, safe_name), content)?;
    }
    Ok(())
}
