//! Disk failures reach the webview as `[code] system message`. The code is stable
//! and language independent, so the interface can explain the common cases itself.

use std::io;

fn code(kind: io::ErrorKind) -> Option<&'static str> {
    match kind {
        io::ErrorKind::NotFound => Some("not-found"),
        io::ErrorKind::PermissionDenied => Some("denied"),
        io::ErrorKind::ReadOnlyFilesystem => Some("read-only"),
        io::ErrorKind::StorageFull | io::ErrorKind::QuotaExceeded => Some("disk-full"),
        _ => None,
    }
}

pub fn describe(error: &io::Error) -> String {
    match code(error.kind()) {
        Some(code) => format!("[{code}] {error}"),
        None => error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_failures_carry_a_stable_code() {
        let full = io::Error::from(io::ErrorKind::StorageFull);
        assert!(describe(&full).starts_with("[disk-full] "));
        let denied = io::Error::from(io::ErrorKind::PermissionDenied);
        assert!(describe(&denied).starts_with("[denied] "));
    }

    #[test]
    fn other_failures_keep_the_system_message() {
        let other = io::Error::other("boom");
        assert_eq!(describe(&other), "boom");
    }
}
