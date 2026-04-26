use crate::commands::endpoint::{self, SubscriptionEndpoint};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::services::config_file::{self, BackupRefs};
use crate::services::{crypto, AppState};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use tauri::{Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolPreset {
    pub id: String,
    pub tool_name: String,
    pub subscription_id: String,
    pub subscription_name: String,
    pub endpoint_id: Option<String>,
    pub endpoint_label: Option<String>,
    pub api_format: String,
    pub base_url: String,
    pub model: String,
    pub rendered_json: String,
    pub is_overridden: bool,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ToolActiveStateView {
    pub tool_name: String,
    pub active_subscription_id: Option<String>,
    pub active_subscription_name: Option<String>,
    pub active_endpoint_id: Option<String>,
    pub active_endpoint_label: Option<String>,
    pub active_preset_id: Option<String>,
    pub applied_at: Option<String>,
    pub live_json: Option<String>,
    pub preset_rendered_json: Option<String>,
    /// True iff `live_json` matches `preset_rendered_json` byte-for-byte after parsing.
    pub in_sync: bool,
    /// True iff the active preset has been manually overridden.
    pub preset_overridden: bool,
}

fn render_for_endpoint(
    tool_name: &str,
    api_key: &str,
    endpoint: &SubscriptionEndpoint,
    claude_subscription_id: Option<&str>,
) -> AppResult<String> {
    config_file::apply_partial(
        tool_name,
        api_key,
        &endpoint.base_url,
        &endpoint.model,
        claude_subscription_id,
    )
}

fn endpoint_label(ep: &SubscriptionEndpoint) -> String {
    let proto = if ep.api_format == "anthropic" { "Anthropic" } else { "OpenAI" };
    if ep.model.is_empty() {
        proto.to_string()
    } else {
        format!("{} · {}", proto, ep.model)
    }
}

fn load_subscription_name(conn: &rusqlite::Connection, sub_id: &str) -> AppResult<String> {
    Ok(conn.query_row(
        "SELECT name FROM subscriptions WHERE id = ?1",
        rusqlite::params![sub_id],
        |row| row.get::<_, String>(0),
    )?)
}

fn load_endpoint(
    conn: &rusqlite::Connection,
    endpoint_id: Option<&str>,
    subscription_id: &str,
) -> AppResult<SubscriptionEndpoint> {
    endpoint::resolve_endpoint(conn, subscription_id, endpoint_id)?
        .ok_or_else(|| AppError::NotFound(format!("subscription {} has no endpoints", subscription_id)))
}

fn json_equal(a: &str, b: &str) -> bool {
    let lhs: Result<serde_json::Value, _> = serde_json::from_str(a);
    let rhs: Result<serde_json::Value, _> = serde_json::from_str(b);
    match (lhs, rhs) {
        (Ok(x), Ok(y)) => x == y,
        _ => a.trim() == b.trim(),
    }
}

#[tauri::command]
pub fn list_tool_presets(
    app_handle: tauri::AppHandle,
    tool_name: String,
) -> AppResult<Vec<ToolPreset>> {
    let conn = db::open_connection(&app_handle)?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.tool_name, p.subscription_id, s.name, p.endpoint_id, \
                e.api_format, e.base_url, e.model, \
                p.rendered_json, p.is_overridden, p.notes, p.created_at, p.updated_at \
         FROM tool_subscription_configs p \
         JOIN subscriptions s ON s.id = p.subscription_id \
         LEFT JOIN subscription_endpoints e ON e.id = p.endpoint_id \
         WHERE p.tool_name = ?1 \
         ORDER BY p.updated_at DESC",
    )?;
    let rows = stmt
        .query_map([&tool_name], |row| {
            let api_format: Option<String> = row.get(5)?;
            let base_url: Option<String> = row.get(6)?;
            let model: Option<String> = row.get(7)?;
            let endpoint_id: Option<String> = row.get(4)?;
            let label = match (&api_format, &model) {
                (Some(fmt), Some(m)) if !m.is_empty() => Some(format!(
                    "{} · {}",
                    if fmt == "anthropic" { "Anthropic" } else { "OpenAI" },
                    m
                )),
                (Some(fmt), _) => Some(if fmt == "anthropic" { "Anthropic".to_string() } else { "OpenAI".to_string() }),
                _ => None,
            };
            Ok(ToolPreset {
                id: row.get(0)?,
                tool_name: row.get(1)?,
                subscription_id: row.get(2)?,
                subscription_name: row.get(3)?,
                endpoint_id,
                endpoint_label: label,
                api_format: api_format.unwrap_or_default(),
                base_url: base_url.unwrap_or_default(),
                model: model.unwrap_or_default(),
                rendered_json: row.get(8)?,
                is_overridden: row.get::<_, i32>(9)? != 0,
                notes: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Upsert a `(tool, subscription, endpoint)` preset. The render uses the resolved endpoint's
/// base_url/model along with the subscription's API key. If a preset for the same tuple
/// already exists and is overridden, we leave its `rendered_json` untouched and only refresh
/// the metadata, so user edits aren't blown away on accidental re-render.
#[tauri::command]
pub fn render_tool_preset(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    tool_name: String,
    subscription_id: String,
    endpoint_id: Option<String>,
) -> AppResult<ToolPreset> {
    let conn = db::open_connection(&app_handle)?;

    let api_key_encrypted: String = conn.query_row(
        "SELECT api_key_encrypted FROM subscriptions WHERE id = ?1",
        rusqlite::params![subscription_id],
        |row| row.get(0),
    )?;
    let api_key = crypto::decrypt(&api_key_encrypted, &state.crypto_key)?;
    let endpoint = load_endpoint(&conn, endpoint_id.as_deref(), &subscription_id)?;
    let claude_sid = (tool_name == "claude_code").then_some(subscription_id.as_str());
    let rendered = render_for_endpoint(&tool_name, &api_key, &endpoint, claude_sid)?;

    let existing: Option<(String, bool)> = conn
        .query_row(
            "SELECT id, is_overridden FROM tool_subscription_configs \
             WHERE tool_name = ?1 AND subscription_id = ?2 AND endpoint_id IS ?3",
            rusqlite::params![tool_name, subscription_id, endpoint.id],
            |row| Ok((row.get(0)?, row.get::<_, i32>(1)? != 0)),
        )
        .ok();

    let preset_id = match existing {
        Some((existing_id, overridden)) => {
            if overridden {
                conn.execute(
                    "UPDATE tool_subscription_configs SET updated_at = datetime('now') WHERE id = ?1",
                    rusqlite::params![existing_id],
                )?;
            } else {
                conn.execute(
                    "UPDATE tool_subscription_configs SET rendered_json = ?1, updated_at = datetime('now') WHERE id = ?2",
                    rusqlite::params![rendered, existing_id],
                )?;
            }
            existing_id
        }
        None => {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO tool_subscription_configs (id, tool_name, subscription_id, endpoint_id, rendered_json) \
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![id, tool_name, subscription_id, endpoint.id, rendered],
            )?;
            id
        }
    };

    let presets = list_tool_presets(app_handle.clone(), tool_name)?;
    presets
        .into_iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| AppError::NotFound(format!("preset {} just rendered but missing", preset_id)))
}

#[tauri::command]
pub fn delete_tool_preset(app_handle: tauri::AppHandle, preset_id: String) -> AppResult<()> {
    let conn = db::open_connection(&app_handle)?;
    conn.execute(
        "DELETE FROM tool_subscription_configs WHERE id = ?1",
        rusqlite::params![preset_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn override_tool_preset(
    app_handle: tauri::AppHandle,
    preset_id: String,
    raw_json: String,
) -> AppResult<ToolPreset> {
    serde_json::from_str::<serde_json::Value>(&raw_json)
        .map_err(|e| AppError::Validation(format!("Invalid JSON: {}", e)))?;

    let conn = db::open_connection(&app_handle)?;
    conn.execute(
        "UPDATE tool_subscription_configs SET rendered_json = ?1, is_overridden = 1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![raw_json, preset_id],
    )?;

    let tool_name: String = conn.query_row(
        "SELECT tool_name FROM tool_subscription_configs WHERE id = ?1",
        rusqlite::params![preset_id],
        |row| row.get(0),
    )?;
    let presets = list_tool_presets(app_handle, tool_name)?;
    presets
        .into_iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| AppError::NotFound(format!("preset {} not found", preset_id)))
}

/// Drop the override flag and re-render from the subscription source.
#[tauri::command]
pub fn discard_preset_override(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    preset_id: String,
) -> AppResult<ToolPreset> {
    let (tool_name, subscription_id, endpoint_id): (String, String, Option<String>) = {
        let conn = db::open_connection(&app_handle)?;
        conn.query_row(
            "SELECT tool_name, subscription_id, endpoint_id FROM tool_subscription_configs WHERE id = ?1",
            rusqlite::params![preset_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?
    };
    {
        let conn = db::open_connection(&app_handle)?;
        conn.execute(
            "UPDATE tool_subscription_configs SET is_overridden = 0 WHERE id = ?1",
            rusqlite::params![preset_id],
        )?;
    }
    render_tool_preset(app_handle, state, tool_name, subscription_id, endpoint_id)
}

#[tauri::command]
pub fn apply_tool_preset(
    app_handle: tauri::AppHandle,
    preset_id: String,
) -> AppResult<ToolActiveStateView> {
    let (tool_name, subscription_id, endpoint_id, rendered_json): (
        String,
        String,
        Option<String>,
        String,
    ) = {
        let conn = db::open_connection(&app_handle)?;
        conn.query_row(
            "SELECT tool_name, subscription_id, endpoint_id, rendered_json FROM tool_subscription_configs WHERE id = ?1",
            rusqlite::params![preset_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?
    };

    let sub_name = {
        let conn = db::open_connection(&app_handle)?;
        load_subscription_name(&conn, &subscription_id)?
    };

    let claude_sid = (tool_name == "claude_code").then_some(subscription_id.as_str());
    let refs = BackupRefs {
        subscription_id: Some(subscription_id.as_str()),
        endpoint_id: endpoint_id.as_deref(),
        preset_id: Some(preset_id.as_str()),
    };
    config_file::write_config_and_backup(&app_handle, &tool_name, &sub_name, &refs, &rendered_json)?;

    {
        let conn = db::open_connection(&app_handle)?;
        conn.execute(
            "INSERT INTO tool_active_state (tool_name, active_subscription_id, active_endpoint_id, active_preset_id, applied_at) \
             VALUES (?1, ?2, ?3, ?4, datetime('now')) \
             ON CONFLICT(tool_name) DO UPDATE SET \
                active_subscription_id = excluded.active_subscription_id, \
                active_endpoint_id     = excluded.active_endpoint_id, \
                active_preset_id       = excluded.active_preset_id, \
                applied_at             = excluded.applied_at",
            rusqlite::params![tool_name, subscription_id, endpoint_id, preset_id],
        )?;
    }
    let _ = claude_sid;
    get_tool_active(app_handle, tool_name)
}

#[tauri::command]
pub fn get_tool_active(
    app_handle: tauri::AppHandle,
    tool_name: String,
) -> AppResult<ToolActiveStateView> {
    let conn = db::open_connection(&app_handle)?;
    let active: Option<(Option<String>, Option<String>, Option<String>, String)> = conn
        .query_row(
            "SELECT active_subscription_id, active_endpoint_id, active_preset_id, applied_at \
             FROM tool_active_state WHERE tool_name = ?1",
            rusqlite::params![tool_name],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();

    let live_json = match config_file::read_config(&tool_name) {
        Ok(content) => Some(content.raw_json),
        Err(_) => None,
    };

    let (active_subscription_id, active_endpoint_id, active_preset_id, applied_at) = active
        .map(|(s, e, p, t)| (s, e, p, Some(t)))
        .unwrap_or((None, None, None, None));

    let mut subscription_name = None;
    let mut endpoint_label_str = None;
    if let Some(ref sid) = active_subscription_id {
        subscription_name = conn
            .query_row(
                "SELECT name FROM subscriptions WHERE id = ?1",
                rusqlite::params![sid],
                |row| row.get::<_, String>(0),
            )
            .ok();
    }
    if let Some(ref eid) = active_endpoint_id {
        if let Ok(ep) = endpoint::resolve_endpoint(&conn, active_subscription_id.as_deref().unwrap_or(""), Some(eid))
        {
            if let Some(ep) = ep {
                endpoint_label_str = Some(endpoint_label(&ep));
            }
        }
    }

    let mut preset_rendered_json = None;
    let mut preset_overridden = false;
    if let Some(ref pid) = active_preset_id {
        if let Ok((rendered, overridden)) = conn.query_row(
            "SELECT rendered_json, is_overridden FROM tool_subscription_configs WHERE id = ?1",
            rusqlite::params![pid],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)? != 0)),
        ) {
            preset_rendered_json = Some(rendered);
            preset_overridden = overridden;
        }
    }

    let in_sync = match (&live_json, &preset_rendered_json) {
        (Some(l), Some(p)) => json_equal(l, p),
        _ => false,
    };

    Ok(ToolActiveStateView {
        tool_name,
        active_subscription_id,
        active_subscription_name: subscription_name,
        active_endpoint_id,
        active_endpoint_label: endpoint_label_str,
        active_preset_id,
        applied_at,
        live_json,
        preset_rendered_json,
        in_sync,
        preset_overridden,
    })
}

/// Re-render every non-overridden preset attached to a subscription. Returns the list of
/// preset ids whose `rendered_json` changed so callers can decide whether to notify the user
/// to re-apply (e.g. when the active tool's preset is among them).
#[tauri::command]
pub fn resync_subscription_presets(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    subscription_id: String,
) -> AppResult<Vec<String>> {
    let conn = db::open_connection(&app_handle)?;
    let api_key_encrypted: String = conn.query_row(
        "SELECT api_key_encrypted FROM subscriptions WHERE id = ?1",
        rusqlite::params![subscription_id],
        |row| row.get(0),
    )?;
    let api_key = crypto::decrypt(&api_key_encrypted, &state.crypto_key)?;

    let mut stmt = conn.prepare(
        "SELECT id, tool_name, endpoint_id, rendered_json, is_overridden \
         FROM tool_subscription_configs WHERE subscription_id = ?1",
    )?;
    let presets: Vec<(String, String, Option<String>, String, bool)> = stmt
        .query_map([&subscription_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get::<_, i32>(4)? != 0,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut changed = Vec::new();
    for (preset_id, tool_name, endpoint_id, prev_json, is_overridden) in presets {
        if is_overridden {
            continue;
        }
        let endpoint = match load_endpoint(&conn, endpoint_id.as_deref(), &subscription_id) {
            Ok(ep) => ep,
            Err(_) => continue,
        };
        let claude_sid = (tool_name == "claude_code").then_some(subscription_id.as_str());
        let new_json = render_for_endpoint(&tool_name, &api_key, &endpoint, claude_sid)?;
        if !json_equal(&prev_json, &new_json) {
            conn.execute(
                "UPDATE tool_subscription_configs SET rendered_json = ?1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![new_json, preset_id],
            )?;
            changed.push(preset_id);
        }
    }

    if !changed.is_empty() {
        let _ = app_handle.emit("tool-preset-resynced", &changed);
    }

    Ok(changed)
}

#[tauri::command]
pub fn list_tool_active_states(
    app_handle: tauri::AppHandle,
) -> AppResult<Vec<ToolActiveStateView>> {
    let tool_names: Vec<String> = {
        let conn = db::open_connection(&app_handle)?;
        let mut stmt = conn.prepare("SELECT tool_name FROM tool_active_state")?;
        stmt.query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?
    };
    let mut out = Vec::with_capacity(tool_names.len());
    for tool in tool_names {
        if let Ok(view) = get_tool_active(app_handle.clone(), tool) {
            out.push(view);
        }
    }
    Ok(out)
}

/// Convenience for the live JSON checksum, used in UI badges.
#[allow(dead_code)]
pub fn live_checksum(content: &str) -> String {
    format!("{:x}", sha2::Sha256::digest(content.as_bytes()))
}
