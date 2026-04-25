use crate::error::{AppError, AppResult};
use serde::Serialize;
use tauri::Emitter;
use tracing::{info, error, warn};

#[derive(Debug, Serialize, Clone)]
struct StreamChunk {
    conversation_id: String,
    content_delta: String,
    is_complete: bool,
    error: Option<String>,
}

pub async fn stream_chat(
    app_handle: &tauri::AppHandle,
    conversation_id: String,
    api_key: &str,
    base_url: &str,
    model: &str,
    api_format: &str,
    system_prompt: Option<String>,
    history: Vec<(String, String)>,
) -> AppResult<String> {
    let is_anthropic = api_format == "anthropic";

    info!(model = %model, base_url = %base_url, api_format = %api_format, "Starting chat stream");

    if is_anthropic {
        stream_anthropic(app_handle, conversation_id, api_key, base_url, model, system_prompt, history).await
    } else {
        stream_openai_compatible(app_handle, conversation_id, api_key, base_url, model, system_prompt, history).await
    }
}

async fn stream_anthropic(
    app_handle: &tauri::AppHandle,
    conversation_id: String,
    api_key: &str,
    base_url: &str,
    model: &str,
    system_prompt: Option<String>,
    history: Vec<(String, String)>,
) -> AppResult<String> {
    let client = reqwest::Client::new();
    let url = base_url.to_string();
    info!(url = %url, model = %model, "Calling Anthropic API");

    #[derive(Debug, Serialize)]
    struct AnthropicMessage {
        role: String,
        content: Vec<AnthropicContent>,
    }
    #[derive(Debug, Serialize)]
    struct AnthropicContent {
        #[serde(rename = "type")]
        content_type: String,
        text: String,
    }
    #[derive(Debug, Serialize)]
    struct AnthropicRequest {
        model: String,
        max_tokens: u32,
        system: Option<String>,
        messages: Vec<AnthropicMessage>,
        stream: bool,
    }

    let messages: Vec<AnthropicMessage> = history
        .iter()
        .map(|(role, content)| AnthropicMessage {
            role: role.clone(),
            content: vec![AnthropicContent { content_type: "text".to_string(), text: content.clone() }],
        })
        .collect();

    let request = AnthropicRequest {
        model: model.to_string(),
        max_tokens: 8192,
        system: system_prompt,
        messages,
        stream: true,
    };

    let resp = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            error!(error = %e, url = %url, "Anthropic request failed");
            AppError::HttpRequest(format!("Request failed: {}. URL: {}", e, url))
        })?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        error!(status = %status, body = %body, "Anthropic API error");
        return Err(AppError::HttpRequest(format!("API {} ({})", status.as_u16(), body)));
    }

    let mut full_text = String::new();
    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut chunk_count = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Stream(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if line.is_empty() || line.starts_with(':') { continue; }
            let data = line.strip_prefix("data: ").unwrap_or(line);
            if data == "[DONE]" { continue; }

            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                match event["type"].as_str() {
                    Some("content_block_delta") => {
                        if let Some(delta) = event["delta"]["text"].as_str() {
                            full_text.push_str(delta);
                            chunk_count += 1;
                            let _ = app_handle.emit("chat-stream-chunk", StreamChunk {
                                conversation_id: conversation_id.clone(),
                                content_delta: delta.to_string(),
                                is_complete: false,
                                error: None,
                            });
                        }
                    }
                    Some("message_stop") => {
                        let _ = app_handle.emit("chat-stream-chunk", StreamChunk {
                            conversation_id: conversation_id.clone(),
                            content_delta: String::new(),
                            is_complete: true,
                            error: None,
                        });
                    }
                    Some("error") => {
                        let err_msg = event["error"]["message"].as_str().unwrap_or("unknown").to_string();
                        error!(error = %err_msg, "Anthropic stream error");
                        return Err(AppError::HttpRequest(err_msg));
                    }
                    _ => {}
                }
            }
        }
    }

    info!(chars = full_text.len(), chunks = chunk_count, "Anthropic stream complete");
    Ok(full_text)
}

async fn stream_openai_compatible(
    app_handle: &tauri::AppHandle,
    conversation_id: String,
    api_key: &str,
    base_url: &str,
    model: &str,
    system_prompt: Option<String>,
    history: Vec<(String, String)>,
) -> AppResult<String> {
    let client = reqwest::Client::new();
    let url = base_url.to_string();
    info!(url = %url, model = %model, "Calling OpenAI-compatible API");

    #[derive(Debug, Serialize)]
    struct OpenAIMessage { role: String, content: String }
    #[derive(Debug, Serialize)]
    struct OpenAIRequest {
        model: String,
        messages: Vec<OpenAIMessage>,
        stream: bool,
    }

    let mut messages: Vec<OpenAIMessage> = Vec::new();
    if let Some(sp) = system_prompt {
        messages.push(OpenAIMessage { role: "system".to_string(), content: sp });
    }
    for (role, content) in history {
        let mapped = if role == "assistant" { "assistant" } else { "user" };
        messages.push(OpenAIMessage { role: mapped.to_string(), content });
    }

    let request = OpenAIRequest { model: model.to_string(), messages, stream: true };

    info!(url = %url, model = %model, msg_count = request.messages.len(), "Sending OpenAI request");

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            error!(error = %e, url = %url, "OpenAI request failed");
            AppError::HttpRequest(format!("Request failed: {}. URL: {}", e, url))
        })?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        error!(status = %status, body = %body, "OpenAI API error");
        return Err(AppError::HttpRequest(format!("API {}: {}", status.as_u16(), body)));
    }

    let mut full_text = String::new();
    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut chunk_count = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Stream(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if line.is_empty() { continue; }
            let data = line.strip_prefix("data: ").unwrap_or(line);
            if data == "[DONE]" {
                let _ = app_handle.emit("chat-stream-chunk", StreamChunk {
                    conversation_id: conversation_id.clone(),
                    content_delta: String::new(),
                    is_complete: true,
                    error: None,
                });
                info!(chars = full_text.len(), chunks = chunk_count, "Stream complete");
                return Ok(full_text);
            }

            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                // Check for error in response
                if let Some(err) = event.get("error") {
                    let err_msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
                    error!(error = %err_msg, "API stream error");
                    return Err(AppError::HttpRequest(err_msg.to_string()));
                }
                if let Some(choices) = event["choices"].as_array() {
                    if let Some(delta) = choices[0]["delta"]["content"].as_str() {
                        full_text.push_str(delta);
                        chunk_count += 1;
                        let _ = app_handle.emit("chat-stream-chunk", StreamChunk {
                            conversation_id: conversation_id.clone(),
                            content_delta: delta.to_string(),
                            is_complete: false,
                            error: None,
                        });
                    }
                }
            }
        }
    }

    info!(chars = full_text.len(), chunks = chunk_count, "OpenAI stream complete");
    Ok(full_text)
}
