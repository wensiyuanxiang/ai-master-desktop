use crate::commands::config::{ConfigFileContent, ToolConfigInfo};
use crate::db;
use crate::error::{AppError, AppResult};
use sha2::Digest;
use uuid::Uuid;

const KNOWN_TOOLS: &[(&str, &str, &[&str])] = &[
    ("claude_code", "Claude Code", &["claude", "claude.json"]),
    ("opencode", "OpenCode", &["opencode", "config.json"]),
    ("openclaw", "OpenClaw", &["openclaw", "config.json"]),
    ("hermes_agent", "Hermes Agent", &["hermes", "config.json"]),
];

pub fn detect_tool_configs() -> AppResult<Vec<ToolConfigInfo>> {
    let home = dirs_home()?;

    let mut tools = Vec::new();
    for (tool_name, display_name, path_parts) in KNOWN_TOOLS {
        let config_path = home.join(".config").join(path_parts[0]).join(path_parts[1]);
        let exists = config_path.exists();
        let current_sub = if exists {
            read_json_field(&config_path, "name").ok()
        } else {
            None
        };

        tools.push(ToolConfigInfo {
            tool_name: tool_name.to_string(),
            display_name: display_name.to_string(),
            config_path: config_path.to_string_lossy().to_string(),
            exists,
            current_subscription_name: current_sub,
        });
    }
    Ok(tools)
}

pub fn read_config(tool_name: &str) -> AppResult<ConfigFileContent> {
    let path = resolve_path(tool_name)?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| AppError::ConfigFile(format!("Cannot read {}: {}", path.display(), e)))?;

    let json: serde_json::Value = serde_json::from_str(&raw)?;
    let api_key = json
        .get("apiKey")
        .or_else(|| json.get("api_key"))
        .and_then(|v| v.as_str())
        .map(|s| mask_value(s));
    let base_url = json
        .get("baseUrl")
        .or_else(|| json.get("base_url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let model = json.get("model").and_then(|v| v.as_str()).map(|s| s.to_string());

    Ok(ConfigFileContent {
        raw_json: raw,
        api_key_field: api_key,
        base_url_field: base_url,
        model_field: model,
    })
}

pub fn apply_partial(tool_name: &str, api_key: &str, base_url: &str, model: &str) -> AppResult<String> {
    let path = resolve_path(tool_name)?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| AppError::ConfigFile(format!("Cannot read {}: {}", path.display(), e)))?;
    let mut json: serde_json::Value = serde_json::from_str(&raw)?;

    if let Some(obj) = json.as_object_mut() {
        if obj.contains_key("apiKey") {
            obj.insert("apiKey".to_string(), serde_json::Value::String(api_key.to_string()));
        } else {
            obj.insert("api_key".to_string(), serde_json::Value::String(api_key.to_string()));
        }
        if obj.contains_key("baseUrl") {
            obj.insert("baseUrl".to_string(), serde_json::Value::String(base_url.to_string()));
        } else {
            obj.insert("base_url".to_string(), serde_json::Value::String(base_url.to_string()));
        }
        obj.insert("model".to_string(), serde_json::Value::String(model.to_string()));
    }

    serde_json::to_string_pretty(&json).map_err(|e| AppError::Serialization(e))
}

pub fn write_config_and_backup(
    app_handle: &tauri::AppHandle,
    tool_name: &str,
    subscription_name: &str,
    content: &str,
) -> AppResult<String> {
    let path = resolve_path(tool_name)?;

    if path.exists() {
        let current = std::fs::read_to_string(&path)?;
        let checksum = format!("{:x}", sha2::Sha256::digest(current.as_bytes()));
        let conn = db::open_connection(app_handle)?;
        insert_backup(&conn, tool_name, subscription_name, &path.to_string_lossy(), &current, &checksum)?;
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, content)?;

    Ok(Uuid::new_v4().to_string())
}

pub fn insert_backup(
    conn: &rusqlite::Connection,
    tool_name: &str,
    subscription_name: &str,
    file_path: &str,
    content: &str,
    checksum: &str,
) -> AppResult<()> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO config_backups (id, tool_name, subscription_name, file_path, content, checksum) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, tool_name, subscription_name, file_path, content, checksum],
    )?;
    Ok(())
}

fn resolve_path(tool_name: &str) -> AppResult<std::path::PathBuf> {
    let home = dirs_home()?;
    match tool_name {
        "claude_code" => Ok(home.join(".claude").join("claude.json")),
        "opencode" => Ok(home.join(".config").join("opencode").join("config.json")),
        "openclaw" => Ok(home.join(".config").join("openclaw").join("config.json")),
        "hermes_agent" => Ok(home.join(".config").join("hermes").join("config.json")),
        _ => Err(AppError::NotFound(format!("Unknown tool: {}", tool_name))),
    }
}

fn read_json_field(path: &std::path::Path, field: &str) -> AppResult<String> {
    let raw = std::fs::read_to_string(path)?;
    let json: serde_json::Value = serde_json::from_str(&raw)?;
    json.get(field)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::ConfigFile(format!("Field '{}' not found", field)))
}

fn dirs_home() -> AppResult<std::path::PathBuf> {
    directories::BaseDirs::new()
        .map(|bd| bd.home_dir().to_path_buf())
        .or_else(|| {
            std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .ok()
                .map(std::path::PathBuf::from)
        })
        .ok_or_else(|| AppError::ConfigFile("Cannot determine home directory".to_string()))
}

fn mask_value(s: &str) -> String {
    if s.len() <= 8 {
        return "****".to_string();
    }
    format!("{}****{}", &s[..4], &s[s.len() - 4..])
}
