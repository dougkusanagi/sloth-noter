#[cfg(desktop)]
mod clipboard;
#[cfg(mobile)]
#[path = "clipboard_mobile.rs"]
mod clipboard;
mod errors;
mod history;
mod images;
mod migration;
mod store;
mod vault;

use serde::Serialize;
use std::{
    collections::{HashSet, VecDeque},
    env,
    path::{Path, PathBuf},
    sync::Mutex,
};
#[cfg(desktop)]
use tauri::Emitter;
use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct DroppedFiles(Mutex<HashSet<PathBuf>>);

impl DroppedFiles {
    fn on_window_event(&self, event: &tauri::WindowEvent) {
        // Tauri delivers drops on a WebviewWindow as window events, rather than
        // webview events. Record the paths before the frontend requests a read.
        if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
            if let Ok(mut allowed) = self.0.lock() {
                allowed.clear();
                for path in paths {
                    if let Ok(path) = path.canonicalize() {
                        allowed.insert(path);
                    }
                }
            }
        }
    }

    fn take(&self, path: &str) -> Result<PathBuf, String> {
        let source = std::fs::canonicalize(path).map_err(|e| errors::describe(&e))?;
        if !self.0.lock().map_err(|e| e.to_string())?.remove(&source) {
            return Err("The file was not dropped into this window".into());
        }
        Ok(source)
    }
}

#[derive(Default)]
struct PendingVault(Mutex<Option<PathBuf>>);

#[derive(Default)]
struct PendingOpenFiles(Mutex<VecDeque<PathBuf>>);

impl PendingOpenFiles {
    fn new(paths: Vec<PathBuf>) -> Self {
        Self(Mutex::new(paths.into()))
    }

    #[cfg(desktop)]
    fn enqueue(&self, paths: Vec<PathBuf>) -> bool {
        if paths.is_empty() {
            return false;
        }
        match self.0.lock() {
            Ok(mut pending) => {
                pending.extend(paths);
                true
            }
            Err(_) => false,
        }
    }

    fn take(&self) -> Result<Vec<PathBuf>, String> {
        let mut pending = self.0.lock().map_err(|error| error.to_string())?;
        Ok(std::mem::take(&mut *pending).into())
    }
}

fn openable_paths(paths: impl IntoIterator<Item = PathBuf>, cwd: &Path) -> Vec<PathBuf> {
    paths
        .into_iter()
        .filter_map(|path| {
            let extension = path.extension()?.to_str()?.to_ascii_lowercase();
            if !matches!(extension.as_str(), "md" | "markdown" | "txt") {
                return None;
            }
            Some(if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            })
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedNoteFile {
    name: String,
    path: String,
    contents: Option<String>,
    error: Option<String>,
    same_notes_folder: bool,
}

fn external_registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("external-files.json"))
}

/// Files the user opened from outside the notes folder, by canonical path. Only these
/// may be read or written later, so the webview cannot reach arbitrary paths.
fn registered_files(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let contents = store::read_state(&external_registry_path(app)?)
        .map_err(|error| errors::describe(&error))?;
    let paths: Vec<String> = contents
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    Ok(paths.into_iter().map(PathBuf::from).collect())
}

fn register_file(app: &AppHandle, source: &Path) -> Result<(), String> {
    let mut files = registered_files(app)?;
    if files.iter().any(|file| file == source) {
        return Ok(());
    }
    files.push(source.to_path_buf());
    let paths: Vec<String> = files
        .iter()
        .map(|file| file.to_string_lossy().into_owned())
        .collect();
    let text = serde_json::to_string(&paths).map_err(|error| error.to_string())?;
    store::write_state(&external_registry_path(app)?, &text)
        .map_err(|error| errors::describe(&error))
}

fn registered_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let source = std::fs::canonicalize(path).map_err(|e| errors::describe(&e))?;
    if registered_files(app)?.contains(&source) {
        Ok(source)
    } else {
        Err("This file was not opened in Sloth Note".into())
    }
}

#[tauri::command]
fn external_read(app: AppHandle, path: String) -> Result<String, String> {
    let source = registered_path(&app, &path)?;
    vault::read_opened(&source)
}

#[tauri::command]
fn external_write(
    app: AppHandle,
    path: String,
    contents: String,
    expected: String,
) -> Result<(), String> {
    let source = registered_path(&app, &path)?;
    vault::write_external(&source, &contents, &expected)
}

/// Drops the permission to write a file once no note refers to it any more.
#[tauri::command]
fn external_release(app: AppHandle, path: String) -> Result<(), String> {
    let released = std::fs::canonicalize(&path).ok();
    let mut files = registered_files(&app)?;
    let before = files.len();
    files.retain(|file| file != Path::new(&path) && Some(file) != released.as_ref());
    if files.len() == before {
        return Ok(());
    }
    let paths: Vec<String> = files
        .iter()
        .map(|file| file.to_string_lossy().into_owned())
        .collect();
    let text = serde_json::to_string(&paths).map_err(|error| error.to_string())?;
    store::write_state(&external_registry_path(&app)?, &text)
        .map_err(|error| errors::describe(&error))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalNote {
    name: String,
    path: String,
    contents: String,
}

/// Opens a Markdown or text file dropped onto the window in place, keeping it registered.
#[tauri::command]
fn note_open_dropped(
    app: AppHandle,
    dropped: tauri::State<'_, DroppedFiles>,
    path: String,
) -> Result<ExternalNote, String> {
    let source = dropped.take(&path)?;
    let contents = vault::read_opened(&source)?;
    register_file(&app, &source)?;
    Ok(ExternalNote {
        name: source
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
        path: source.to_string_lossy().into_owned(),
        contents,
    })
}

#[tauri::command]
fn take_opened_files(
    app: AppHandle,
    pending: tauri::State<'_, PendingOpenFiles>,
) -> Result<Vec<OpenedNoteFile>, String> {
    let notes_folder = configured_vault(&app)
        .ok()
        .flatten()
        .and_then(|path| PathBuf::from(path).canonicalize().ok());
    Ok(pending
        .take()?
        .into_iter()
        .map(|path| {
            let source = std::fs::canonicalize(&path).unwrap_or(path);
            let name = source
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            let same_notes_folder = source
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
                && notes_folder
                    .as_ref()
                    .is_some_and(|folder| source.parent() == Some(folder.as_path()));
            let opened = vault::read_opened(&source).and_then(|contents| {
                if !same_notes_folder {
                    register_file(&app, &source)?;
                }
                Ok(contents)
            });
            let path = source.to_string_lossy().into_owned();
            match opened {
                Ok(contents) => OpenedNoteFile {
                    name,
                    path,
                    contents: Some(contents),
                    error: None,
                    same_notes_folder,
                },
                Err(error) => OpenedNoteFile {
                    name,
                    path,
                    contents: None,
                    error: Some(error),
                    same_notes_folder,
                },
            }
        })
        .collect())
}

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

async fn history_job<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn history_maintain(app: AppHandle) -> Result<(), String> {
    let root = app_data_dir(&app)?.join("history");
    history_job(move || history::maintenance(&root)).await
}
#[tauri::command]
fn history_configure(days: u64, megabytes: u64) {
    history::configure(days, megabytes);
}
#[tauri::command]
async fn history_snapshot(app: AppHandle, text: String) -> Result<String, String> {
    let root = app_data_dir(&app)?.join("history");
    history_job(move || history::save_snapshot(&root, &text)).await
}
#[tauri::command]
async fn history_read(
    app: AppHandle,
    id: String,
    day: String,
) -> Result<Vec<serde_json::Value>, String> {
    let root = app_data_dir(&app)?.join("history");
    history_job(move || {
        Ok(history::list(&root, &id)?
            .into_iter()
            .filter(|e| e["dia"].as_str() == Some(day.as_str()))
            .collect())
    })
    .await
}
#[tauri::command]
async fn history_append(app: AppHandle, entries: Vec<serde_json::Value>) -> Result<(), String> {
    let root = app_data_dir(&app)?.join("history");
    history_job(move || history::append(&root, entries)).await
}
#[tauri::command]
async fn history_list(app: AppHandle, id: String) -> Result<Vec<serde_json::Value>, String> {
    let root = app_data_dir(&app)?.join("history");
    history_job(move || history::list(&root, &id)).await
}
#[tauri::command]
async fn history_object(app: AppHandle, hash: String) -> Result<String, String> {
    let root = app_data_dir(&app)?.join("history");
    history_job(move || history::object(&root, &hash)).await
}
#[tauri::command]
async fn history_clear(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let root = app_data_dir(&app)?.join("history");
    history_job(move || history::clear(&root, id.as_deref())).await
}

#[tauri::command]
fn read_state(app: AppHandle) -> Result<Option<String>, String> {
    let directory = app_data_dir(&app)?;
    store::read_state(&store::state_path(&directory)).map_err(|error| errors::describe(&error))
}

#[tauri::command]
fn write_state(app: AppHandle, contents: String) -> Result<(), String> {
    let directory = app_data_dir(&app)?;
    store::write_state(&store::state_path(&directory), &contents)
        .map_err(|error| errors::describe(&error))
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
    let contents =
        store::read_state(&vault_config_path(app)?).map_err(|error| errors::describe(&error))?;
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
        Err(format!("[folder-missing] Notes folder not found: {path}"))
    }
}

#[tauri::command]
fn vault_status(app: AppHandle) -> Result<VaultStatus, String> {
    let path = configured_vault(&app)?;
    let available = path
        .as_deref()
        .is_some_and(|path| PathBuf::from(path).is_dir());
    Ok(VaultStatus { path, available })
}

/// Only this dialog can point the vault somewhere: the webview never supplies a path.
#[tauri::command]
#[cfg(desktop)]
async fn vault_choose(
    app: AppHandle,
    pending: tauri::State<'_, PendingVault>,
) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    let path = path.canonicalize().map_err(|e| errors::describe(&e))?;
    *pending.0.lock().map_err(|e| e.to_string())? = Some(path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
#[cfg(mobile)]
async fn vault_choose() -> Result<Option<String>, String> {
    Err(
        "External note folders are not supported on Android yet. Notes are saved in app storage."
            .into(),
    )
}

fn image_root(app: &AppHandle) -> Result<PathBuf, String> {
    if configured_vault(app)?.is_some() {
        vault_root(app)
    } else {
        app_data_dir(app)
    }
}
#[tauri::command]
async fn clipboard_read() -> Result<Option<clipboard::Contents>, String> {
    tauri::async_runtime::spawn_blocking(clipboard::read)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn image_list(app: AppHandle) -> Result<Vec<String>, String> {
    images::list(&image_root(&app)?)
}
#[tauri::command]
fn image_read(app: AppHandle, name: String) -> Result<Vec<u8>, String> {
    let path = images::image_path(&image_root(&app)?, &name)?;
    if std::fs::metadata(&path)
        .map_err(|e| errors::describe(&e))?
        .len()
        > 20 * 1024 * 1024
    {
        return Err("Image exceeds 20 MB".into());
    }
    std::fs::read(path).map_err(|e| errors::describe(&e))
}
#[tauri::command]
fn image_write(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    if !name.starts_with("assets/") || bytes.len() > 20 * 1024 * 1024 {
        return Err("Invalid image".into());
    }
    let root = image_root(&app)?;
    images::image_path(&root, &name)?;
    images::copy_files(&root, &[(name, bytes)])
}
#[tauri::command]
fn image_import_drop(
    app: AppHandle,
    dropped: tauri::State<'_, DroppedFiles>,
    path: String,
) -> Result<String, String> {
    let source = dropped.take(&path)?;
    images::import_dropped(&image_root(&app)?, &source)
}

#[tauri::command]
fn note_read_dropped(
    dropped: tauri::State<'_, DroppedFiles>,
    path: String,
) -> Result<String, String> {
    let source = dropped.take(&path)?;
    vault::read_dropped(&source)
}

#[tauri::command]
fn image_delete(app: AppHandle, name: String) -> Result<(), String> {
    let root = image_root(&app)?;
    images::image_path(&root, &name)?;
    // Protect actual image references in notes edited outside the app as well.
    if configured_vault(&app)?.is_some() {
        let references: Vec<String> = vault::list(&root)
            .map_err(|e| errors::describe(&e))?
            .into_iter()
            .filter(|note| images::references_image(&note.contents, &name))
            .map(|note| note.name)
            .collect();
        if !references.is_empty() {
            return Err(format!("[image-in-use] {}", references.join(", ")));
        }
    }
    images::delete(&root, &name)
}

#[tauri::command]
fn vault_activate(
    app: AppHandle,
    pending: tauri::State<'_, PendingVault>,
    document: Option<String>,
) -> Result<(), String> {
    let mut pending = pending.0.lock().map_err(|e| e.to_string())?;
    let target = pending.as_ref().ok_or("Choose a folder first")?;
    if !target.is_dir() {
        return Err("Folder is unavailable".into());
    }
    let mut files = Vec::new();
    let mut auxiliary = None;
    if let Some(contents) = document {
        let value: serde_json::Value =
            serde_json::from_str(&contents).map_err(|e| e.to_string())?;
        let notes = value["notes"].as_array().ok_or("Invalid notes")?;

        let mut ids = serde_json::Map::new();
        for note in notes {
            let name = note["name"].as_str().ok_or("Invalid note name")?;
            if !vault::valid_name(name) {
                return Err("Invalid note name".into());
            }
            ids.insert(name.into(), note["id"].clone());
            files.push((
                name.into(),
                note["body"]
                    .as_str()
                    .ok_or("Invalid note body")?
                    .as_bytes()
                    .to_vec(),
            ));
        }
        let source = image_root(&app)?;
        for name in images::list(&source)? {
            let path = images::image_path(&source, &name)?;
            images::image_path(target, &name)?;
            files.push((name, std::fs::read(path).map_err(|e| errors::describe(&e))?));
        }

        let aux = serde_json::json!({ "version": 1, "assets": value["assets"], "ids": ids, "openIds": value["openIds"], "activeId": value["activeId"], "preferences": value["preferences"], "trash": value["trash"] });
        // Preserve existing folder metadata when merging into an existing workspace.
        let aux_path = app_data_dir(&app)?.join(vault::aux_file_name(&target.to_string_lossy()));
        auxiliary = Some((aux_path, aux.to_string()));
    }
    migration::activate(
        &app_data_dir(&app)?.join("migration.json"),
        &vault_config_path(&app)?,
        target,
        &files,
        auxiliary
            .as_ref()
            .map(|(path, text)| (path.as_path(), text.as_str())),
    )?;
    *pending = None;
    Ok(())
}

#[tauri::command]
fn vault_disconnect(app: AppHandle) -> Result<(), String> {
    store::remove_state(&vault_config_path(&app)?).map_err(|error| errors::describe(&error))
}

#[tauri::command]
fn vault_list(app: AppHandle) -> Result<Vec<vault::VaultFile>, String> {
    vault::list(&vault_root(&app)?).map_err(|error| errors::describe(&error))
}

#[tauri::command]
fn vault_stamps(app: AppHandle) -> Result<Vec<vault::VaultStamp>, String> {
    vault::stamps(&vault_root(&app)?).map_err(|error| errors::describe(&error))
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
    store::read_state(&vault_aux_path(&app)?).map_err(|error| errors::describe(&error))
}

#[tauri::command]
fn vault_write_aux(app: AppHandle, contents: String) -> Result<(), String> {
    store::write_state(&vault_aux_path(&app)?, &contents).map_err(|error| errors::describe(&error))
}

/// The AppImage GTK hook forces `GDK_BACKEND=x11`. On GNOME's Wayland session that
/// runs the frameless window under XWayland, where mouse clicks pass through it to the
/// window behind. Use the native Wayland backend there; `SLOTH_NOTE_FORCE_X11=1` opts out.
#[cfg(target_os = "linux")]
fn prefer_native_wayland() {
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some_and(|value| !value.is_empty())
        && std::env::var("XDG_SESSION_TYPE").is_ok_and(|value| value == "wayland");
    if wayland && std::env::var_os("SLOTH_NOTE_FORCE_X11").is_none() {
        std::env::set_var("GDK_BACKEND", "wayland");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    prefer_native_wayland();
    let cwd = env::current_dir().unwrap_or_default();
    let initial_files = openable_paths(env::args_os().skip(1).map(PathBuf::from), &cwd);
    let builder = tauri::Builder::default().manage(PendingOpenFiles::new(initial_files));
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let paths = openable_paths(args.into_iter().skip(1).map(PathBuf::from), Path::new(&cwd));
        if app.state::<PendingOpenFiles>().enqueue(paths) {
            let _ = app.emit("open-note-files", ());
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .setup(|app| {
            let _ = history::maintain(&app.path().app_data_dir()?.join("history"));
            migration::recover(&app.path().app_data_dir()?.join("migration.json"))
                .map_err(std::io::Error::other)?;
            Ok(())
        })
        .manage(PendingVault::default())
        .manage(DroppedFiles::default())
        .on_window_event(|window, event| {
            window.state::<DroppedFiles>().on_window_event(event);
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            history_maintain,
            history_configure,
            history_snapshot,
            history_read,
            history_append,
            history_list,
            history_object,
            history_clear,
            read_state,
            write_state,
            persistence_info,
            vault_status,
            vault_choose,
            vault_activate,
            clipboard_read,
            image_list,
            image_read,
            image_write,
            image_import_drop,
            note_read_dropped,
            note_open_dropped,
            external_read,
            external_write,
            external_release,
            image_delete,
            vault_disconnect,
            vault_list,
            vault_stamps,
            vault_apply,
            vault_read_aux,
            vault_write_aux,
            take_opened_files
        ])
        .run(tauri::generate_context!())
        .expect("Sloth Note could not start");
}

#[cfg(test)]
mod drop_tests {
    use super::*;
    use std::fs;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let id = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!("sloth-drop-{}-{id}", std::process::id()));
            fs::create_dir_all(&root).unwrap();
            Self(root)
        }

        fn file(&self, name: &str, contents: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            fs::write(&path, contents).unwrap();
            path
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn window_drop(paths: Vec<PathBuf>) -> tauri::WindowEvent {
        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop {
            paths,
            position: tauri::PhysicalPosition::new(200.0, 300.0),
        })
    }

    #[test]
    fn window_drop_allows_note_and_image_imports_once() {
        let fixture = Fixture::new();
        let note = fixture.file("Nota com espaços.md", "# Olá 🦥\n\ntexto".as_bytes());
        let image = fixture.file("imagem.png", b"\x89PNG\r\n\x1a\n");
        let unrelated = fixture.file("outra.md", b"not dropped");
        let dropped = DroppedFiles::default();
        assert!(dropped.take(note.to_str().unwrap()).is_err());

        dropped.on_window_event(&window_drop(vec![
            note.clone(),
            image.clone(),
            note.clone(),
        ]));
        let source = dropped
            .take(
                fixture
                    .0
                    .join(".")
                    .join("Nota com espaços.md")
                    .to_str()
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(vault::read_dropped(&source).unwrap(), "# Olá 🦥\n\ntexto");
        assert!(dropped.take(note.to_str().unwrap()).is_err());
        assert!(dropped.take(unrelated.to_str().unwrap()).is_err());

        let source = dropped.take(image.to_str().unwrap()).unwrap();
        let imported = images::import_dropped(&fixture.0, &source).unwrap();
        assert_eq!(
            fs::read(fixture.0.join(imported)).unwrap(),
            b"\x89PNG\r\n\x1a\n"
        );
        assert!(dropped.take(image.to_str().unwrap()).is_err());
    }

    #[test]
    fn entering_or_leaving_the_window_does_not_authorize_a_file() {
        let fixture = Fixture::new();
        let note = fixture.file("a.txt", b"text");
        let dropped = DroppedFiles::default();
        dropped.on_window_event(&tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Enter {
            paths: vec![note.clone()],
            position: tauri::PhysicalPosition::new(200.0, 300.0),
        }));
        dropped.on_window_event(&tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Leave));
        assert!(dropped.take(note.to_str().unwrap()).is_err());
    }

    #[test]
    fn a_new_drop_replaces_unconsumed_paths_from_the_previous_drop() {
        let fixture = Fixture::new();
        let previous = fixture.file("previous.md", b"previous");
        let current = fixture.file("current.markdown", b"current");
        let dropped = DroppedFiles::default();
        dropped.on_window_event(&window_drop(vec![previous.clone()]));
        dropped.on_window_event(&window_drop(vec![current.clone()]));
        assert!(dropped.take(previous.to_str().unwrap()).is_err());
        let source = dropped.take(current.to_str().unwrap()).unwrap();
        assert_eq!(vault::read_dropped(&source).unwrap(), "current");
    }
}
