//! Per-user saved profile. The service runs as the signed-in user, so the state lives in
//! that user's `%LOCALAPPDATA%`, whose default ACL already excludes other users.
use crate::proto::MAX_MESSAGE;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use ultimate_keyboards_engine::Profile;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Saved {
    pub version: u32,
    pub profile: Profile,
    pub enabled: bool,
}

pub fn state_dir(local_app_data: Option<OsString>) -> Option<PathBuf> {
    let base = PathBuf::from(local_app_data.filter(|s| !s.is_empty())?);
    base.is_absolute()
        .then(|| base.join("com.ultimatekeyboards.app").join("Native").join("state"))
}

/// Atomically replaces `profile.json`.
pub fn write(dir: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Cannot create the state folder: {e}"))?;
    let temp = dir.join("profile.new");
    let result = (|| {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, dir.join("profile.json"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| format!("Cannot save the profile: {e}"))
}

pub fn load(dir: &Path) -> Result<Option<Saved>, String> {
    let _ = fs::remove_file(dir.join("profile.new")); // an interrupted write never wins
    let path = dir.join("profile.json");
    let Ok(meta) = fs::symlink_metadata(&path) else {
        return Ok(None);
    };
    if !meta.is_file() || meta.len() > MAX_MESSAGE as u64 {
        return Err("Stored profile is not a regular file of a sane size".into());
    }
    let saved: Saved = serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Stored profile is invalid: {e}"))?;
    if saved.version != 1 {
        return Err("Unsupported stored state version".into());
    }
    Ok(Some(saved))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("uk-win-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn dir_needs_an_absolute_local_app_data() {
        assert!(state_dir(None).is_none());
        assert!(state_dir(Some("".into())).is_none());
        assert!(state_dir(Some("relative".into())).is_none());
        let d = state_dir(Some(std::env::temp_dir().into())).unwrap();
        assert!(d.ends_with("com.ultimatekeyboards.app/Native/state"));
    }

    #[test]
    fn round_trip_and_stale_temp_cleanup() {
        let dir = temp("rt");
        assert!(load(&dir).unwrap().is_none());
        let saved = Saved { version: 1, profile: Profile::default(), enabled: true };
        write(&dir, &serde_json::to_vec(&saved).unwrap()).unwrap();
        fs::write(dir.join("profile.new"), b"half").unwrap();
        let back = load(&dir).unwrap().unwrap();
        assert!(back.enabled && back.profile.rules.is_empty());
        assert!(!dir.join("profile.new").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_or_unknown_state_is_rejected() {
        let dir = temp("bad");
        for bad in [&b"{"[..], br#"{"version":2,"profile":{"version":1,"rules":[]},"enabled":false}"#,
            br#"{"version":1,"profile":{"version":1,"rules":[]},"enabled":false,"x":1}"#] {
            write(&dir, bad).unwrap();
            assert!(load(&dir).is_err());
        }
        fs::remove_dir_all(&dir).unwrap();
    }
}
