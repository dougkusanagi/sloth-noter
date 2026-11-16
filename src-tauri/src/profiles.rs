//! Profile catalog is stored separately from each profile's notes.
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Catalog {
    pub active: String,
    pub profiles: Vec<Profile>,
}

pub fn valid_id(id: &str) -> bool {
    if id == "primary" {
        return true;
    }
    let bytes = id.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => *b == b'-',
            14 => *b == b'4',
            19 => matches!(*b, b'8' | b'9' | b'a' | b'b'),
            _ => b.is_ascii_digit() || (b'a'..=b'f').contains(b),
        })
}

pub fn validate(catalog: &Catalog) -> bool {
    if catalog.profiles.is_empty() || catalog.profiles.len() > 5 {
        return false;
    }
    let mut ids = std::collections::HashSet::new();
    for profile in &catalog.profiles {
        if !valid_id(&profile.id)
            || profile.name.trim().is_empty()
            || profile.name.chars().count() > 100
            || !ids.insert(&profile.id)
        {
            return false;
        }
    }
    ids.contains(&"primary".to_string()) && ids.contains(&catalog.active)
}

pub fn load(root: &Path) -> Result<Catalog, String> {
    let text = crate::store::read_state(&root.join("profiles.json")).map_err(|e| e.to_string())?;
    let catalog = match text {
        Some(text) => serde_json::from_str(&text).map_err(|_| "invalid_profiles".to_string())?,
        None => Catalog {
            active: "primary".into(),
            profiles: vec![Profile {
                id: "primary".into(),
                name: "Principal".into(),
            }],
        },
    };
    if validate(&catalog) {
        Ok(catalog)
    } else {
        Err("invalid_profiles".into())
    }
}

pub fn save(root: &Path, catalog: &Catalog) -> Result<(), String> {
    if !validate(catalog) {
        return Err("invalid_profiles".into());
    }
    let text = serde_json::to_string(catalog).map_err(|e| e.to_string())?;
    crate::store::write_state(&root.join("profiles.json"), &text).map_err(|e| e.to_string())
}

/// The selected directory is fixed for the process lifetime, so an in-flight
/// write can never follow a catalog change into another profile.
pub fn data_dir(root: &Path, id: &str) -> Result<std::path::PathBuf, String> {
    if !valid_id(id) {
        return Err("invalid_profiles".into());
    }
    Ok(if id == "primary" {
        root.to_path_buf()
    } else {
        root.join("profiles").join(id)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_catalogs_and_traversal() {
        let mut c = Catalog {
            active: "primary".into(),
            profiles: vec![Profile {
                id: "primary".into(),
                name: "Principal".into(),
            }],
        };
        assert!(validate(&c));
        c.profiles.push(Profile {
            id: "../secret".into(),
            name: "x".into(),
        });
        assert!(!validate(&c));
        assert!(valid_id("00000000-0000-4000-8000-000000000001"));
        let root = Path::new("/tmp/sloth-example");
        assert_eq!(data_dir(root, "primary").unwrap(), root);
        assert!(data_dir(root, "../secret").is_err());
        assert_eq!(
            data_dir(root, "00000000-0000-4000-8000-000000000001").unwrap(),
            root.join("profiles/00000000-0000-4000-8000-000000000001")
        );
    }
}
