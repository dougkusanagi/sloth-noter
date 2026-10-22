use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
static LOCK: Mutex<()> = Mutex::new(());
fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
fn directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn write(path: &Path, bytes: &[u8], append: bool) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options
        .create(true)
        .write(true)
        .append(append)
        .truncate(!append);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_file_name(format!(
        "{}.pending",
        path.file_name()
            .ok_or("Invalid history path")?
            .to_string_lossy()
    ));
    write(&temporary, bytes, false)?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}
fn compressed(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut gzip = GzEncoder::new(Vec::new(), Compression::default());
    gzip.write_all(bytes).map_err(|e| e.to_string())?;
    gzip.finish().map_err(|e| e.to_string())
}
fn text(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if path.extension().is_some_and(|v| v == "gz") {
        let mut result = Vec::new();
        GzDecoder::new(bytes.as_slice())
            .read_to_end(&mut result)
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&result).into_owned())
    } else {
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }
}
fn note(root: &Path, id: &str) -> PathBuf {
    root.join(hash(id))
}
pub fn maintenance(root: &Path) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    maintain(root)
}
pub fn save_snapshot(root: &Path, content: &str) -> Result<String, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    snapshot(root, content)
}
pub fn snapshot(root: &Path, content: &str) -> Result<String, String> {
    directory(root)?;
    directory(&root.join("objects"))?;
    let digest = hash(content);
    let path = root.join("objects").join(format!("{digest}.md.gz"));
    if !path.exists() {
        atomic_write(&path, &compressed(content.as_bytes())?)?;
    }
    Ok(digest)
}
pub fn object(root: &Path, digest: &str) -> Result<String, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    if digest.len() != 64 || !digest.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid history object".into());
    }
    let result = text(&root.join("objects").join(format!("{digest}.md.gz")))?;
    if hash(&result) != digest {
        return Err("History object does not match its hash".into());
    }
    Ok(result)
}
pub fn append(root: &Path, entries: Vec<Value>) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    directory(root)?;
    for mut entry in entries {
        let id = entry["nota"]
            .as_str()
            .ok_or("Invalid history note")?
            .to_string();
        let before = entry["antes"]
            .as_str()
            .ok_or("Missing history base")?
            .to_string();
        let after = entry["depois"]
            .as_str()
            .ok_or("Missing history result")?
            .to_string();
        entry["base"] = snapshot(root, &before)?.into();
        entry["objeto"] = snapshot(root, &after)?.into();
        entry
            .as_object_mut()
            .ok_or("Invalid history entry")?
            .remove("antes");
        entry.as_object_mut().unwrap().remove("depois");
        let day = entry["dia"].as_str().ok_or("Invalid history day")?;
        if day.len() != 10 || !day.bytes().all(|c| c.is_ascii_digit() || c == b'-') {
            return Err("Invalid history day".into());
        }
        let folder = note(root, &id);
        directory(&folder)?;
        let mut line = serde_json::to_vec(&entry).map_err(|e| e.to_string())?;
        line.push(b'\n');
        let journal = folder.join(format!("{day}.jsonl"));
        repair_tail(&journal)?;
        write(&journal, &line, true)?;
    }
    // Appending never parses old journals or decompresses old objects. Full
    // maintenance runs at startup/daily, or when the storage budget is exceeded.
    if size(root) > 20 * 1024 * 1024 {
        maintain(root)?;
    }
    Ok(())
}
fn repair_tail(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let mut end = file.metadata().map_err(|e| e.to_string())?.len();
    if end == 0 {
        return Ok(());
    }
    // Normal append reads one byte, regardless of the journal's size.
    file.seek(SeekFrom::End(-1)).map_err(|e| e.to_string())?;
    let mut last = [0];
    file.read_exact(&mut last).map_err(|e| e.to_string())?;
    if last[0] == b'\n' {
        return Ok(());
    }
    let mut buffer = [0; 4096];
    while end > 0 {
        let start = end.saturating_sub(buffer.len() as u64);
        let length = (end - start) as usize;
        file.seek(SeekFrom::Start(start))
            .map_err(|e| e.to_string())?;
        file.read_exact(&mut buffer[..length])
            .map_err(|e| e.to_string())?;
        if let Some(index) = buffer[..length].iter().rposition(|b| *b == b'\n') {
            return file
                .set_len(start + index as u64 + 1)
                .map_err(|e| e.to_string());
        }
        end = start;
    }
    file.set_len(0).map_err(|e| e.to_string())
}
pub fn list(root: &Path, id: &str) -> Result<Vec<Value>, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let folder = note(root, id);
    if !folder.exists() {
        return Ok(vec![]);
    }
    let mut paths: Vec<_> = fs::read_dir(folder)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .collect();
    paths.sort();
    let mut entries = Vec::new();
    for path in paths {
        let raw = text(&path)?;
        for line in raw.split_terminator('\n') {
            match serde_json::from_str::<Value>(line) {
                Ok(value) => entries.push(value),
                Err(_) if !raw.ends_with('\n') && raw.ends_with(line) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
    }
    entries.sort_by_key(|e| e["t"].as_u64().unwrap_or(0));
    Ok(entries)
}
pub fn clear(root: &Path, id: Option<&str>) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    let path = id
        .map(|id| note(root, id))
        .unwrap_or_else(|| root.to_path_buf());
    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    maintain(root)
}
pub fn maintain(root: &Path) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut journals = Vec::new();
    let mut protected = std::collections::HashMap::new();
    for folder in fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
    {
        if !folder.path().is_dir() || folder.file_name() == "objects" {
            continue;
        }
        let mut latest = None;
        for file in fs::read_dir(folder.path())
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
        {
            let mut path = file.path();
            if path.extension().is_some_and(|v| v == "pending") {
                fs::remove_file(path).map_err(|e| e.to_string())?;
                continue;
            }
            let raw = text(&path)?;
            let entries: Vec<Value> = raw
                .lines()
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            for entry in &entries {
                if entry["externa"] == true && entry["origem"] == "abertura" {
                    let t = entry["t"].as_u64().unwrap_or(0);
                    if latest.as_ref().map_or(true, |(time, _)| t > *time) {
                        latest = Some((t, path.clone()));
                    }
                }
            }
            let timestamp = entries
                .iter()
                .filter_map(|e| e["t"].as_u64())
                .max()
                .unwrap_or(0)
                / 1000;
            if path.extension().is_some_and(|v| v == "jsonl") && timestamp / 86400 < now / 86400 {
                let target = path.with_extension("jsonl.gz");
                let combined = if target.exists() {
                    text(&target)? + &raw
                } else {
                    raw.clone()
                };
                atomic_write(&target, &compressed(combined.as_bytes())?)?;
                fs::remove_file(&path).map_err(|e| e.to_string())?;
                if let Some((_, p)) = &mut latest {
                    if *p == path {
                        *p = target.clone();
                    }
                }
                path = target;
            }
            journals.push((timestamp, path));
        }
        if let Some((time, path)) = latest {
            protected.insert(path, time);
        }
    }
    let mut unique = std::collections::BTreeMap::new();
    for (time, path) in journals {
        unique
            .entry(path)
            .and_modify(|t: &mut u64| *t = (*t).max(time))
            .or_insert(time);
    }
    let mut journals: Vec<_> = unique
        .into_iter()
        .map(|(path, time)| (time, path))
        .collect();
    journals.sort_by_key(|(time, _)| *time);
    // Count objects too, and collect unreferenced content after pruning each journal.
    for (timestamp, path) in journals {
        let size = size(root);
        if now.saturating_sub(timestamp) > 30 * 86400 || size > 20 * 1024 * 1024 {
            if let Some(time) = protected.get(&path) {
                let raw = text(&path)?;
                let kept: Vec<String> = raw
                    .lines()
                    .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                    .filter(|e| e["origem"] == "abertura" && e["t"].as_u64() == Some(*time))
                    .map(|e| e.to_string())
                    .collect();
                let bytes = (kept.join("\n") + "\n").into_bytes();
                write(
                    &path,
                    &if path.extension().is_some_and(|v| v == "gz") {
                        compressed(&bytes)?
                    } else {
                        bytes
                    },
                    false,
                )?;
            } else {
                fs::remove_file(path).map_err(|e| e.to_string())?;
            }
            collect(root)?;
        }
    }
    collect(root)
}
fn size(root: &Path) -> u64 {
    fs::read_dir(root)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|e| {
            if e.path().is_dir() {
                size(&e.path())
            } else {
                e.metadata().map(|m| m.len()).unwrap_or(0)
            }
        })
        .sum()
}
fn collect(root: &Path) -> Result<(), String> {
    let mut used = std::collections::HashSet::new();
    for folder in fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
    {
        if !folder.path().is_dir() || folder.file_name() == "objects" {
            continue;
        }
        for file in fs::read_dir(folder.path())
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
        {
            for line in text(&file.path())?.lines() {
                if let Ok(e) = serde_json::from_str::<Value>(line) {
                    for key in ["base", "objeto"] {
                        if let Some(hash) = e[key].as_str() {
                            used.insert(format!("{hash}.md.gz"));
                        }
                    }
                }
            }
        }
    }
    if let Ok(files) = fs::read_dir(root.join("objects")) {
        for file in files.filter_map(Result::ok) {
            if !used.contains(&file.file_name().to_string_lossy().to_string()) {
                fs::remove_file(file.path()).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_clear() {
        let root = std::env::temp_dir().join(format!("history-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let e = serde_json::json!({"nota":"../safe","dia":"2026-10-22","t":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64,"antes":"olá","depois":"olá 🦥"});
        append(&root, vec![e.clone(), e]).unwrap();
        let entries = list(&root, "../safe").unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(
            object(&root, entries[0]["objeto"].as_str().unwrap()).unwrap(),
            "olá 🦥"
        );
        assert_eq!(fs::read_dir(root.join("objects")).unwrap().count(), 2);
        let folder = note(&root, "../safe");
        let path = fs::read_dir(folder)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        write(&path, b"{\"cut\":\"\xf0\x9f", true).unwrap();
        assert_eq!(list(&root, "../safe").unwrap().len(), 2);
        clear(&root, Some("../safe")).unwrap();
        assert!(list(&root, "../safe").unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn retention_compresses_protects_external_and_enforces_size() {
        let root = std::env::temp_dir().join(format!("history-retention-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let old = now - 40 * 86400000;
        let external = serde_json::json!({"nota":"external","dia":"2020-01-01","t":old,"origem":"abertura","externa":true,"antes":"precious","depois":"precious"});
        append(&root, vec![external]).unwrap();
        maintenance(&root).unwrap();
        assert_eq!(list(&root, "external").unwrap().len(), 1);
        let regular = serde_json::json!({"nota":"regular","dia":"2020-01-01","t":old,"antes":"old","depois":"expired"});
        append(&root, vec![regular]).unwrap();
        maintenance(&root).unwrap();
        assert!(list(&root, "regular").unwrap().is_empty());
        assert!(note(&root, "external").join("2020-01-01.jsonl.gz").exists());
        let newer = serde_json::json!({"nota":"external","dia":"2099-01-01","t":now,"origem":"abertura","externa":true,"antes":"new","depois":"new"});
        append(&root, vec![newer]).unwrap();
        maintenance(&root).unwrap();
        assert_eq!(list(&root, "external").unwrap().len(), 1);
        let folder = note(&root, "oversized");
        directory(&folder).unwrap();
        let oversized =
            serde_json::json!({"t":now,"padding":"x".repeat(21*1024*1024)}).to_string() + "\n";
        write(
            &folder.join("2099-01-01.jsonl"),
            oversized.as_bytes(),
            false,
        )
        .unwrap();
        maintenance(&root).unwrap();
        assert!(size(&root) < 20 * 1024 * 1024);
        assert_eq!(object(&root, &hash("new")).unwrap(), "new");
        assert!(object(&root, "../../secret").is_err());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&root).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(root.join("objects").join(format!("{}.md.gz", hash("new"))))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn append_does_not_read_old_journals_and_repairs_only_the_incomplete_tail() {
        let root = std::env::temp_dir().join(format!("history-append-perf-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let unrelated = note(&root, "unrelated");
        directory(&unrelated).unwrap();
        // If appending scans/decompresses other notes, this fails immediately.
        write(&unrelated.join("2020-01-01.jsonl.gz"), b"not gzip", false).unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let entry = serde_json::json!({"nota":"typing","dia":"2099-01-01","t":now,"antes":"before","depois":"after"});
        append(&root, vec![entry.clone()]).unwrap();
        let journal = note(&root, "typing").join("2099-01-01.jsonl");
        // Repair must find a newline across multiple chunks without reading
        // the intact journal into memory before every append.
        write(&journal, &vec![b'x'; 9000], true).unwrap();
        append(&root, vec![entry]).unwrap();
        assert_eq!(list(&root, "typing").unwrap().len(), 2);
        fs::remove_dir_all(root).unwrap();
    }
}
