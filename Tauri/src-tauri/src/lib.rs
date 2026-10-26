mod desktop;
mod persistence;
use tauri::{Manager, WindowEvent};
use tauri_plugin_sql::{Migration, MigrationKind};
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:aprovacao.db",
                    vec![
                        Migration {
                            version: 1,
                            description: "initial",
                            sql: include_str!("../migrations/001_initial.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "integrity",
                            sql: include_str!("../migrations/002_integrity.sql"),
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            persistence::atomic_write,
            persistence::backup_database,
            persistence::restore_database,
            desktop::notification_permission
        ])
        .setup(|app| {
            desktop::setup(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let tray = match persistence::pool(&app).await {
                        Ok(p) => {
                            sqlx::query_scalar::<_, i64>(
                                "SELECT close_to_tray FROM settings WHERE id=1",
                            )
                            .fetch_one(&p)
                            .await
                            .unwrap_or(0)
                                == 1
                        }
                        Err(_) => false,
                    };
                    if tray {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    } else {
                        app.exit(0);
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar o Projeto Aprovação");
}
