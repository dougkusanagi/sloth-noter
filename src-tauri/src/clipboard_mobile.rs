// Android delivers clipboard contents through the WebView's native paste event.
pub fn read() -> Result<Option<serde_json::Value>, String> {
    Ok(None)
}

pub type Contents = serde_json::Value;
