use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const STATE_FILE: &str = "state.v3.json";
pub const PREVIOUS_FILE: &str = "state.v3.json.previous";
const TEMPORARY_FILE: &str = "state.v3.json.tmp";

pub fn state_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(STATE_FILE)
}

pub fn read_state(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Writes the document next to its previous version instead of truncating it.
///
/// The replacement is not atomic: Windows refuses to rename over an existing
/// file, so the previous state is moved aside first and restored if the
/// replacement fails. A reader never sees a half-written state file.
pub fn write_state(path: &Path, contents: &str) -> io::Result<()> {
    let directory = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "state path has no directory"))?;
    fs::create_dir_all(directory)?;
    let temporary = directory.join(TEMPORARY_FILE);
    fs::write(&temporary, contents.as_bytes())?;

    if !path.exists() {
        return fs::rename(&temporary, path);
    }

    let previous = directory.join(PREVIOUS_FILE);
    match fs::remove_file(&previous) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
    }
    fs::rename(path, &previous)?;
    match fs::rename(&temporary, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::rename(&previous, path);
            let _ = fs::remove_file(&temporary);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!("sloth-note-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        directory
    }

    #[test]
    fn a_missing_state_reads_as_none() {
        let directory = workspace("missing");
        assert_eq!(read_state(&state_path(&directory)).unwrap(), None);
    }

    #[test]
    fn writes_create_the_directory_and_keep_unicode_intact() {
        let directory = workspace("unicode");
        let path = state_path(&directory);
        let body = "{\"body\":\"olá 🦥\\n\\núltima linha\\n\"}";
        write_state(&path, body).unwrap();
        assert_eq!(read_state(&path).unwrap().unwrap(), body);
        assert!(directory.join(STATE_FILE).exists());
        assert!(!directory.join(TEMPORARY_FILE).exists());
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn replacing_a_state_keeps_the_previous_version_available() {
        let directory = workspace("replace");
        let path = state_path(&directory);
        write_state(&path, "first").unwrap();
        write_state(&path, "second").unwrap();
        assert_eq!(read_state(&path).unwrap().unwrap(), "second");
        assert_eq!(fs::read_to_string(directory.join(PREVIOUS_FILE)).unwrap(), "first");
        assert!(!directory.join(TEMPORARY_FILE).exists());
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn a_third_write_replaces_the_previous_version_instead_of_accumulating() {
        let directory = workspace("third");
        let path = state_path(&directory);
        write_state(&path, "first").unwrap();
        write_state(&path, "second").unwrap();
        write_state(&path, "third").unwrap();
        assert_eq!(read_state(&path).unwrap().unwrap(), "third");
        assert_eq!(fs::read_to_string(directory.join(PREVIOUS_FILE)).unwrap(), "second");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(&directory).unwrap();
    }
}
