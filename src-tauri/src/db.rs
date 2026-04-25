use crate::error::AppResult;
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::Manager;

const MIGRATION_SQL: &str = "
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    base_url TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    start_date TEXT,
    end_date TEXT,
    api_format TEXT NOT NULL DEFAULT 'openai',
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
    working_directory TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config_backups (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL,
    subscription_name TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
";

const SEED_PROVIDERS_SQL: &str = "
INSERT OR IGNORE INTO providers (id, name) VALUES
    ('anthropic', 'Anthropic'),
    ('openai', 'OpenAI'),
    ('google', 'Google'),
    ('zhipu', 'Zhipu (GLM)'),
    ('deepseek', 'DeepSeek'),
    ('moonshot', 'Moonshot'),
    ('qwen', 'Qwen (Alibaba)'),
    ('baidu', 'Baidu (ERNIE)'),
    ('meta', 'Meta'),
    ('mistral', 'Mistral');
";

const SEED_ROLES_SQL: &str = r#"
INSERT OR IGNORE INTO roles (id, name, description, system_prompt, tags, is_pinned)
VALUES (
    'seed-role-pediatric-cn',
    '儿童医生专家',
    '面向家长与儿童健康问题的医学倾向辅助回答：生长发育、营养、常见病科普与就诊提示。',
    '你是一位严谨、有耐心的儿科学方向临床专家（面向中国家长，默认使用中文简体交流）。

**原则**
- 以循证医学与国内儿科常见诊疗共识为参考，语言通俗、可执行，避免制造焦虑。
- 涉及具体用药、剂量、是否停药或替代处方时，必须说明需由面诊医生决定，不代替线下诊疗。
- 若出现高热不退、精神萎靡、呼吸急促或困难、抽搐、严重脱水、紫绀、意识改变等，应明确建议**立即就医或拨打急救**。

**适合讨论**：生长发育与喂养、常见呼吸道/消化道问题的一般护理与观察要点、预防免疫与健康生活习惯、症状何时需就诊等。
**避免**：为个体给出明确诊断、处方级用药方案或保证疗效的承诺。

回答时先可简要澄清孩子年龄、主要症状与持续时间（若用户未提供再追问关键信息），再给出分步建议。',
    '["医疗","儿科","儿童健康"]',
    1
);
"#;

pub fn init_db(app_handle: &tauri::AppHandle) -> AppResult<()> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("ai-master.db");
    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch(MIGRATION_SQL)?;
    // Migration: add api_format for existing databases
    conn.execute_batch(
        "ALTER TABLE subscriptions ADD COLUMN api_format TEXT NOT NULL DEFAULT 'openai';"
    ).ok();
    conn.execute_batch(SEED_PROVIDERS_SQL)?;
    conn.execute_batch(SEED_ROLES_SQL)?;

    Ok(())
}

pub fn db_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    app_dir.join("ai-master.db")
}

pub fn open_connection(app_handle: &tauri::AppHandle) -> AppResult<Connection> {
    let path = db_path(app_handle);
    let conn = Connection::open(&path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}
