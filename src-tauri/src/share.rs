use serde::Serialize;
use tauri::{plugin::PluginHandle, State, Wry};

pub struct Share(pub PluginHandle<Wry>);

#[derive(Serialize)]
struct ShareText<'a> {
    text: &'a str,
    title: &'a str,
}

#[tauri::command]
pub async fn share_text(
    share: State<'_, Share>,
    text: String,
    title: String,
) -> Result<(), String> {
    share
        .0
        .run_mobile_plugin_async::<serde_json::Value>(
            "shareText",
            ShareText {
                text: &text,
                title: &title,
            },
        )
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}
