use crate::db;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub tags: Vec<String>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoleInput {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub tags: Vec<String>,
    pub is_pinned: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoleInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_pinned: Option<bool>,
}

fn row_to_role(row: &rusqlite::Row) -> rusqlite::Result<Role> {
    let tags_str: String = row.get(3)?;
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
    Ok(Role {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        system_prompt: row.get::<_, String>(4)?,
        tags,
        is_pinned: row.get::<_, i32>(5)? != 0,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

#[tauri::command]
pub fn list_roles(
    app_handle: tauri::AppHandle,
    search: Option<String>,
    tag: Option<String>,
) -> AppResult<Vec<Role>> {
    let conn = db::open_connection(&app_handle)?;

    if let (Some(s), Some(t)) = (&search, &tag) {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
             FROM roles WHERE (name LIKE ?1 OR description LIKE ?1) AND tags LIKE ?2 \
             ORDER BY is_pinned DESC, updated_at DESC"
        )?;
        Ok(stmt.query_map(rusqlite::params![format!("%{}%", s), format!("%{}%", t)], row_to_role)?
            .collect::<Result<Vec<_>, _>>()?)
    } else if let Some(s) = &search {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
             FROM roles WHERE name LIKE ?1 OR description LIKE ?1 \
             ORDER BY is_pinned DESC, updated_at DESC"
        )?;
        Ok(stmt.query_map(rusqlite::params![format!("%{}%", s)], row_to_role)?
            .collect::<Result<Vec<_>, _>>()?)
    } else if let Some(t) = &tag {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
             FROM roles WHERE tags LIKE ?1 \
             ORDER BY is_pinned DESC, updated_at DESC"
        )?;
        Ok(stmt.query_map(rusqlite::params![format!("%{}%", t)], row_to_role)?
            .collect::<Result<Vec<_>, _>>()?)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
             FROM roles ORDER BY is_pinned DESC, updated_at DESC"
        )?;
        Ok(stmt.query_map([], row_to_role)?
            .collect::<Result<Vec<_>, _>>()?)
    }
}

#[tauri::command]
pub fn create_role(app_handle: tauri::AppHandle, input: CreateRoleInput) -> AppResult<Role> {
    let conn = db::open_connection(&app_handle)?;
    let id = Uuid::new_v4().to_string();
    let tags_json = serde_json::to_string(&input.tags)?;
    let is_pinned = if input.is_pinned { 1 } else { 0 };

    conn.execute(
        "INSERT INTO roles (id, name, description, tags, system_prompt, is_pinned) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, input.name, input.description, tags_json, input.system_prompt, is_pinned],
    )?;

    Ok(conn.query_row(
        "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
         FROM roles WHERE id = ?1",
        [&id],
        row_to_role,
    )?)
}

#[tauri::command]
pub fn update_role(
    app_handle: tauri::AppHandle,
    id: String,
    input: UpdateRoleInput,
) -> AppResult<Role> {
    let conn = db::open_connection(&app_handle)?;

    if let Some(ref name) = input.name {
        conn.execute(
            "UPDATE roles SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![name, id],
        )?;
    }
    if let Some(ref description) = input.description {
        conn.execute(
            "UPDATE roles SET description = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![description, id],
        )?;
    }
    if let Some(ref system_prompt) = input.system_prompt {
        conn.execute(
            "UPDATE roles SET system_prompt = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![system_prompt, id],
        )?;
    }
    if let Some(ref tags) = input.tags {
        let tags_json = serde_json::to_string(tags)?;
        conn.execute(
            "UPDATE roles SET tags = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![tags_json, id],
        )?;
    }
    if let Some(is_pinned) = input.is_pinned {
        conn.execute(
            "UPDATE roles SET is_pinned = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![if is_pinned { 1 } else { 0 }, id],
        )?;
    }

    Ok(conn.query_row(
        "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
         FROM roles WHERE id = ?1",
        [&id],
        row_to_role,
    )?)
}

#[tauri::command]
pub fn delete_role(app_handle: tauri::AppHandle, id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute(
        "UPDATE conversations SET role_id = NULL WHERE role_id = ?1",
        rusqlite::params![id],
    )?;
    conn.execute("DELETE FROM roles WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub fn toggle_pin_role(app_handle: tauri::AppHandle, id: String) -> AppResult<Role> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute(
        "UPDATE roles SET is_pinned = 1 - is_pinned, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )?;

    Ok(conn.query_row(
        "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
         FROM roles WHERE id = ?1",
        [&id],
        row_to_role,
    )?)
}

#[tauri::command]
pub fn import_roles(app_handle: tauri::AppHandle, file_path: String) -> AppResult<Vec<Role>> {
    let content = std::fs::read_to_string(&file_path)?;
    let input_roles: Vec<CreateRoleInput> = serde_json::from_str(&content)?;
    let conn = db::open_connection(&app_handle)?;

    let mut imported = Vec::new();
    for input in input_roles {
        let id = Uuid::new_v4().to_string();
        let tags_json = serde_json::to_string(&input.tags)?;
        let is_pinned = if input.is_pinned { 1 } else { 0 };
        conn.execute(
            "INSERT OR IGNORE INTO roles (id, name, description, tags, system_prompt, is_pinned) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, input.name, input.description, tags_json, input.system_prompt, is_pinned],
        )?;
        if let Ok(role) = conn.query_row(
            "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
             FROM roles WHERE id = ?1",
            [&id],
            row_to_role,
        ) {
            imported.push(role);
        }
    }
    Ok(imported)
}

#[tauri::command]
pub fn export_roles(
    app_handle: tauri::AppHandle,
    file_path: String,
    role_ids: Option<Vec<String>>,
) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;

    let roles = if let Some(ref ids) = role_ids {
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
             FROM roles WHERE id IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql)?;

        let params: Vec<&dyn rusqlite::types::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
        stmt.query_map(params.as_slice(), row_to_role)?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, tags, system_prompt, is_pinned, created_at, updated_at \
             FROM roles"
        )?;
        stmt.query_map([], row_to_role)?
            .collect::<Result<Vec<_>, _>>()?
    };

    let json = serde_json::to_string_pretty(&roles)?;
    std::fs::write(&file_path, json)?;
    Ok(())
}
