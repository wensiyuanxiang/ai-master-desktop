use crate::commands::config::{ConfigFileContent, ToolConfigInfo};
use crate::db;
use crate::error::{AppError, AppResult};
use chrono::Utc;
use sha2::Digest;
use uuid::Uuid;

const KNOWN_TOOLS: &[(&str, &str, &[&str])] = &[
    ("claude_code", "Claude Code", &["claude", "claude.json"]),
    ("opencode", "OpenCode", &["opencode", "config.json"]),
    ("openclaw", "OpenClaw", &["openclaw", "config.json"]),
    ("hermes_agent", "Hermes Agent", &["hermes", "config.json"]),
];

pub fn detect_tool_configs() -> AppResult<Vec<ToolConfigInfo>> {
    let mut tools = Vec::new();
    for (tool_name, display_name, _path_parts) in KNOWN_TOOLS {
        let config_path = resolve_path(tool_name)?;
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
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) if tool_name == "claude_code" => "{}".to_string(),
        Err(e) => {
            return Err(AppError::ConfigFile(format!(
                "Cannot read {}: {}",
                path.display(),
                e
            )));
        }
    };

    let json: serde_json::Value = serde_json::from_str(&raw)?;

    let (api_key, base_url, model) = if tool_name == "claude_code" {
        let env = json.get("env").and_then(|v| v.as_object());
        let api_key = env
            .and_then(|e| {
                e.get("ANTHROPIC_AUTH_TOKEN")
                    .or_else(|| e.get("ANTHROPIC_API_KEY"))
            })
            .and_then(|v| v.as_str())
            .map(mask_value);
        let base_url = env
            .and_then(|e| e.get("ANTHROPIC_BASE_URL"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let model = env
            .and_then(|e| e.get("ANTHROPIC_MODEL"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        (api_key, base_url, model)
    } else {
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
        let model = json
            .get("model")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        (api_key, base_url, model)
    };

    Ok(ConfigFileContent {
        raw_json: raw,
        api_key_field: api_key,
        base_url_field: base_url,
        model_field: model,
    })
}

/// Per-subscription canonical JSON (merge base for partial apply; written before live `settings.json`).
pub fn claude_package_path(subscription_id: &str) -> AppResult<std::path::PathBuf> {
    Ok(claude_app_dir()?.join("packages").join(format!("{}.json", subscription_id)))
}

fn claude_app_dir() -> AppResult<std::path::PathBuf> {
    Ok(dirs_home()?.join(".claude").join("ai-master"))
}

fn claude_backup_dir() -> AppResult<std::path::PathBuf> {
    Ok(dirs_home()?.join(".claude").join("backup"))
}

pub fn apply_partial(
    tool_name: &str,
    api_key: &str,
    base_url: &str,
    model: &str,
    claude_subscription_id: Option<&str>,
) -> AppResult<String> {
    let path = resolve_path(tool_name)?;

    if tool_name == "claude_code" {
        // Merge base: this package's last snapshot → else current live settings → else {}.
        let raw = match claude_subscription_id {
            Some(sid) => {
                let pkg = claude_package_path(sid)?;
                if pkg.exists() {
                    std::fs::read_to_string(&pkg).map_err(|e| {
                        AppError::ConfigFile(format!("Cannot read {}: {}", pkg.display(), e))
                    })?
                } else if path.exists() {
                    std::fs::read_to_string(&path).map_err(|e| {
                        AppError::ConfigFile(format!("Cannot read {}: {}", path.display(), e))
                    })?
                } else {
                    "{}".to_string()
                }
            }
            None => std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string()),
        };
        let mut json: serde_json::Value = serde_json::from_str(&raw)?;
        let root = json.as_object_mut().ok_or_else(|| {
            AppError::ConfigFile("Claude Code settings root must be a JSON object".to_string())
        })?;
        let env_entry = root
            .entry("env".to_string())
            .or_insert_with(|| serde_json::json!({}));
        let env = env_entry.as_object_mut().ok_or_else(|| {
            AppError::ConfigFile("Claude Code \"env\" must be a JSON object".to_string())
        })?;
        env.insert(
            "ANTHROPIC_AUTH_TOKEN".to_string(),
            serde_json::Value::String(api_key.to_string()),
        );
        env.insert(
            "ANTHROPIC_API_KEY".to_string(),
            serde_json::Value::String(api_key.to_string()),
        );
        env.insert(
            "ANTHROPIC_BASE_URL".to_string(),
            serde_json::Value::String(base_url.to_string()),
        );
        env.insert(
            "ANTHROPIC_MODEL".to_string(),
            serde_json::Value::String(model.to_string()),
        );
        return serde_json::to_string_pretty(&json).map_err(AppError::Serialization);
    }

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

    serde_json::to_string_pretty(&json).map_err(AppError::Serialization)
}

pub fn write_config_and_backup(
    app_handle: &tauri::AppHandle,
    tool_name: &str,
    subscription_name: &str,
    subscription_id: Option<&str>,
    content: &str,
) -> AppResult<String> {
    let path = resolve_path(tool_name)?;

    if tool_name == "claude_code" {
        if let Some(sid) = subscription_id {
            // 1) Canonical copy for this 套餐
            let pkg = claude_package_path(sid)?;
            if let Some(parent) = pkg.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&pkg, content)?;
            // 2) File backup of current live settings (suffix timestamp)
            if path.exists() {
                let backup_dir = claude_backup_dir()?;
                std::fs::create_dir_all(&backup_dir)?;
                let ts = Utc::now().format("%Y%m%dT%H%M%S");
                let backup_name = format!("settings.before-apply.{}.{}.json", ts, Uuid::new_v4());
                let backup_path = backup_dir.join(&backup_name);
                std::fs::copy(&path, &backup_path).map_err(|e| {
                    AppError::ConfigFile(format!(
                        "Cannot copy live settings to {}: {}",
                        backup_path.display(),
                        e
                    ))
                })?;
            }
        } else {
            // Full JSON edit without a subscription id: still backup live settings.json
            if path.exists() {
                let backup_dir = claude_backup_dir()?;
                std::fs::create_dir_all(&backup_dir)?;
                let ts = Utc::now().format("%Y%m%dT%H%M%S");
                let backup_path = backup_dir.join(format!(
                    "settings.before-full-edit.{}.{}.json",
                    ts,
                    Uuid::new_v4()
                ));
                std::fs::copy(&path, &backup_path).map_err(|e| {
                    AppError::ConfigFile(format!(
                        "Cannot backup settings to {}: {}",
                        backup_path.display(),
                        e
                    ))
                })?;
            }
        }
    }

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
        // Official Claude Code: env vars live under ~/.claude/settings.json → "env".
        // (Writing claude.json here never affected the CLI the user actually runs.)
        "claude_code" => Ok(home.join(".claude").join("settings.json")),
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
