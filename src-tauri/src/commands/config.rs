use crate::db;
use crate::error::{AppError, AppResult};
use crate::services::{AppState, config_file};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolConfigInfo {
    pub tool_name: String,
    pub display_name: String,
    pub config_path: String,
    pub exists: bool,
    pub current_subscription_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigFileContent {
    pub raw_json: String,
    pub api_key_field: Option<String>,
    pub base_url_field: Option<String>,
    pub model_field: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigWriteResult {
    pub success: bool,
    pub backup_id: Option<String>,
    pub content_written: String,
}

#[tauri::command]
pub fn detect_tool_configs(app_handle: tauri::AppHandle) -> AppResult<Vec<ToolConfigInfo>> {
    let _ = &app_handle;
    config_file::detect_tool_configs()
}

#[tauri::command]
pub fn read_config_file(tool_name: String) -> AppResult<ConfigFileContent> {
    config_file::read_config(&tool_name)
}

#[tauri::command]
pub fn write_config_partial(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    tool_name: String,
    subscription_id: String,
) -> AppResult<ConfigWriteResult> {
    let conn = db::open_connection(&app_handle)?;

    let (api_key_encrypted, base_url, model, sub_name): (String, String, String, String) = conn
        .query_row(
            "SELECT api_key_encrypted, base_url, model, name FROM subscriptions WHERE id = ?1",
            [&subscription_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

    let api_key = crate::services::crypto::decrypt(&api_key_encrypted, &state.crypto_key)?;
    let new_content = config_file::apply_partial(&tool_name, &api_key, &base_url, &model)?;
    let backup_id = config_file::write_config_and_backup(&app_handle, &tool_name, &sub_name, &new_content)?;

    Ok(ConfigWriteResult {
        success: true,
        backup_id: Some(backup_id),
        content_written: new_content,
    })
}

#[tauri::command]
pub fn write_config_full(
    app_handle: tauri::AppHandle,
    tool_name: String,
    content: String,
) -> AppResult<ConfigWriteResult> {
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| AppError::Validation(format!("Invalid JSON: {}", e)))?;

    let backup_id = config_file::write_config_and_backup(&app_handle, &tool_name, "", &content)?;

    Ok(ConfigWriteResult {
        success: true,
        backup_id: Some(backup_id),
        content_written: content,
    })
}

#[tauri::command]
pub fn preview_config(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    tool_name: String,
    subscription_id: String,
) -> AppResult<String> {
    let conn = db::open_connection(&app_handle)?;

    let (api_key_encrypted, base_url, model): (String, String, String) = conn
        .query_row(
            "SELECT api_key_encrypted, base_url, model FROM subscriptions WHERE id = ?1",
            [&subscription_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

    let api_key = crate::services::crypto::decrypt(&api_key_encrypted, &state.crypto_key)?;
    config_file::apply_partial(&tool_name, &api_key, &base_url, &model)
}
