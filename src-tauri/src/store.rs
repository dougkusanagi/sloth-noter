use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const STATE_FILE: &str = "state.v3.json";
#[cfg(test)]
pub const PREVIOUS_FILE: &str = "state.v3.json.previous";
#[cfg(test)]
const TEMPORARY_FILE: &str = "state.v3.json.tmp";

// Readers must not observe the gap between replacements, and mutations must
// not race while sharing temporary paths.
static STATE_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn state_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(STATE_FILE)
}

pub fn read_state(path: &Path) -> io::Result<Option<String>> {
    let _guard = STATE_WRITE_LOCK
        .lock()
        .map_err(|_| io::Error::other("state file lock poisoned"))?;
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            match fs::read_to_string(sibling(path, ".previous")) {
                Ok(contents) => Ok(Some(contents)),
                Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    }
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}
pub fn remove_state(path: &Path) -> io::Result<()> {
    let _guard = STATE_WRITE_LOCK
        .lock()
        .map_err(|_| io::Error::other("state file lock poisoned"))?;
    for candidate in [
        sibling(path, ".previous"),
        sibling(path, ".tmp"),
        path.to_path_buf(),
    ] {
        match fs::remove_file(candidate) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

/// Writes the document next to its previous version instead of truncating it.
///
/// The replacement is not atomic: Windows refuses to rename over an existing
/// file, so the previous state is moved aside first and restored if the
/// replacement fails. A reader never sees a half-written state file.
pub fn write_state(path: &Path, contents: &str) -> io::Result<()> {
    write_state_with(path, contents, |temporary, destination| {
        fs::rename(temporary, destination)
    })
}

fn write_state_with(
    path: &Path,
    contents: &str,
    publish: impl FnOnce(&Path, &Path) -> io::Result<()>,
) -> io::Result<()> {
    let _guard = STATE_WRITE_LOCK
        .lock()
        .map_err(|_| io::Error::other("state file lock poisoned"))?;
    let directory = path.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "state path has no directory")
    })?;
    fs::create_dir_all(directory)?;
    let temporary = sibling(path, ".tmp");
    let mut file = fs::File::create(&temporary)?;
    file.write_all(contents.as_bytes())?;
    file.sync_all()?;
    drop(file);

    if !path.exists() {
        let result = publish(&temporary, path);
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        return result;
    }

    let previous = sibling(path, ".previous");
    match fs::remove_file(&previous) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(error);
        }
    }
    if let Err(error) = fs::rename(path, &previous) {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    match publish(&temporary, path) {
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
        let directory =
            std::env::temp_dir().join(format!("sloth-note-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        directory
    }

    #[test]
    fn interrupted_replacement_reads_previous_and_removal_clears_recovery() {
        let directory = workspace("recovery");
        let path = state_path(&directory);
        write_state(&path, "first").unwrap();
        write_state(&path, "second").unwrap();
        fs::remove_file(&path).unwrap();
        assert_eq!(read_state(&path).unwrap().unwrap(), "first");
        remove_state(&path).unwrap();
        assert_eq!(read_state(&path).unwrap(), None);
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn separate_state_files_do_not_share_temporary_or_previous_versions() {
        let directory = workspace("separate");
        let state = state_path(&directory);
        let aux = directory.join("vault-aux.json");
        write_state(&state, "state one").unwrap();
        write_state(&aux, "aux one").unwrap();
        write_state(&state, "state two").unwrap();
        write_state(&aux, "aux two").unwrap();
        assert_eq!(
            fs::read_to_string(sibling(&state, ".previous")).unwrap(),
            "state one"
        );
        assert_eq!(
            fs::read_to_string(sibling(&aux, ".previous")).unwrap(),
            "aux one"
        );
        fs::remove_dir_all(directory).unwrap();
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
        assert_eq!(
            fs::read_to_string(directory.join(PREVIOUS_FILE)).unwrap(),
            "first"
        );
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
        assert_eq!(
            fs::read_to_string(directory.join(PREVIOUS_FILE)).unwrap(),
            "second"
        );
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn simultaneous_replacements_keep_a_complete_state() {
        let directory = workspace("simultaneous");
        let path = state_path(&directory);
        let mut writers = Vec::new();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        for writer in 0..8 {
            let path = path.clone();
            let barrier = barrier.clone();
            writers.push(std::thread::spawn(move || {
                barrier.wait();
                for write in 0..20 {
                    write_state(
                        &path,
                        &format!("writer-{writer}-write-{write}:{}", "á🦥".repeat(1024)),
                    )
                    .unwrap();
                }
            }));
        }
        for writer in writers {
            writer.join().unwrap();
        }

        let state = fs::read_to_string(&path).unwrap();
        let previous = fs::read_to_string(sibling(&path, ".previous")).unwrap();
        let expected: std::collections::HashSet<String> = (0..8)
            .flat_map(|writer| {
                (0..20).map(move |write| {
                    format!("writer-{writer}-write-{write}:{}", "á🦥".repeat(1024))
                })
            })
            .collect();
        assert!(expected.contains(&state));
        assert!(expected.contains(&previous));
        assert_ne!(state, previous);
        assert!(!sibling(&path, ".tmp").exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_publish_restores_the_last_saved_document() {
        let directory = workspace("failed-publish");
        let path = state_path(&directory);
        write_state(&path, "older").unwrap();
        write_state(&path, "latest saved").unwrap();
        let error = write_state_with(&path, "unsaved", |_, _| {
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        })
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(read_state(&path).unwrap().as_deref(), Some("latest saved"));
        assert!(!sibling(&path, ".tmp").exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_initial_publish_leaves_no_partial_document() {
        let directory = workspace("failed-first-publish");
        let path = state_path(&directory);
        assert!(write_state_with(&path, "unsaved", |_, _| {
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        })
        .is_err());
        assert_eq!(read_state(&path).unwrap(), None);
        assert!(!sibling(&path, ".tmp").exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn concurrent_reads_never_report_a_saved_document_as_missing() {
        let directory = workspace("concurrent-reads");
        let path = state_path(&directory);
        write_state(&path, "initial").unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let writer_path = path.clone();
        let writer_barrier = barrier.clone();
        let writer = std::thread::spawn(move || {
            writer_barrier.wait();
            for index in 0..60 {
                write_state(
                    &writer_path,
                    if index % 2 == 0 { "first" } else { "second" },
                )
                .unwrap();
            }
        });
        barrier.wait();
        for _ in 0..120 {
            let value = read_state(&path).unwrap().unwrap();
            assert!(["initial", "first", "second"].contains(&value.as_str()));
        }
        writer.join().unwrap();
        fs::remove_dir_all(directory).unwrap();
    }
}
