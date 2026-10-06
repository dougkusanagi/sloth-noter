use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub fn image_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let relative = Path::new(name);
    if !relative
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
        || name.contains('\\')
    {
        return Err("Invalid image path".into());
    }
    let extension = relative
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"].contains(&extension.as_str()) {
        return Err("Unsupported image format".into());
    }
    let mut path = root.to_path_buf();
    for part in relative.components() {
        path.push(part.as_os_str());
        if fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink()) {
            return Err("Symbolic links are not supported for images".into());
        }
    }
    Ok(path)
}
pub fn references_image(markdown: &str, name: &str) -> bool {
    use pulldown_cmark::{Event, Options, Parser, Tag};
    fn normalize(source: &str) -> String {
        let source = source.strip_prefix("./").unwrap_or(source);
        percent_encoding::percent_decode_str(source)
            .decode_utf8_lossy()
            .into_owned()
    }
    let name = normalize(name);
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS;
    Parser::new_ext(markdown, options).any(|event| match event {
        Event::Start(Tag::Image { dest_url, .. }) => normalize(&dest_url) == name,
        _ => false,
    })
}

pub fn delete(root: &Path, name: &str) -> Result<(), String> {
    let path = image_path(root, name)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(crate::errors::describe(&error)),
    }
}

pub fn list(root: &Path) -> Result<Vec<String>, String> {
    fn visit(root: &Path, dir: &Path, depth: usize, found: &mut Vec<String>) -> Result<(), String> {
        if depth > 8 || !dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(dir).map_err(|e| crate::errors::describe(&e))? {
            let entry = entry.map_err(|e| crate::errors::describe(&e))?;
            let kind = entry.file_type().map_err(|e| crate::errors::describe(&e))?;
            if kind.is_symlink() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            if kind.is_dir() {
                visit(root, &entry.path(), depth + 1, found)?;
            } else {
                let name = entry
                    .path()
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                if image_path(root, &name).is_ok() {
                    found.push(name);
                }
            }
        }
        Ok(())
    }
    let mut found = Vec::new();
    visit(root, root, 0, &mut found)?;
    found.sort();
    Ok(found)
}

// Preflight the complete copy before writing; originals and conflicting targets survive.
pub fn copy_files(target: &Path, files: &[(String, Vec<u8>)]) -> Result<(), String> {
    for (name, bytes) in files {
        let path = target.join(name);
        let mut ancestor = Some(path.as_path());
        while let Some(part) = ancestor {
            if fs::symlink_metadata(part).is_ok_and(|meta| meta.file_type().is_symlink()) {
                return Err("Symbolic links are not supported".into());
            }
            if part == target {
                break;
            }
            ancestor = part.parent();
        }
        if path.exists() && fs::read(&path).map_err(|e| crate::errors::describe(&e))? != *bytes {
            return Err(format!("A different file already exists: {name}"));
        }
    }
    let mut created = Vec::new();
    let result = (|| -> Result<(), String> {
        for (name, bytes) in files {
            let path = target.join(name);
            if path.exists() {
                continue;
            }
            fs::create_dir_all(path.parent().unwrap()).map_err(|e| crate::errors::describe(&e))?;
            use std::io::Write;
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(|e| crate::errors::describe(&e))?;
            created.push(path);
            file.write_all(bytes)
                .and_then(|_| file.sync_all())
                .map_err(|e| crate::errors::describe(&e))?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        for path in created {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }
    Ok(())
}
pub fn import_dropped(root: &Path, source: &Path) -> Result<String, String> {
    let metadata = fs::metadata(source).map_err(|e| crate::errors::describe(&e))?;
    if !metadata.is_file() || metadata.len() > 20 * 1024 * 1024 {
        return Err("Invalid image size or file".into());
    }
    let filename = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid image filename")?;
    let readable: String = filename
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || ".-_".contains(character) {
                character
            } else {
                '-'
            }
        })
        .collect();
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let name = format!("assets/{id:x}-{readable}");
    image_path(root, &name)?;
    let bytes = fs::read(source).map_err(|e| crate::errors::describe(&e))?;
    let valid = bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        || bytes.starts_with(b"\xff\xd8\xff")
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || bytes.starts_with(b"BM")
        || (bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"))
        || (bytes.get(4..8) == Some(b"ftyp")
            && [b"avif".as_slice(), b"avis".as_slice()].contains(&bytes.get(8..12).unwrap_or(&[])));
    if !valid {
        return Err("Unsupported image contents".into());
    }
    copy_files(root, &[(name.clone(), bytes)])?;
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deletion_checks_real_markdown_images_instead_of_filename_mentions() {
        for text in [
            "photo.png is an unused file",
            "`![Photo](photo.png)`",
            "```md\n![Photo](photo.png)\n```",
            "\\![Photo](photo.png)",
            "[Download](photo.png)",
            "![Other](old-photo.png)",
            "![Other](photos/photo.png)",
            "[unused]: photo.png",
        ] {
            assert!(!references_image(text, "photo.png"), "{text}");
        }
        for text in [
            "![Photo](photo.png)",
            "![Photo](./photo.png)",
            "![Photo](<photo.png> \"Title\")",
            "![Photo][ref]\n\n[ref]: photo.png",
            "![ref]\n\n[ref]: photo.png",
            "| Photo |\n| --- |\n| ![Photo](photo.png) |",
            "[^note]: ![Photo](photo.png)",
        ] {
            assert!(references_image(text, "photo.png"), "{text}");
        }
        assert!(references_image(
            "![Photo](./photos/Pasted%20image.png)",
            "photos/Pasted image.png"
        ));
    }
    #[test]
    fn unused_library_images_can_be_deleted_from_root_or_subfolders() {
        let root = std::env::temp_dir().join(format!("sloth-image-delete-{}", std::process::id()));
        fs::create_dir_all(root.join("photos")).unwrap();
        fs::write(root.join("keep.md"), "note").unwrap();
        for name in ["Pasted image.png", "photos/a.png"] {
            fs::write(root.join(name), b"image").unwrap();
            delete(&root, name).unwrap();
            assert!(!root.join(name).exists());
            delete(&root, name).unwrap();
        }
        assert!(delete(&root, "keep.md").is_err());
        assert!(delete(&root, "../outside.png").is_err());
        assert!(root.join("keep.md").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn dropped_files_are_copied_to_assets_with_valid_markdown_paths() {
        let root = std::env::temp_dir().join(format!("sloth-native-drop-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("#101 Calça Jeans Básica.png");
        let bytes = b"\x89PNG\r\n\x1a\nimage";
        fs::write(&source, bytes).unwrap();
        for destination in [root.join("app-data"), root.join("configured-vault")] {
            let name = import_dropped(&destination, &source).unwrap();
            assert!(name.starts_with("assets/"));
            assert!(!name.contains(' '));
            assert_eq!(fs::read(destination.join(name)).unwrap(), bytes);
            assert_eq!(fs::read(&source).unwrap(), bytes);
        }
        let invalid = root.join("invalid.png");
        fs::write(&invalid, "not an image").unwrap();
        assert!(import_dropped(&root.join("app-data"), &invalid).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_escaping_paths() {
        for name in [
            "../a.png",
            "/a.png",
            "assets/../../a.png",
            "a.svg",
            "assets\\a.png",
        ] {
            assert!(image_path(Path::new("/tmp"), name).is_err());
        }
        assert!(image_path(Path::new("/tmp"), "assets/a.png").is_ok());
    }
    #[test]
    fn conflicts_are_found_before_copying() {
        let root = std::env::temp_dir().join(format!("sloth-copy-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("b.md"), "original").unwrap();
        assert!(copy_files(
            &root,
            &[
                ("a.md".into(), b"new".to_vec()),
                ("b.md".into(), b"different".to_vec())
            ]
        )
        .is_err());
        assert!(!root.join("a.md").exists());
        assert_eq!(fs::read(root.join("b.md")).unwrap(), b"original");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn copying_notes_and_images_preserves_originals_and_relative_paths() {
        let root = std::env::temp_dir().join(format!("sloth-assets-{}", std::process::id()));
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(source.join("assets")).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("note.md"), "![Photo](assets/photo.png)").unwrap();
        fs::write(source.join("assets/photo.png"), [1, 2, 3]).unwrap();
        let files = vec![
            ("note.md".into(), fs::read(source.join("note.md")).unwrap()),
            (
                "assets/photo.png".into(),
                fs::read(source.join("assets/photo.png")).unwrap(),
            ),
        ];
        copy_files(&target, &files).unwrap();
        assert_eq!(list(&target).unwrap(), vec!["assets/photo.png"]);
        for (name, bytes) in files {
            assert_eq!(fs::read(source.join(&name)).unwrap(), bytes);
            assert_eq!(fs::read(target.join(&name)).unwrap(), bytes);
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_copy_removes_new_files_without_touching_existing_ones() {
        let root = std::env::temp_dir().join(format!("sloth-rollback-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("blocked"), "keep").unwrap();
        let result = copy_files(
            &root,
            &[
                ("a.md".into(), b"new".to_vec()),
                ("blocked/b.png".into(), vec![1]),
            ],
        );
        assert!(result.is_err());
        assert!(!root.join("a.md").exists());
        assert_eq!(fs::read(root.join("blocked")).unwrap(), b"keep");
        fs::remove_dir_all(root).unwrap();
    }
}
