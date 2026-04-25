use crate::db;
use crate::error::{AppError, AppResult};
use crate::services::AppState;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamChunk {
    pub conversation_id: String,
    pub content_delta: String,
    pub is_complete: bool,
    pub error: Option<String>,
}

fn row_to_message(row: &rusqlite::Row) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
    })
}

#[tauri::command]
pub fn list_messages(
    app_handle: tauri::AppHandle,
    conversation_id: String,
) -> AppResult<Vec<Message>> {
    let conn = db::open_connection(&app_handle)?;
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, created_at \
         FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC"
    )?;
    let messages = stmt
        .query_map([&conversation_id], row_to_message)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(messages)
}

#[derive(Clone)]
struct ChatContext {
    api_key: String,
    base_url: String,
    model: String,
    system_prompt: Option<String>,
    history: Vec<(String, String)>,
}

#[tauri::command]
pub async fn send_message(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
) -> AppResult<Message> {
    // Phase 1: DB operations (synchronous, no await)
    let ctx = {
        let conn = db::open_connection(&app_handle)?;
        let user_msg_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content) VALUES (?1, ?2, 'user', ?3)",
            rusqlite::params![user_msg_id, conversation_id, content],
        )?;
        conn.execute(
            "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![conversation_id],
        )?;

        // Get subscription info
        let subscription_id: Option<String> = conn
            .query_row(
                "SELECT subscription_id FROM conversations WHERE id = ?1",
                [&conversation_id],
                |row| row.get::<_, Option<String>>(0),
            )?;
        let subscription_id = subscription_id
            .ok_or_else(|| AppError::Validation("No subscription selected".to_string()))?;

        let (api_key_encrypted, base_url, model): (String, String, String) = conn.query_row(
            "SELECT api_key_encrypted, base_url, model FROM subscriptions WHERE id = ?1",
            [&subscription_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        let api_key = crate::services::crypto::decrypt(&api_key_encrypted, &state.crypto_key)?;

        // Get role system prompt
        let role_id: Option<String> = conn
            .query_row(
                "SELECT role_id FROM conversations WHERE id = ?1",
                [&conversation_id],
                |row| row.get::<_, String>(0),
            )
            .ok();

        let system_prompt = if let Some(rid) = role_id {
            conn.query_row(
                "SELECT system_prompt FROM roles WHERE id = ?1",
                [&rid],
                |row| row.get::<_, String>(0),
            )
            .ok()
        } else {
            None
        };

        // Get history messages (excluding the one just inserted)
        let mut hist_stmt = conn.prepare(
            "SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC"
        )?;
        let history: Vec<(String, String)> = hist_stmt
            .query_map([&conversation_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        ChatContext {
            api_key,
            base_url,
            model,
            system_prompt,
            history,
        }
    }; // conn dropped here - no DB references held across await

    // Phase 2: Streaming (async, no DB references)
    let stream_result = crate::services::stream_chat::stream_chat(
        &app_handle,
        conversation_id.clone(),
        &ctx.api_key,
        &ctx.base_url,
        &ctx.model,
        ctx.system_prompt,
        ctx.history,
    )
    .await;

    match stream_result {
        Ok(full_response) => {
            let conn = db::open_connection(&app_handle)?;
            let assistant_msg_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content) VALUES (?1, ?2, 'assistant', ?3)",
                rusqlite::params![assistant_msg_id, conversation_id, full_response],
            )?;
            conn.execute(
                "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?1",
                rusqlite::params![conversation_id],
            )?;

            // Auto-generate title from first exchange
            let count: i32 = conn.query_row(
                "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1 AND role = 'assistant'",
                [&conversation_id],
                |row| row.get::<_, i32>(0),
            )?;
            if count == 1 {
                let title = full_response
                    .chars()
                    .take(50)
                    .collect::<String>()
                    .replace('\n', " ")
                    .trim()
                    .to_string();
                let title = if title.is_empty() { "New Chat".to_string() } else { title };
                conn.execute(
                    "UPDATE conversations SET title = ?1 WHERE id = ?2",
                    rusqlite::params![title, conversation_id],
                )?;
            }

            let msg = conn.query_row(
                "SELECT id, conversation_id, role, content, created_at FROM messages WHERE id = ?1",
                [&assistant_msg_id],
                row_to_message,
            )?;
            Ok(msg)
        }
        Err(e) => {
            let _ = app_handle.emit(
                "chat-stream-chunk",
                StreamChunk {
                    conversation_id: conversation_id.clone(),
                    content_delta: String::new(),
                    is_complete: true,
                    error: Some(e.to_string()),
                },
            );
            Err(e)
        }
    }
}
