use crate::error::{AppError, AppResult};
use serde::Serialize;
use tauri::Emitter;
use tracing::{info, error};

#[derive(Debug, Serialize, Clone)]
struct StreamChunk {
    conversation_id: String,
    content_delta: String,
    is_complete: bool,
    error: Option<String>,
}

fn extract_sse_data(line: &str) -> Option<&str> {
    let trimmed = line.trim_end_matches('\r');
    if trimmed.is_empty() || trimmed.starts_with(':') || trimmed.starts_with("event:") {
        return None;
    }
    if let Some(data) = trimmed.strip_prefix("data: ") {
        return Some(data);
    }
    if let Some(data) = trimmed.strip_prefix("data:") {
        return Some(data);
    }
    Some(trimmed)
}

/// Anthropic Messages：常见 POST 为 `.../v1/messages`；若已以 `/v1` 结尾则只补 `/messages`。
fn anthropic_messages_post_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return base_url.to_string();
    }
    if trimmed.ends_with("/v1/messages") {
        return trimmed.to_string();
    }
    if trimmed.ends_with("/v1") {
        return format!("{}/messages", trimmed);
    }
    format!("{}/v1/messages", trimmed)
}

/// OpenAI 兼容 chat：常见为 `.../v1/chat/completions`；若已含 `chat/completions` 则不改。
fn openai_chat_completions_post_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return base_url.to_string();
    }
    if trimmed.contains("/chat/completions") {
        return trimmed.to_string();
    }
    if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
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
    let resolved = if is_anthropic {
        anthropic_messages_post_url(base_url)
    } else {
        openai_chat_completions_post_url(base_url)
    };
    if resolved != base_url.trim() {
        info!(configured = %base_url, resolved = %resolved, api_format = %api_format, "Resolved chat API URL");
    }
    info!(model = %model, base_url = %base_url, api_format = %api_format, "Starting chat stream");

    if is_anthropic {
        stream_anthropic(
            app_handle,
            conversation_id,
            api_key,
            &resolved,
            model,
            system_prompt,
            history,
        )
        .await
    } else {
        stream_openai_compatible(
            app_handle,
            conversation_id,
            api_key,
            &resolved,
            model,
            system_prompt,
            history,
        )
        .await
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

    let mut sse_buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Stream(e.to_string()))?;
        sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_idx) = sse_buffer.find('\n') {
            let line = sse_buffer[..newline_idx].to_string();
            sse_buffer.drain(..=newline_idx);
            let Some(data) = extract_sse_data(&line) else {
                continue;
            };
            if data == "[DONE]" {
                continue;
            }

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
                    Some("message_stop") => {}
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
    if !sse_buffer.trim().is_empty() {
        if let Some(data) = extract_sse_data(&sse_buffer) {
            if data != "[DONE]" {
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some("content_block_delta") = event["type"].as_str() {
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

    let mut sse_buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Stream(e.to_string()))?;
        sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_idx) = sse_buffer.find('\n') {
            let line = sse_buffer[..newline_idx].to_string();
            sse_buffer.drain(..=newline_idx);
            let Some(data) = extract_sse_data(&line) else {
                continue;
            };
            if data == "[DONE]" {
                info!(chars = full_text.len(), chunks = chunk_count, "Stream complete");
                return Ok(full_text);
            }

            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
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
    if !sse_buffer.trim().is_empty() {
        if let Some(data) = extract_sse_data(&sse_buffer) {
            if data != "[DONE]" {
                if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(err) = event.get("error") {
                        let err_msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
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
    }

    info!(chars = full_text.len(), chunks = chunk_count, "OpenAI stream complete");
    Ok(full_text)
}
