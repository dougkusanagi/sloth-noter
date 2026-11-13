//! Sync secrets in the system vault (ADR 0018): Secret Service on Linux, Credential
//! Manager on Windows, Keychain on macOS. Android keeps them through the Kotlin
//! Keystore bridge instead, so these commands report the vault as unavailable there.

const SERVICE: &str = "dev.slothnote.sync";
// Only these entries exist; the web layer cannot read or write other credentials.
const NAMES: [&str; 1] = ["sync"];

fn check(name: &str) -> Result<(), String> {
    if NAMES.contains(&name) {
        Ok(())
    } else {
        Err("Unknown secret".into())
    }
}

#[cfg(desktop)]
fn entry(name: &str) -> Result<keyring::Entry, String> {
    check(name)?;
    keyring::Entry::new(SERVICE, name).map_err(|_| "vault_unavailable".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        // Never include the platform message: it could carry account details.
        Err(_) => Err("vault_unavailable".into()),
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?
        .set_password(&value)
        .map_err(|_| "vault_unavailable".into())
}

#[cfg(desktop)]
#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("vault_unavailable".into()),
    }
}

#[cfg(mobile)]
#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    check(&name)?;
    Err("vault_unavailable".into())
}

#[cfg(mobile)]
#[tauri::command]
pub fn secret_set(name: String, _value: String) -> Result<(), String> {
    check(&name)?;
    Err("vault_unavailable".into())
}

#[cfg(mobile)]
#[tauri::command]
pub fn secret_delete(name: String) -> Result<(), String> {
    check(&name)?;
    Err("vault_unavailable".into())
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_names() {
        assert!(secret_get("other".into()).is_err());
        assert!(secret_set("../x".into(), "v".into()).is_err());
    }

    // Writes to the real vault; run with `cargo test -- --ignored` on a desktop session.
    #[test]
    #[ignore]
    fn round_trips_in_the_system_vault() {
        secret_set("sync".into(), "valor".into()).unwrap();
        assert_eq!(secret_get("sync".into()).unwrap().as_deref(), Some("valor"));
        secret_delete("sync".into()).unwrap();
        assert_eq!(secret_get("sync".into()).unwrap(), None);
        secret_delete("sync".into()).unwrap();
    }
}
