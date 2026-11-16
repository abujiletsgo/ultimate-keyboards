//! macOS: hidutil, Karabiner-Elements files, `/usr/bin/open`, Accessibility.

use std::process::Command;

/// `hidutil --matching` selector for the MacBook's built-in keyboard. The product
/// string is the same across Intel and Apple-Silicon MacBooks.
const BUILTIN_KEYBOARD_MATCH: &str = r#"{"Product":"Apple Internal Keyboard / Trackpad"}"#;

/// Build the `hidutil` `UserKeyMapping` payload. When disabling, every keyboard
/// usage in the standard range (0x04–0xE7) is remapped to the reserved usage
/// 0xFF, which the system ignores — effectively muting the device. An empty
/// `UserKeyMapping` array clears any mapping we previously installed.
fn key_mapping_payload(disabled: bool) -> String {
    if !disabled {
        return r#"{"UserKeyMapping":[]}"#.to_string();
    }
    const KEYBOARD_PAGE: u64 = 0x7_0000_0000;
    const RESERVED_USAGE: u64 = KEYBOARD_PAGE + 0xFF;
    let entries: Vec<String> = (0x04u64..=0xE7u64)
        .map(|usage| {
            format!(
                r#"{{"HIDKeyboardModifierMappingSrc":{},"HIDKeyboardModifierMappingDst":{}}}"#,
                KEYBOARD_PAGE + usage,
                RESERVED_USAGE
            )
        })
        .collect();
    format!(r#"{{"UserKeyMapping":[{}]}}"#, entries.join(","))
}

/// Run `hidutil` to disable or restore the built-in keyboard. Does not touch any
/// other (external / split) keyboard because of the `--matching` selector.
fn run_hidutil(disabled: bool) -> Result<(), String> {
    let output = Command::new("/usr/bin/hidutil")
        .args([
            "property",
            "--matching",
            BUILTIN_KEYBOARD_MATCH,
            "--set",
            &key_mapping_payload(disabled),
        ])
        .output()
        .map_err(|e| format!("Failed to run hidutil: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "hidutil exited with {:?}: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

/// Karabiner-Elements (if installed) seizes keyboards itself, so a plain
/// `hidutil` remap of the built-in keyboard is ignored while it runs. To cover
/// that case we also flip `disable_built_in_keyboard_if_exists` on every
/// *external* keyboard in `karabiner.json` — Karabiner watches the file and
/// reloads it automatically. Entirely best-effort: any problem is ignored so it
/// can never break the toggle (or the user's Karabiner config).
fn patch_karabiner_disable_builtin(disabled: bool) {
    const APPLE_VENDOR_ID: i64 = 1452; // 0x05ac

    let Some(home) = std::env::var_os("HOME") else { return };
    let path = std::path::Path::new(&home).join(".config/karabiner/karabiner.json");
    if !path.exists() {
        return;
    }
    let Ok(text) = std::fs::read_to_string(&path) else { return };
    let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&text) else { return };

    let mut changed = false;
    if let Some(profiles) = json.get_mut("profiles").and_then(|v| v.as_array_mut()) {
        for profile in profiles.iter_mut() {
            let Some(devices) = profile.get_mut("devices").and_then(|v| v.as_array_mut()) else {
                continue;
            };
            for device in devices.iter_mut() {
                let ident = device.get("identifiers");
                let is_kbd = ident
                    .and_then(|i| i.get("is_keyboard"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let vendor = ident
                    .and_then(|i| i.get("vendor_id"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                if is_kbd && vendor != APPLE_VENDOR_ID {
                    let current = device
                        .get("disable_built_in_keyboard_if_exists")
                        .and_then(|v| v.as_bool());
                    if current != Some(disabled) {
                        device["disable_built_in_keyboard_if_exists"] =
                            serde_json::Value::Bool(disabled);
                        changed = true;
                    }
                }
            }
        }
    }

    // Nothing to do → never touch the file (a no-op toggle or quit must leave
    // karabiner.json byte-identical).
    if !changed {
        return;
    }
    let Ok(pretty) = serde_json::to_string_pretty(&json) else { return };
    let _ = write_atomic_with_backup(&path, &format!("{pretty}\n"), &text);
}

/// Write `contents` to `path` without ever leaving a truncated file behind:
/// keep one `.bak` of the previous contents, write a sibling temp file, then
/// rename it over the target (atomic on the same filesystem).
fn write_atomic_with_backup(
    path: &std::path::Path,
    contents: &str,
    previous: &str,
) -> std::io::Result<()> {
    let ext = path.extension().and_then(|e| e.to_str());
    let bak = path.with_extension(ext.map(|e| format!("{e}.bak")).unwrap_or_else(|| "bak".into()));
    let tmp = path.with_extension(ext.map(|e| format!("{e}.tmp")).unwrap_or_else(|| "tmp".into()));
    std::fs::write(&bak, previous)?;
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, path)
}

/// Turn the laptop's built-in keyboard off (`true`) or back on (`false`).
pub fn set_builtin_keyboard(disabled: bool) -> Result<(), String> {
    run_hidutil(disabled)?;
    patch_karabiner_disable_builtin(disabled);
    Ok(())
}

/// Write a complex-modifications rule file where Karabiner-Elements looks for
/// them (`~/.config/karabiner/assets/complex_modifications/`). The file name is
/// derived from the profile title; the JSON is written atomically with a
/// backup. Returns the path written.
pub fn install_karabiner_rules(title: &str, json: &str) -> Result<String, String> {
    if json.len() > 2_000_000 {
        return Err("rule file is unexpectedly large".into());
    }
    serde_json::from_str::<serde_json::Value>(json).map_err(|e| format!("not valid JSON: {e}"))?;
    let Some(home) = std::env::var_os("HOME") else { return Err("HOME is not set".into()) };
    let dir = std::path::Path::new(&home).join(".config/karabiner/assets/complex_modifications");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let slug: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let slug = if slug.is_empty() { "ultimate-keyboards".to_string() } else { slug };
    let path = dir.join(format!("{slug}.json"));
    let previous = std::fs::read_to_string(&path).unwrap_or_default();
    write_atomic_with_backup(&path, json, &previous).map_err(|e| format!("write failed: {e}"))?;
    Ok(path.display().to_string())
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

/// Whether macOS has granted this app Accessibility (needed for the scroll tap).
pub fn accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

fn open_with_system(arg: &str) -> Result<(), String> {
    Command::new("/usr/bin/open")
        .arg(arg)
        .status()
        .map_err(|e| e.to_string())
        .and_then(|s| if s.success() { Ok(()) } else { Err(format!("open exited with {s}")) })
}

pub(super) fn open_url_os(url: &str) -> Result<(), String> {
    open_with_system(url)
}

/// Open System Settings at Privacy & Security › Accessibility. Fixed URL, no input.
pub fn open_accessibility_settings() -> Result<(), String> {
    open_with_system("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
}
