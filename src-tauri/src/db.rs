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
    endpoint_id TEXT REFERENCES subscription_endpoints(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS subscription_endpoints (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    api_format TEXT NOT NULL CHECK(api_format IN ('openai','anthropic')),
    base_url TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_endpoints_sub ON subscription_endpoints(subscription_id);

CREATE TABLE IF NOT EXISTS tool_subscription_configs (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL,
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    endpoint_id TEXT REFERENCES subscription_endpoints(id) ON DELETE SET NULL,
    rendered_json TEXT NOT NULL,
    is_overridden INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tool_name, subscription_id, endpoint_id)
);
CREATE INDEX IF NOT EXISTS idx_presets_tool ON tool_subscription_configs(tool_name);
CREATE INDEX IF NOT EXISTS idx_presets_sub ON tool_subscription_configs(subscription_id);

CREATE TABLE IF NOT EXISTS tool_active_state (
    tool_name TEXT PRIMARY KEY,
    active_subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    active_endpoint_id     TEXT REFERENCES subscription_endpoints(id) ON DELETE SET NULL,
    active_preset_id       TEXT REFERENCES tool_subscription_configs(id) ON DELETE SET NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    // Migration: backups can now be linked to specific subscription/endpoint/preset ids.
    // Old `subscription_name` column kept as fallback display when those id columns are NULL
    // (e.g. backups created before this migration, or after the linked subscription was deleted).
    conn.execute_batch(
        "ALTER TABLE config_backups ADD COLUMN subscription_id TEXT;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE config_backups ADD COLUMN endpoint_id TEXT;"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE config_backups ADD COLUMN preset_id TEXT;"
    ).ok();
    // Conversations remember which endpoint (within a subscription) they last used so the
    // picker can preselect both subscription and protocol on reopen.
    conn.execute_batch(
        "ALTER TABLE conversations ADD COLUMN endpoint_id TEXT;"
    ).ok();
    // Subscription portal credentials: optional admin URL + login pair so users can jump
    // straight to the provider console from the card. Password is stored encrypted with the
    // same crypto_key as api_key_encrypted, never returned in plaintext via list APIs.
    conn.execute_batch(
        "ALTER TABLE subscriptions ADD COLUMN admin_url TEXT NOT NULL DEFAULT '';"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE subscriptions ADD COLUMN username TEXT NOT NULL DEFAULT '';"
    ).ok();
    conn.execute_batch(
        "ALTER TABLE subscriptions ADD COLUMN password_encrypted TEXT NOT NULL DEFAULT '';"
    ).ok();
    conn.execute_batch(SEED_PROVIDERS_SQL)?;
    conn.execute_batch(SEED_ROLES_SQL)?;
    backfill_default_endpoints(&conn)?;

    Ok(())
}

/// One-time backfill: every subscription must own at least one endpoint so that the new
/// endpoint-aware code paths have something to route to. We synthesize one from the legacy
/// `base_url/model/api_format` columns and mark it as the default.
fn backfill_default_endpoints(conn: &Connection) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.api_format, s.base_url, s.model
         FROM subscriptions s
         WHERE NOT EXISTS (
             SELECT 1 FROM subscription_endpoints e WHERE e.subscription_id = s.id
         )"
    )?;
    let rows: Vec<(String, String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    for (sub_id, api_format, base_url, model) in rows {
        let id = uuid::Uuid::new_v4().to_string();
        let fmt = if api_format == "anthropic" { "anthropic" } else { "openai" };
        conn.execute(
            "INSERT INTO subscription_endpoints (id, subscription_id, api_format, base_url, model, is_default) \
             VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            rusqlite::params![id, sub_id, fmt, base_url, model],
        )?;
    }
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
