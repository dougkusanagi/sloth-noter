use crate::{images, store};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
struct Journal {
    config: PathBuf,
    destination: String,
    created: Vec<(PathBuf, u64)>,
    aux: Option<PathBuf>,
}
fn hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(14695981039346656037, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(1099511628211)
    })
}
// Recover only files created by this migration. Files subsequently edited outside
// the app are retained. The original library is never modified.
pub fn recover(journal_path: &Path) -> Result<(), String> {
    let Some(contents) =
        store::read_state(journal_path).map_err(|e| crate::errors::describe(&e))?
    else {
        return Ok(());
    };
    let journal: Journal = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    let committed = store::read_state(&journal.config)
        .map_err(|e| crate::errors::describe(&e))?
        .and_then(|contents| serde_json::from_str::<serde_json::Value>(&contents).ok())
        .is_some_and(|value| value["path"].as_str() == Some(&journal.destination));
    if !committed {
        for (path, expected) in journal.created {
            match fs::read(&path) {
                Ok(bytes) if hash(&bytes) == expected => {
                    fs::remove_file(&path).map_err(|e| crate::errors::describe(&e))?
                }
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(crate::errors::describe(&error)),
            }
        }
        if let Some(aux) = journal.aux {
            store::remove_state(&aux).map_err(|e| crate::errors::describe(&e))?;
        }
    }
    store::remove_state(journal_path).map_err(|e| crate::errors::describe(&e))
}
pub fn activate(
    journal_path: &Path,
    config: &Path,
    target: &Path,
    files: &[(String, Vec<u8>)],
    aux: Option<(&Path, &str)>,
) -> Result<(), String> {
    recover(journal_path)?;
    let destination = target.to_string_lossy().to_string();
    let journal = Journal {
        config: config.to_path_buf(),
        destination: destination.clone(),
        created: files
            .iter()
            .filter(|(name, _)| !target.join(name).exists())
            .map(|(name, bytes)| (target.join(name), hash(bytes)))
            .collect(),
        aux: aux
            .filter(|(path, _)| !path.exists())
            .map(|(path, _)| path.to_path_buf()),
    };
    store::write_state(
        journal_path,
        &serde_json::to_string(&journal).map_err(|e| e.to_string())?,
    )
    .map_err(|e| crate::errors::describe(&e))?;
    let result = (|| {
        images::copy_files(target, files)?;
        if let Some((path, contents)) = aux {
            if !path.exists() {
                store::write_state(path, contents).map_err(|e| crate::errors::describe(&e))?;
            }
        }
        store::write_state(
            config,
            &serde_json::json!({"path": destination}).to_string(),
        )
        .map_err(|e| crate::errors::describe(&e))
    })();
    if let Err(error) = result {
        recover(journal_path).map_err(|recovery| format!("{error}; recovery: {recovery}"))?;
        return Err(error);
    }
    // Configuration is committed; a retained journal is safely cleaned on startup.
    let _ = recover(journal_path);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("sloth-migration-{name}-{}", std::process::id()));
        fs::create_dir_all(root.join("target")).unwrap();
        root
    }
    #[test]
    fn failure_after_copy_rolls_back_files_and_keeps_config() {
        let root = fixture("failure");
        let config = root.join("config");
        store::write_state(&config, "{\"path\":\"original\"}").unwrap();
        fs::write(root.join("blocked"), "keep").unwrap();
        assert!(activate(
            &root.join("journal"),
            &config,
            &root.join("target"),
            &[("note.md".into(), b"new".to_vec())],
            Some((&root.join("blocked/aux"), "{}"))
        )
        .is_err());
        assert!(!root.join("target/note.md").exists());
        assert!(store::read_state(&config)
            .unwrap()
            .unwrap()
            .contains("original"));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn interrupted_migration_preserves_external_edits() {
        let root = fixture("interrupted");
        let target = root.join("target");
        fs::write(target.join("note.md"), "new").unwrap();
        fs::write(target.join("edited.md"), "external").unwrap();
        let journal = Journal {
            config: root.join("config"),
            destination: target.to_string_lossy().into(),
            created: vec![
                (target.join("note.md"), hash(b"new")),
                (target.join("edited.md"), hash(b"new")),
            ],
            aux: None,
        };
        store::write_state(
            &root.join("journal"),
            &serde_json::to_string(&journal).unwrap(),
        )
        .unwrap();
        recover(&root.join("journal")).unwrap();
        assert!(!target.join("note.md").exists());
        assert_eq!(fs::read(target.join("edited.md")).unwrap(), b"external");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn committed_migration_retains_files_and_metadata() {
        let root = fixture("success");
        let target = root.join("target");
        activate(
            &root.join("journal"),
            &root.join("config"),
            &target,
            &[("note.md".into(), b"new".to_vec())],
            Some((&root.join("aux"), "{}")),
        )
        .unwrap();
        recover(&root.join("journal")).unwrap();
        assert!(target.join("note.md").exists());
        assert!(root.join("aux").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
