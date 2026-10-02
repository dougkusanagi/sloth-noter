//! Notes folder ("vault"): plain `.md` files directly inside a folder the user chose.
//!
//! The webview never sends paths, only file names, and every name is checked here.
//! Writes go through a hidden temporary file, and any change to an existing file is
//! refused when its current content is not the content the caller last saw, so an
//! edit made outside the app is never overwritten silently.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

const TEMPORARY_SUFFIX: &str = ".sloth-tmp";

#[derive(Serialize, Debug, PartialEq)]
pub struct VaultFile {
    pub name: String,
    pub contents: String,
}

/// Cheap change detector: size and modification time of every note file.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultStamp {
    pub name: String,
    pub len: u64,
    pub modified_ms: u128,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum VaultOp {
    /// `expected` is the content last seen; `None` means the file must not exist yet.
    Write {
        name: String,
        contents: String,
        expected: Option<String>,
    },
    Rename {
        from: String,
        to: String,
    },
    Remove {
        name: String,
        expected: String,
    },
}

pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && !name.starts_with('.')
        && !name.contains(['/', '\\', '\0'])
        && name.to_lowercase().ends_with(".md")
        && name.chars().count() > 3
}

fn checked(name: &str) -> Result<&str, String> {
    if valid_name(name) {
        Ok(name)
    } else {
        Err(format!("'{name}' is not a valid note file name"))
    }
}

fn read_optional(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Notes are the regular `.md` files at the top level. Hidden files, temporary files,
/// folders and files that are not valid UTF-8 are left alone and never listed.
pub fn list(root: &Path) -> io::Result<Vec<VaultFile>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if !valid_name(&name) || !entry.file_type()?.is_file() {
            continue;
        }
        if let Ok(contents) = fs::read_to_string(entry.path()) {
            files.push(VaultFile { name, contents });
        }
    }
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

const MAX_DROPPED_NOTE: u64 = 5 * 1024 * 1024;

/// Reads a Markdown or text file the user dropped on the window. The caller has
/// already checked that the path came from a native drop.
pub fn read_dropped(source: &Path) -> Result<String, String> {
    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_lowercase);
    if !matches!(extension.as_deref(), Some("md" | "markdown" | "txt")) {
        return Err("Only Markdown or text files can be imported as notes".into());
    }
    let metadata = fs::metadata(source).map_err(|error| crate::errors::describe(&error))?;
    if !metadata.is_file() || metadata.len() > MAX_DROPPED_NOTE {
        return Err("The file is not a regular file under 5 MB".into());
    }
    fs::read_to_string(source).map_err(|error| match error.kind() {
        io::ErrorKind::InvalidData => "The file is not valid UTF-8 text".to_string(),
        _ => crate::errors::describe(&error),
    })
}

pub fn stamps(root: &Path) -> io::Result<Vec<VaultStamp>> {
    let mut stamps = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if !valid_name(&name) || !entry.file_type()?.is_file() {
            continue;
        }
        let metadata = entry.metadata()?;
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |elapsed| elapsed.as_millis());
        stamps.push(VaultStamp {
            name,
            len: metadata.len(),
            modified_ms,
        });
    }
    stamps.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(stamps)
}

fn changed_outside(name: &str) -> String {
    format!("'{name}' was changed outside Sloth Note; its text was not overwritten")
}

pub fn apply(root: &Path, op: &VaultOp) -> Result<(), String> {
    let failed = |error: io::Error| crate::errors::describe(&error);
    match op {
        VaultOp::Write {
            name,
            contents,
            expected,
        } => {
            let path = root.join(checked(name)?);
            if read_optional(&path).map_err(failed)?.as_deref() != expected.as_deref() {
                return Err(changed_outside(name));
            }
            let temporary = root.join(format!(".{name}{TEMPORARY_SUFFIX}"));
            fs::write(&temporary, contents.as_bytes()).map_err(failed)?;
            fs::rename(&temporary, &path).map_err(|error| {
                let _ = fs::remove_file(&temporary);
                failed(error)
            })
        }
        VaultOp::Rename { from, to } => {
            let (from_path, to_path) = (root.join(checked(from)?), root.join(checked(to)?));
            // A case-only rename on a case-insensitive filesystem targets the same file.
            let same_file = matches!(
                (fs::canonicalize(&from_path), fs::canonicalize(&to_path)),
                (Ok(from), Ok(to)) if from == to
            );
            if to_path.exists() && !same_file {
                return Err(format!("'{to}' already exists"));
            }
            fs::rename(from_path, to_path).map_err(failed)
        }
        VaultOp::Remove { name, expected } => {
            let path = root.join(checked(name)?);
            match read_optional(&path).map_err(failed)? {
                None => Ok(()),
                Some(current) if &current == expected => fs::remove_file(path).map_err(failed),
                Some(_) => Err(changed_outside(name)),
            }
        }
    }
}

/// Stable, filesystem-safe name for the auxiliary state of one folder (FNV-1a).
pub fn aux_file_name(vault: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in vault.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("vault-{hash:016x}.v1.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn folder(name: &str) -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("sloth-vault-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn write(name: &str, contents: &str, expected: Option<&str>) -> VaultOp {
        VaultOp::Write {
            name: name.into(),
            contents: contents.into(),
            expected: expected.map(String::from),
        }
    }

    #[test]
    fn only_plain_markdown_names_are_accepted() {
        for name in ["a.md", "Olá 🦥.MD", "with space.md"] {
            assert!(valid_name(name), "{name}");
        }
        for name in [
            "",
            ".md",
            "a.txt",
            "../a.md",
            "dir/a.md",
            "dir\\a.md",
            ".hidden.md",
            "a\0.md",
        ] {
            assert!(!valid_name(name), "{name:?}");
        }
    }

    #[test]
    fn listing_skips_folders_hidden_temporary_and_non_markdown_files() {
        let root = folder("list");
        fs::write(root.join("b.md"), "B").unwrap();
        fs::write(root.join("A.md"), "olá\n\n").unwrap();
        fs::write(root.join("notes.txt"), "x").unwrap();
        fs::write(root.join(".a.md.sloth-tmp"), "x").unwrap();
        fs::write(root.join("binary.md"), [0xff, 0xfe, 0x00]).unwrap();
        fs::create_dir(root.join("sub.md")).unwrap();
        let names: Vec<_> = list(&root)
            .unwrap()
            .into_iter()
            .map(|file| file.name)
            .collect();
        assert_eq!(names, ["A.md", "b.md"]);
        assert_eq!(list(&root).unwrap()[0].contents, "olá\n\n");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn dropped_notes_must_be_small_utf8_markdown_or_text() {
        let root = folder("dropped");
        fs::write(root.join("a.md"), "# A").unwrap();
        fs::write(root.join("b.png"), "x").unwrap();
        fs::write(root.join("bad.txt"), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read_dropped(&root.join("a.md")).unwrap(), "# A");
        assert!(read_dropped(&root.join("b.png")).is_err());
        assert!(read_dropped(&root.join("bad.txt")).is_err());
        assert!(read_dropped(&root).is_err());
    }

    #[test]
    fn stamps_change_when_a_note_is_edited_added_or_removed() {
        let root = folder("stamps");
        fs::write(root.join("a.md"), "one").unwrap();
        fs::write(root.join("ignored.txt"), "x").unwrap();
        let before = stamps(&root).unwrap();
        assert_eq!(before.len(), 1);
        fs::write(root.join("a.md"), "longer text").unwrap();
        assert_ne!(stamps(&root).unwrap(), before);
        let edited = stamps(&root).unwrap();
        fs::write(root.join("b.md"), "x").unwrap();
        assert_eq!(stamps(&root).unwrap().len(), 2);
        fs::remove_file(root.join("b.md")).unwrap();
        assert_eq!(stamps(&root).unwrap(), edited);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_new_file_is_created_but_never_over_an_existing_one() {
        let root = folder("create");
        apply(&root, &write("a.md", "one", None)).unwrap();
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "one");
        assert!(apply(&root, &write("a.md", "two", None))
            .unwrap_err()
            .contains("outside"));
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "one");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn an_edit_made_outside_the_app_is_not_overwritten() {
        let root = folder("conflict");
        apply(&root, &write("a.md", "one", None)).unwrap();
        fs::write(root.join("a.md"), "edited elsewhere").unwrap();
        assert!(apply(&root, &write("a.md", "two", Some("one"))).is_err());
        assert_eq!(
            fs::read_to_string(root.join("a.md")).unwrap(),
            "edited elsewhere"
        );
        apply(&root, &write("a.md", "two", Some("edited elsewhere"))).unwrap();
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "two");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rename_refuses_to_replace_another_note() {
        let root = folder("rename");
        fs::write(root.join("a.md"), "A").unwrap();
        fs::write(root.join("b.md"), "B").unwrap();
        let clash = VaultOp::Rename {
            from: "a.md".into(),
            to: "b.md".into(),
        };
        assert!(apply(&root, &clash).is_err());
        let free = VaultOp::Rename {
            from: "a.md".into(),
            to: "c.md".into(),
        };
        apply(&root, &free).unwrap();
        assert_eq!(fs::read_to_string(root.join("c.md")).unwrap(), "A");
        assert_eq!(fs::read_to_string(root.join("b.md")).unwrap(), "B");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn removing_requires_the_content_the_app_last_saw() {
        let root = folder("remove");
        fs::write(root.join("a.md"), "A").unwrap();
        let stale = VaultOp::Remove {
            name: "a.md".into(),
            expected: "old".into(),
        };
        assert!(apply(&root, &stale).is_err());
        assert!(root.join("a.md").exists());
        let current = VaultOp::Remove {
            name: "a.md".into(),
            expected: "A".into(),
        };
        apply(&root, &current).unwrap();
        assert!(!root.join("a.md").exists());
        apply(&root, &current).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn names_that_escape_the_folder_are_rejected() {
        let root = folder("escape");
        assert!(apply(&root, &write("../evil.md", "x", None)).is_err());
        assert!(!root.parent().unwrap().join("evil.md").exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn auxiliary_files_are_stable_and_differ_per_folder() {
        assert_eq!(aux_file_name("/notes"), aux_file_name("/notes"));
        assert_ne!(aux_file_name("/notes"), aux_file_name("/other"));
    }
}
