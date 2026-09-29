#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod store;
mod vault;

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistenceInfo {
    kind: &'static str,
    state_path: String,
    app_version: String,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

#[tauri::command]
fn read_state(app: AppHandle) -> Result<Option<String>, String> {
    let directory = app_data_dir(&app)?;
    store::read_state(&store::state_path(&directory)).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_state(app: AppHandle, contents: String) -> Result<(), String> {
    let directory = app_data_dir(&app)?;
    store::write_state(&store::state_path(&directory), &contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn persistence_info(app: AppHandle) -> Result<PersistenceInfo, String> {
    let directory = app_data_dir(&app)?;
    Ok(PersistenceInfo {
        kind: "desktop",
        state_path: store::state_path(&directory).to_string_lossy().into_owned(),
        app_version: app.package_info().version.to_string(),
    })
}

#[derive(Serialize)]
struct VaultStatus {
    path: Option<String>,
    available: bool,
}

fn vault_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("vault.json"))
}

fn configured_vault(app: &AppHandle) -> Result<Option<String>, String> {
    let contents = store::read_state(&vault_config_path(app)?).map_err(|error| error.to_string())?;
    Ok(contents
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|value| value.get("path")?.as_str().map(String::from)))
}

fn vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    let path = configured_vault(app)?.ok_or("No notes folder is selected")?;
    let root = PathBuf::from(&path);
    if root.is_dir() {
        Ok(root)
    } else {
        Err(format!("Notes folder not found: {path}"))
    }
}

#[tauri::command]
fn vault_status(app: AppHandle) -> Result<VaultStatus, String> {
    let path = configured_vault(&app)?;
    let available = path.as_deref().is_some_and(|path| PathBuf::from(path).is_dir());
    Ok(VaultStatus { path, available })
}

/// Only this dialog can point the vault somewhere: the webview never supplies a path.
#[tauri::command]
async fn vault_choose(app: AppHandle) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    let path = path.to_string_lossy().into_owned();
    let config = serde_json::json!({ "path": path }).to_string();
    store::write_state(&vault_config_path(&app)?, &config).map_err(|error| error.to_string())?;
    Ok(Some(path))
}

#[tauri::command]
fn vault_disconnect(app: AppHandle) -> Result<(), String> {
    match std::fs::remove_file(vault_config_path(&app)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn vault_list(app: AppHandle) -> Result<Vec<vault::VaultFile>, String> {
    vault::list(&vault_root(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn vault_apply(app: AppHandle, op: vault::VaultOp) -> Result<(), String> {
    vault::apply(&vault_root(&app)?, &op)
}

fn vault_aux_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = configured_vault(app)?.ok_or("No notes folder is selected")?;
    Ok(app_data_dir(app)?.join(vault::aux_file_name(&path)))
}

#[tauri::command]
fn vault_read_aux(app: AppHandle) -> Result<Option<String>, String> {
    store::read_state(&vault_aux_path(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn vault_write_aux(app: AppHandle, contents: String) -> Result<(), String> {
    store::write_state(&vault_aux_path(&app)?, &contents).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_state,
            write_state,
            persistence_info,
            vault_status,
            vault_choose,
            vault_disconnect,
            vault_list,
            vault_apply,
            vault_read_aux,
            vault_write_aux
        ])
        .run(tauri::generate_context!())
        .expect("Sloth Note could not start");
}
