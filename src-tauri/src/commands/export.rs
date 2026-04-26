use crate::db;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};

/// A self-contained snapshot of everything related to AI tool configuration:
/// providers + subscriptions + endpoints + presets + active state + backups.
/// Encrypted API key columns are exported as-is so the receiving instance still
/// needs the same `crypto_key` (machine-bound by default) to decrypt them — this
/// matches the policy used by the existing `export_all_data` command and avoids
/// leaking plaintext secrets through the bundle file.
#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigBundle {
    pub schema_version: u32,
    pub exported_at: String,
    pub providers: Vec<serde_json::Value>,
    pub subscriptions: Vec<serde_json::Value>,
    pub endpoints: Vec<serde_json::Value>,
    pub presets: Vec<serde_json::Value>,
    pub active_states: Vec<serde_json::Value>,
    pub backups: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigBundleImportResult {
    pub providers_imported: u32,
    pub subscriptions_imported: u32,
    pub endpoints_imported: u32,
    pub presets_imported: u32,
    pub backups_imported: u32,
}

const CURRENT_SCHEMA_VERSION: u32 = 1;

#[tauri::command]
pub fn export_config_bundle(app_handle: tauri::AppHandle, dest_path: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    let bundle = ConfigBundle {
        schema_version: CURRENT_SCHEMA_VERSION,
        exported_at: chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
        providers: dump_table(&conn, "providers")?,
        subscriptions: dump_table(&conn, "subscriptions")?,
        endpoints: dump_table(&conn, "subscription_endpoints")?,
        presets: dump_table(&conn, "tool_subscription_configs")?,
        active_states: dump_table(&conn, "tool_active_state")?,
        backups: dump_table(&conn, "config_backups")?,
    };
    std::fs::write(&dest_path, serde_json::to_string_pretty(&bundle)?)?;
    Ok(())
}

#[tauri::command]
pub fn import_config_bundle(
    app_handle: tauri::AppHandle,
    file_path: String,
) -> AppResult<ConfigBundleImportResult> {
    let raw = std::fs::read_to_string(&file_path)?;
    let bundle: ConfigBundle = serde_json::from_str(&raw)?;

    let mut conn = db::open_connection(&app_handle)?;
    let tx = conn.transaction()?;

    let mut result = ConfigBundleImportResult {
        providers_imported: 0,
        subscriptions_imported: 0,
        endpoints_imported: 0,
        presets_imported: 0,
        backups_imported: 0,
    };

    for p in &bundle.providers {
        tx.execute(
            "INSERT OR REPLACE INTO providers (id, name, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![
                str_field(p, "id"),
                str_field(p, "name"),
                str_field(p, "created_at"),
            ],
        )?;
        result.providers_imported += 1;
    }

    for s in &bundle.subscriptions {
        tx.execute(
            "INSERT OR REPLACE INTO subscriptions (id, provider_id, name, api_key_encrypted, base_url, \
             model, api_format, start_date, end_date, is_active, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                str_field(s, "id"),
                str_field(s, "provider_id"),
                str_field(s, "name"),
                str_field(s, "api_key_encrypted"),
                str_field(s, "base_url"),
                str_field(s, "model"),
                str_field_default(s, "api_format", "openai"),
                opt_str(s, "start_date"),
                opt_str(s, "end_date"),
                int_field(s, "is_active"),
                str_field(s, "created_at"),
                str_field(s, "updated_at"),
            ],
        )?;
        result.subscriptions_imported += 1;
    }

    for e in &bundle.endpoints {
        tx.execute(
            "INSERT OR REPLACE INTO subscription_endpoints \
             (id, subscription_id, api_format, base_url, model, is_default, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                str_field(e, "id"),
                str_field(e, "subscription_id"),
                str_field_default(e, "api_format", "openai"),
                str_field(e, "base_url"),
                str_field(e, "model"),
                int_field(e, "is_default"),
                str_field(e, "created_at"),
                str_field(e, "updated_at"),
            ],
        )?;
        result.endpoints_imported += 1;
    }

    for p in &bundle.presets {
        tx.execute(
            "INSERT OR REPLACE INTO tool_subscription_configs \
             (id, tool_name, subscription_id, endpoint_id, rendered_json, is_overridden, notes, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                str_field(p, "id"),
                str_field(p, "tool_name"),
                str_field(p, "subscription_id"),
                opt_str(p, "endpoint_id"),
                str_field(p, "rendered_json"),
                int_field(p, "is_overridden"),
                str_field(p, "notes"),
                str_field(p, "created_at"),
                str_field(p, "updated_at"),
            ],
        )?;
        result.presets_imported += 1;
    }

    for a in &bundle.active_states {
        tx.execute(
            "INSERT OR REPLACE INTO tool_active_state \
             (tool_name, active_subscription_id, active_endpoint_id, active_preset_id, applied_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                str_field(a, "tool_name"),
                opt_str(a, "active_subscription_id"),
                opt_str(a, "active_endpoint_id"),
                opt_str(a, "active_preset_id"),
                str_field(a, "applied_at"),
            ],
        )?;
    }

    for b in &bundle.backups {
        tx.execute(
            "INSERT OR REPLACE INTO config_backups \
             (id, tool_name, subscription_name, file_path, content, checksum, created_at, \
              subscription_id, endpoint_id, preset_id) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                str_field(b, "id"),
                str_field(b, "tool_name"),
                str_field(b, "subscription_name"),
                str_field(b, "file_path"),
                str_field(b, "content"),
                str_field(b, "checksum"),
                str_field(b, "created_at"),
                opt_str(b, "subscription_id"),
                opt_str(b, "endpoint_id"),
                opt_str(b, "preset_id"),
            ],
        )?;
        result.backups_imported += 1;
    }

    tx.commit()?;
    Ok(result)
}

fn dump_table(conn: &rusqlite::Connection, table: &str) -> AppResult<Vec<serde_json::Value>> {
    let sql = format!("SELECT * FROM {}", table);
    let mut stmt = conn.prepare(&sql)?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();
    let rows = stmt
        .query_map([], |row| {
            let mut map = serde_json::Map::new();
            for (i, name) in col_names.iter().enumerate() {
                let value = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                    Ok(rusqlite::types::ValueRef::Integer(v)) => serde_json::json!(v),
                    Ok(rusqlite::types::ValueRef::Real(v)) => serde_json::json!(v),
                    Ok(rusqlite::types::ValueRef::Text(t)) => {
                        serde_json::Value::String(String::from_utf8_lossy(t).into_owned())
                    }
                    Ok(rusqlite::types::ValueRef::Blob(_)) => serde_json::Value::Null,
                    Err(_) => serde_json::Value::Null,
                };
                map.insert(name.clone(), value);
            }
            Ok(serde_json::Value::Object(map))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn str_field(v: &serde_json::Value, key: &str) -> String {
    v.get(key)
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string()
}

fn str_field_default(v: &serde_json::Value, key: &str, default: &str) -> String {
    let s = str_field(v, key);
    if s.is_empty() {
        default.to_string()
    } else {
        s
    }
}

fn opt_str(v: &serde_json::Value, key: &str) -> Option<String> {
    match v.get(key) {
        Some(serde_json::Value::Null) | None => None,
        Some(serde_json::Value::String(s)) if s.is_empty() => None,
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(other) => Some(other.to_string()),
    }
}

fn int_field(v: &serde_json::Value, key: &str) -> i64 {
    match v.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0),
        Some(serde_json::Value::Bool(b)) => i64::from(*b),
        _ => 0,
    }
}
