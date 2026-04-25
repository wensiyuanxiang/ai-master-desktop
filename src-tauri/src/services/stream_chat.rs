use crate::error::{AppError, AppResult};
use serde::Serialize;
use tauri::Emitter;

#[derive(Debug, Serialize, Clone)]
struct StreamChunk {
    conversation_id: String,
    content_delta: String,
    is_complete: bool,
    error: Option<String>,
}

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

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

pub async fn stream_chat(
    app_handle: &tauri::AppHandle,
    conversation_id: String,
    api_key: &str,
    base_url: &str,
    model: &str,
    system_prompt: Option<String>,
    history: Vec<(String, String)>,
) -> AppResult<String> {
    let is_anthropic = base_url.contains("anthropic.com") || base_url.contains("claude");

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
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

    let messages: Vec<AnthropicMessage> = history
        .iter()
        .map(|(role, content)| AnthropicMessage {
            role: role.clone(),
            content: vec![AnthropicContent {
                content_type: "text".to_string(),
                text: content.clone(),
            }],
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
        .map_err(|e| AppError::HttpRequest(format!("API request failed: {}. URL: {}", e, url)))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::HttpRequest(format!("API error {}: {}", status.as_u16(), body)));
    }

    let mut full_text = String::new();

    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
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
                    _ => {}
                }
            }
        }
    }

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
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));

    let mut messages: Vec<OpenAIMessage> = Vec::new();
    if let Some(sp) = system_prompt {
        messages.push(OpenAIMessage {
            role: "system".to_string(),
            content: sp,
        });
    }
    for (role, content) in history {
        let mapped_role = if role == "assistant" { "assistant" } else { "user" };
        messages.push(OpenAIMessage { role: mapped_role.to_string(), content });
    }

    let request = OpenAIRequest {
        model: model.to_string(),
        messages,
        stream: true,
    };

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            AppError::HttpRequest(format!("API request failed: {}. URL: {}", e, url))
        })?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::HttpRequest(format!("API error {}: {}", status.as_u16(), body)));
    }

    let mut full_text = String::new();

    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
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
                continue;
            }

            if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(choices) = event["choices"].as_array() {
                    if let Some(delta) = choices[0]["delta"]["content"].as_str() {
                        full_text.push_str(delta);
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

    Ok(full_text)
}
