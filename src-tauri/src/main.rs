#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod store;

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_state, write_state, persistence_info])
        .run(tauri::generate_context!())
        .expect("Sloth Note could not start");
}
