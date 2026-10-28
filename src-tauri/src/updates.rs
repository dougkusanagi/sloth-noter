use tauri::AppHandle;
#[cfg(target_os = "linux")]
use tauri::Manager;

#[tauri::command]
pub fn update_environment(app: AppHandle) -> bool {
    #[cfg(target_os = "linux")]
    return !cfg!(debug_assertions) && app.env().appimage.is_some();
    #[cfg(target_os = "windows")]
    return !cfg!(debug_assertions);
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub fn update_restart(app: AppHandle) -> Result<(), String> {
    if !update_environment(app.clone()) {
        return Err("Automatic updates require an installed desktop build".into());
    }
    app.restart();
}
