use crate::error::AppResult;
use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::Emitter;
use uuid::Uuid;

#[derive(Debug, Serialize, Clone)]
pub struct ToolTerminalChunk {
    pub session_id: String,
    pub content: String,
    pub is_error: bool,
    pub is_complete: bool,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

static TERMINAL_SESSIONS: Lazy<Mutex<HashMap<String, TerminalSession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn run_tool_terminal_command(
    app_handle: tauri::AppHandle,
    command: String,
    working_directory: Option<String>,
) -> AppResult<String> {
    let session_id = Uuid::new_v4().to_string();
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
        rows: 30,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    })
        .map_err(|e| crate::error::AppError::Validation(e.to_string()))?;

    let mut cmd = CommandBuilder::new("zsh");
    cmd.arg("-lc");
    cmd.arg(&command);
    if let Some(wd) = &working_directory {
        if !wd.trim().is_empty() {
            cmd.cwd(wd);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| crate::error::AppError::Validation(e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| crate::error::AppError::Validation(e.to_string()))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| crate::error::AppError::Validation(e.to_string()))?;

    {
        let mut sessions = TERMINAL_SESSIONS
            .lock()
            .map_err(|_| crate::error::AppError::Validation("Terminal lock poisoned".to_string()))?;
        sessions.insert(
            session_id.clone(),
            TerminalSession {
                master: pair.master,
                writer,
                child,
            },
        );
    }

    let sid = session_id.clone();
    let app = app_handle.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(
                        "tool-terminal-output",
                        ToolTerminalChunk {
                            session_id: sid.clone(),
                            content: text,
                            is_error: false,
                            is_complete: false,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        let exit_code = {
            let mut sessions = match TERMINAL_SESSIONS.lock() {
                Ok(s) => s,
                Err(_) => return,
            };
            if let Some(mut sess) = sessions.remove(&sid) {
                sess.child.wait().ok().map(|s| s.exit_code())
            } else {
                None
            }
        };

        let _ = app.emit(
            "tool-terminal-output",
            ToolTerminalChunk {
                session_id: sid,
                content: format!(
                    "Process exited with code {}",
                    exit_code
                        .map(|c| c.to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                ),
                is_error: false,
                is_complete: true,
            },
        );
    });

    Ok(session_id)
}

#[tauri::command]
pub fn write_tool_terminal_input(session_id: String, input: String) -> AppResult<()> {
    let mut sessions = TERMINAL_SESSIONS
        .lock()
        .map_err(|_| crate::error::AppError::Validation("Terminal lock poisoned".to_string()))?;
    if let Some(sess) = sessions.get_mut(&session_id) {
        sess.writer.write_all(input.as_bytes())?;
        sess.writer.flush()?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_tool_terminal(session_id: String, cols: u16, rows: u16) -> AppResult<()> {
    let mut sessions = TERMINAL_SESSIONS
        .lock()
        .map_err(|_| crate::error::AppError::Validation("Terminal lock poisoned".to_string()))?;
    if let Some(sess) = sessions.get_mut(&session_id) {
        sess.master
            .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
            .map_err(|e| crate::error::AppError::Validation(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_tool_terminal(session_id: String) -> AppResult<()> {
    let mut sessions = TERMINAL_SESSIONS
        .lock()
        .map_err(|_| crate::error::AppError::Validation("Terminal lock poisoned".to_string()))?;
    if let Some(mut sess) = sessions.remove(&session_id) {
        let _ = sess.child.kill();
    }
    Ok(())
}
