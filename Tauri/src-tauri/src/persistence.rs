use serde::Deserialize;
use serde_json::Value;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::path::Path;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_sql::{DbInstances, DbPool};
pub const TABLES: &[(&str,&str)]=&[
 ("settings","id,plan_name,target,weekly_minutes,default_minutes,theme,study_time,reminder_before,reminders,close_to_tray,review_days,onboarding,completion_notice"),
 ("disciplines","id,name,category,color,priority,active"),("topics","id,discipline_id,name,position,status,notes,lesson_url,pdf_url,questions_url,last_studied"),
 ("study_cycles","id,name,cursor"),("cycle_items","id,cycle_id,discipline_id,position,minutes,priority,paused"),
 ("study_sessions","id,discipline_id,topic_id,cycle_item_id,planned_minutes,started_at,ended_at,state,notes"),
 ("session_intervals","id,session_id,started_at,checkpoint_at,ended_at"),("question_records","id,discipline_id,topic_id,total,correct,date,board,notes"),
 ("error_notes","id,discipline_id,topic_id,description,explanation,source,created_at,reviewed"),("reviews","id,topic_id,due_at,stage,state,performance,completed_at")];
pub async fn pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<DbInstances>();
    let db = state.0.read().await;
    match db.get("sqlite:aprovacao.db") {
        Some(DbPool::Sqlite(p)) => Ok(p.clone()),
        _ => Err("Banco indisponível".into()),
    }
}
#[derive(Deserialize)]
pub struct Statement {
    sql: String,
    params: Vec<Value>,
}
pub async fn batch(p: &SqlitePool, statements: Vec<Statement>) -> Result<(), String> {
    let mut tx = p.begin().await.map_err(|e| e.to_string())?;
    for st in statements {
        let leading = st.sql.trim_start().to_ascii_uppercase();
        if !["INSERT ", "UPDATE ", "DELETE "]
            .iter()
            .any(|s| leading.starts_with(s))
        {
            return Err("Operação não permitida".into());
        }
        let mut q = sqlx::query(&st.sql);
        for v in st.params {
            q = match v {
                Value::Null => q.bind(None::<String>),
                Value::String(s) => q.bind(s),
                Value::Number(n) => q.bind(n.as_f64().ok_or("Número inválido")?),
                _ => return Err("Parâmetro inválido".into()),
            };
        }
        q.execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn atomic_write(app: AppHandle, statements: Vec<Statement>) -> Result<(), String> {
    batch(&pool(&app).await?, statements).await
}
pub async fn snapshot(p: &SqlitePool, path: &Path) -> Result<(), String> {
    sqlx::query("VACUUM INTO ?")
        .bind(path.to_string_lossy().as_ref())
        .execute(p)
        .await
        .map_err(|e| e.to_string())?;
    if !path.is_file() {
        return Err(format!(
            "O SQLite não criou o arquivo de backup em {}",
            path.display()
        ));
    }
    Ok(())
}
#[tauri::command]
pub async fn backup_database(app: AppHandle) -> Result<String, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Backup SQLite", &["sqlite"])
        .set_file_name(format!(
            "aprovacao-{}.sqlite",
            chrono::Local::now().format("%Y%m%d-%H%M%S")
        ))
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok("Operação cancelada".into());
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    if path.exists() {
        return Err("Escolha um nome de arquivo novo para preservar o backup existente.".into());
    }
    snapshot(&pool(&app).await?, &path).await?;
    Ok(format!("Backup salvo em {}", path.display()))
}
pub async fn restore(p: &SqlitePool, path: &Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .foreign_keys(true);
    let source = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| format!("Falha ao abrir backup {}: {e}", path.display()))?;
    let appid: i64 = sqlx::query_scalar("PRAGMA application_id")
        .fetch_one(&source)
        .await
        .map_err(|e| e.to_string())?;
    let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&source)
        .await
        .map_err(|e| e.to_string())?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&source)
        .await
        .map_err(|e| e.to_string())?;
    if appid != 1095782991 || version != 2 || integrity != "ok" {
        return Err("Backup incompatível ou corrompido (versão esperada: 2).".into());
    }
    if !sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&source)
        .await
        .map_err(|e| e.to_string())?
        .is_empty()
    {
        return Err("Backup com relacionamentos inválidos".into());
    }
    for (table, columns) in TABLES {
        let kind: String = sqlx::query_scalar("SELECT type FROM sqlite_master WHERE name=?")
            .bind(table)
            .fetch_one(&source)
            .await
            .map_err(|e| e.to_string())?;
        if kind != "table" {
            return Err("Estrutura inválida".into());
        }
        sqlx::query(&format!("SELECT {columns} FROM {table} LIMIT 0"))
            .fetch_all(&source)
            .await
            .map_err(|e| e.to_string())?;
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM settings WHERE id=1")
        .fetch_one(&source)
        .await
        .map_err(|e| e.to_string())?;
    if count != 1 {
        return Err("Configuração ausente no backup".into());
    }
    // Copy values, never schema, triggers or SQL from the selected file. The destination constraints stay in force.
    let mut tx = p.begin().await.map_err(|e| e.to_string())?;
    for (table, _) in TABLES.iter().rev() {
        sqlx::query(&format!("DELETE FROM {table}"))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }
    for (table, columns) in TABLES {
        let rows = sqlx::query(&format!("SELECT {columns} FROM {table}"))
            .fetch_all(&source)
            .await
            .map_err(|e| e.to_string())?;
        let column_names: Vec<&str> = columns.split(',').collect();
        let placeholders = vec!["?"; column_names.len()].join(",");
        let text = format!("INSERT INTO {table} ({columns}) VALUES ({placeholders})");
        for row in rows {
            let mut q = sqlx::query(&text);
            for i in 0..column_names.len() {
                use sqlx::ValueRef;
                let raw = row.try_get_raw(i).map_err(|e| e.to_string())?;
                if raw.is_null() {
                    q = q.bind(None::<String>);
                } else if let Ok(v) = row.try_get::<i64, _>(i) {
                    q = q.bind(v);
                } else {
                    q = q.bind(row.try_get::<String, _>(i).map_err(|e| e.to_string())?);
                }
            }
            q.execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }
    sqlx::query("UPDATE session_intervals SET ended_at=checkpoint_at WHERE ended_at IS NULL")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE study_sessions SET state='recovery' WHERE state='running'")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    source.close().await;
    Ok(())
}
#[tauri::command]
pub async fn restore_database(app: AppHandle) -> Result<String, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Backup SQLite", &["sqlite"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok("Operação cancelada".into());
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    let p = pool(&app).await?;
    let active: i64 =
        sqlx::query_scalar("SELECT count(*) FROM study_sessions WHERE state!='completed'")
            .fetch_one(&p)
            .await
            .map_err(|e| e.to_string())?;
    if active > 0 {
        return Err("Finalize ou descarte a sessão antes de restaurar.".into());
    }
    let safety = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(format!(
            "antes-restauracao-{}.sqlite",
            chrono::Utc::now().timestamp_millis()
        ));
    snapshot(&p, &safety).await?;
    restore(&p, &path).await?;
    Ok(format!(
        "Dados restaurados. Cópia anterior: {}",
        safety.display()
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    async fn db() -> SqlitePool {
        let p = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(
                        std::env::temp_dir()
                            .join(format!("aprovacao-db-{}.sqlite", uuid::Uuid::new_v4())),
                    )
                    .create_if_missing(true)
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/001_initial.sql"))
            .execute(&p)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/002_integrity.sql"))
            .execute(&p)
            .await
            .unwrap();
        p
    }
    #[tokio::test]
    async fn migration_integrity() {
        let p = db().await;
        assert_eq!(
            sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
                .fetch_one(&p)
                .await
                .unwrap(),
            "ok"
        );
        assert!(sqlx::query("INSERT INTO question_records(id,discipline_id,total,correct,date) VALUES('q','missing',2,3,'2026-01-01')").execute(&p).await.is_err());
    }
    #[tokio::test]
    async fn backup_roundtrip_and_rejection() {
        let p = db().await;
        sqlx::raw_sql("INSERT INTO disciplines(id,name,category,color) VALUES('d','Banco de Dados','Tecnologia da Informação','#60a5fa'); INSERT INTO topics(id,discipline_id,name) VALUES('t','d','SQL'); INSERT INTO study_sessions(id,discipline_id,topic_id,planned_minutes,started_at,state) VALUES('s','d','t',60,'2026-10-20T19:00:00.000Z','running'); INSERT INTO session_intervals(id,session_id,started_at,checkpoint_at) VALUES('i','s','2026-10-20T19:00:00.000Z','2026-10-20T19:10:00.000Z'); INSERT INTO question_records(id,discipline_id,topic_id,total,correct,date) VALUES('q','d','t',20,15,'2026-10-20'); INSERT INTO reviews(id,topic_id,due_at,stage) VALUES('r','t','2026-10-21T19:00:00.000Z',0);")
          .execute(&p).await.unwrap();
        let path =
            std::env::temp_dir().join(format!("aprovacao-test-{}.sqlite", uuid::Uuid::new_v4()));
        snapshot(&p, &path).await.unwrap();
        sqlx::query("UPDATE settings SET weekly_minutes=42")
            .execute(&p)
            .await
            .unwrap();
        restore(&p, &path).await.unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT state FROM study_sessions WHERE id='s'")
                .fetch_one(&p)
                .await
                .unwrap(),
            "recovery"
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT errors FROM question_records WHERE id='q'")
                .fetch_one(&p)
                .await
                .unwrap(),
            5
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM reviews")
                .fetch_one(&p)
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT weekly_minutes FROM settings")
                .fetch_one(&p)
                .await
                .unwrap(),
            600
        );
        let _ = std::fs::remove_file(path);
        let invalid = std::env::temp_dir().join(format!("invalid-{}.sqlite", uuid::Uuid::new_v4()));
        std::fs::write(&invalid, b"invalid").unwrap();
        assert!(restore(&p, &invalid).await.is_err());
        let _ = std::fs::remove_file(invalid);
    }
    #[tokio::test]
    async fn atomic_write_rolls_back() {
        let p = db().await;
        let statements=vec![Statement{sql:"UPDATE settings SET weekly_minutes=? WHERE id=1".into(),params:vec![Value::from(42)]},Statement{sql:"INSERT INTO question_records(id,discipline_id,total,correct,date) VALUES('x','missing',10,3,'2026-10-20')".into(),params:vec![]}];
        assert!(batch(&p, statements).await.is_err());
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT weekly_minutes FROM settings")
                .fetch_one(&p)
                .await
                .unwrap(),
            600
        );
    }
}
