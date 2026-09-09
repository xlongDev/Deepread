//! Deepread desktop backend.
//!
//! Layering (spec §2): commands are thin IPC wrappers around pure domain
//! functions; everything below `commands/` must stay runtime-agnostic and
//! unit-testable without a Tauri runtime.

mod commands;
mod dictionary;
mod error;
mod events;
mod library;
mod state;
mod timestamps;

use log::{info, warn};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::system::system_ping,
            commands::system::app_info,
            state::reader_state_get,
            state::reader_state_set,
            library::library_list,
            library::library_import,
            library::library_remove,
            dictionary::dictionary_list,
            dictionary::dictionary_register,
            dictionary::dictionary_remove,
        ])
        .setup(|app| {
            let payload = events::AppReadyPayload {
                started_at: timestamps::rfc3339_now(),
                app_version: app.package_info().version.to_string(),
            };
            let transport_name = events::transport_name(events::EVENT_APP_READY);
            if let Err(err) = app.handle().emit(&transport_name, payload) {
                warn!("failed to emit {} event: {err}", events::EVENT_APP_READY);
            }
            info!("Deepread backend started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Deepread");
}
