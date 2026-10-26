use crate::persistence::pool;
use chrono::{Local, Timelike, Utc};
use sqlx::{Row, SqlitePool};
use std::{
    collections::HashSet,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Emitter, Manager,
};
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub fn notification_permission(app: AppHandle) -> Result<String, String> {
    app.notification()
        .request_permission()
        .map(|v| format!("{v:?}"))
        .map_err(|e| e.to_string())
}

async fn toggle_session(p: &SqlitePool) -> Result<(), sqlx::Error> {
    let mut tx = p.begin().await?;
    let row = sqlx::query("SELECT id,state FROM study_sessions WHERE state!='completed'")
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(row) = row {
        let id: String = row.get("id");
        let state: String = row.get("state");
        if state == "running" {
            sqlx::query("UPDATE session_intervals SET ended_at=checkpoint_at WHERE session_id=? AND ended_at IS NULL").bind(&id).execute(&mut *tx).await?;
            sqlx::query("UPDATE study_sessions SET state='paused' WHERE id=?")
                .bind(&id)
                .execute(&mut *tx)
                .await?;
        } else if state == "paused" {
            let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            sqlx::query("INSERT INTO session_intervals(id,session_id,started_at,checkpoint_at) VALUES(?,?,?,?)")
                .bind(uuid::Uuid::new_v4().to_string()).bind(&id).bind(&now).bind(&now).execute(&mut *tx).await?;
            sqlx::query("UPDATE study_sessions SET state='running' WHERE id=?")
                .bind(&id)
                .execute(&mut *tx)
                .await?;
        }
        // Recovery requires explicit confirmation in the window.
    }
    tx.commit().await
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(
        app,
        "open",
        "Abrir aplicativo / sessão atual",
        true,
        None::<&str>,
    )?;
    let toggle = MenuItem::with_id(app, "toggle", "Pausar / retomar sessão", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Encerrar aplicativo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &toggle, &exit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Projeto Aprovação")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let _ = app.emit("show-session", ());
            }
            "toggle" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    match pool(&app).await {
                        Ok(p) => {
                            if let Err(e) = toggle_session(&p).await {
                                let _ = app.emit("native-error", e.to_string());
                            }
                        }
                        Err(e) => {
                            let _ = app.emit("native-error", e);
                        }
                    }
                    let _ = app.emit("data-changed", ());
                });
            }
            "exit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = worker(handle.clone()).await {
            let _ = handle.emit("native-error", e);
        }
    });
    Ok(())
}

fn uncertain_gap(wall_ms: i64, monotonic_ms: i64) -> bool {
    (wall_ms - monotonic_ms).abs() > 3000 || !(0..=15000).contains(&wall_ms)
}

async fn worker(app: AppHandle) -> Result<(), String> {
    let p = pool(&app).await?;
    let mut tx = p.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE session_intervals SET ended_at=checkpoint_at WHERE ended_at IS NULL")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE study_sessions SET state='recovery' WHERE state='running'")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    let _ = app.emit("data-changed", ());
    let mut notified = HashSet::new();
    let mut reminder_keys = HashSet::new();
    let mut reminder_date = Local::now().date_naive();
    let mut last_instant = Instant::now();
    let mut last_wall = Utc::now();
    loop {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let wall = Utc::now();
        let uncertain = uncertain_gap(
            (wall - last_wall).num_milliseconds(),
            last_instant.elapsed().as_millis() as i64,
        );
        last_instant = Instant::now();
        last_wall = wall;
        let stamp = wall.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let result:Result<(),sqlx::Error>=async {
            let mut tx=p.begin().await?;
            let mut checkpoint_event=None;
            let mut changed=false;
            let mut complete=false;
            if let Some(row)=sqlx::query("SELECT s.id,s.planned_minutes,i.id AS interval_id,i.checkpoint_at FROM study_sessions s JOIN session_intervals i ON i.session_id=s.id AND i.ended_at IS NULL WHERE s.state='running'").fetch_optional(&mut *tx).await? {
                let sid:String=row.get("id");
                let iid:String=row.get("interval_id");
                let checkpoint:String=row.get("checkpoint_at");
                let gap=chrono::DateTime::parse_from_rfc3339(&checkpoint).map(|t|(wall-t.with_timezone(&Utc)).num_milliseconds()).unwrap_or(i64::MAX);
                if uncertain || !(0..=15000).contains(&gap) {
                    sqlx::query("UPDATE session_intervals SET ended_at=checkpoint_at WHERE id=?").bind(&iid).execute(&mut *tx).await?;
                    sqlx::query("UPDATE study_sessions SET state='recovery' WHERE id=?").bind(&sid).execute(&mut *tx).await?;
                    changed=true;
                } else {
                    sqlx::query("UPDATE session_intervals SET checkpoint_at=? WHERE id=?").bind(&stamp).bind(&iid).execute(&mut *tx).await?;
                    checkpoint_event=Some(iid);
                }
                let elapsed:f64=sqlx::query_scalar("SELECT COALESCE(SUM((julianday(COALESCE(ended_at,checkpoint_at))-julianday(started_at))*86400),0.0) FROM session_intervals WHERE session_id=?").bind(&sid).fetch_one(&mut *tx).await?;
                if elapsed>=row.get::<i64,_>("planned_minutes") as f64*60.0 && notified.insert(sid) {complete=true;}
            }
            tx.commit().await?;
            if changed {let _=app.emit("data-changed",());}
            if let Some(iid)=checkpoint_event {let _=app.emit("checkpoint",serde_json::json!({"interval_id":iid,"stamp":stamp}));}
            if complete {
                let enabled:i64=sqlx::query_scalar("SELECT completion_notice FROM settings WHERE id=1").fetch_one(&p).await?;
                if enabled==1 {let _=app.notification().builder().title("Duração planejada concluída").body("Você pode finalizar a sessão ou continuar no seu ritmo.").show();}
                let _=app.emit("timer-complete",());
            }
            let s=sqlx::query("SELECT study_time,reminders,reminder_before FROM settings WHERE id=1").fetch_one(&p).await?;
            let local=Local::now();
            if local.date_naive()!=reminder_date {reminder_keys.clear();reminder_date=local.date_naive();}
            if s.get::<i64,_>("reminders")==1 {
                let time:String=s.get("study_time");
                let current=(local.hour()*60+local.minute()) as i64;
                if let Some((h,m))=time.split_once(':') {
                    let target=h.parse::<i64>().unwrap_or(19)*60+m.parse::<i64>().unwrap_or(0);
                    for offset in [s.get::<i64,_>("reminder_before"),0] {
                        let scheduled=(target-offset).rem_euclid(1440);
                        if current==scheduled && reminder_keys.insert(scheduled) {
                            let _=app.notification().builder().title("Seu horário de estudo").body(if offset==0 {"Um pequeno começo já conta. Abra sua próxima sessão."} else {"Seu horário de estudo está chegando."}).show();
                        }
                    }
                }
            }
            Ok(())
        }.await;
        if let Err(e) = result {
            let _ = app.emit("native-error", e.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_sleep_and_clock_changes() {
        assert!(!uncertain_gap(2000, 2000));
        assert!(uncertain_gap(60000, 2000));
        assert!(uncertain_gap(60000, 60000));
        assert!(uncertain_gap(-1000, 2000));
    }
}
