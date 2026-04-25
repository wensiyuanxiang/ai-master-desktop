mod commands;
mod db;
mod error;
mod services;

use tauri::Manager;
use tracing_subscriber::fmt::format::FmtSpan;

pub fn run() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_span_events(FmtSpan::NEW | FmtSpan::CLOSE)
        .with_target(false)
        .with_writer(std::io::stderr)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            db::init_db(&app_handle).expect("Failed to initialize database");

            let crypto_key = services::crypto::derive_key(&app_handle)
                .expect("Failed to derive encryption key");
            app.manage(services::AppState::new(crypto_key));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::provider::list_providers,
            commands::provider::create_provider,
            commands::provider::delete_provider,
            commands::subscription::list_subscriptions,
            commands::subscription::create_subscription,
            commands::subscription::update_subscription,
            commands::subscription::delete_subscription,
            commands::subscription::set_active_subscription,
            commands::subscription::get_active_subscription,
            commands::role::list_roles,
            commands::role::create_role,
            commands::role::update_role,
            commands::role::delete_role,
            commands::role::toggle_pin_role,
            commands::role::import_roles,
            commands::role::export_roles,
            commands::conversation::list_conversations,
            commands::conversation::create_conversation,
            commands::conversation::get_conversation,
            commands::conversation::update_conversation,
            commands::conversation::rename_conversation,
            commands::conversation::delete_conversation,
            commands::message::list_messages,
            commands::message::send_message,
            commands::config::detect_tool_configs,
            commands::config::read_config_file,
            commands::config::write_config_partial,
            commands::config::write_config_full,
            commands::config::preview_config,
            commands::backup::list_backups,
            commands::backup::restore_backup,
            commands::backup::delete_backup,
            commands::backup::export_backup,
            commands::backup::export_all_backups,
            commands::export_import::export_all_data,
            commands::export_import::import_all_data,
            commands::export_import::get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
