use std::process::Command;
use std::sync::Mutex;

use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent, State, WindowEvent,
};

/// `hidutil --matching` selector for the MacBook's built-in keyboard. The product
/// string is the same across Intel and Apple-Silicon MacBooks.
const BUILTIN_KEYBOARD_MATCH: &str = r#"{"Product":"Apple Internal Keyboard / Trackpad"}"#;

/// Runtime state shared between the status-bar (tray) menu and the frontend.
struct AppState {
    /// `true` while the MacBook's built-in keyboard is disabled.
    builtin_disabled: Mutex<bool>,
    /// The status-bar item — kept alive here, and used to refresh its tooltip.
    tray: tauri::tray::TrayIcon<tauri::Wry>,
    /// The tray menu's checkbox item — kept so both code paths stay in sync.
    toggle_item: tauri::menu::CheckMenuItem<tauri::Wry>,
}

#[tauri::command]
fn run_shell_command(command: String, args: Vec<String>) -> Result<String, String> {
    let output = Command::new(&command)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute command '{}': {}", command, e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!(
            "Command '{}' failed with status {:?}.\nstderr: {}\nstdout: {}",
            command,
            output.status.code(),
            stderr,
            stdout
        ))
    }
}

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
                    device["disable_built_in_keyboard_if_exists"] = serde_json::Value::Bool(disabled);
                    changed = true;
                }
            }
        }
    }

    if changed {
        if let Ok(pretty) = serde_json::to_string_pretty(&json) {
            let _ = std::fs::write(&path, format!("{pretty}\n"));
        }
    }
}

// ── Status-bar icon artwork ─────────────────────────────────────────────────
// Hand-drawn so the menu-bar item is a crisp monochrome keyboard glyph
// (rendered as a macOS template image — black where opaque, transparent
// elsewhere — so it tints itself to match light/dark menu bars).

fn px(buf: &mut [u8], w: usize, h: usize, x: i32, y: i32) {
    if x < 0 || y < 0 {
        return;
    }
    let (x, y) = (x as usize, y as usize);
    if x >= w || y >= h {
        return;
    }
    buf[(y * w + x) * 4 + 3] = 0xFF; // RGB stays 0,0,0
}

fn fill(buf: &mut [u8], w: usize, h: usize, x0: i32, y0: i32, x1: i32, y1: i32) {
    for y in y0..y1 {
        for x in x0..x1 {
            px(buf, w, h, x, y);
        }
    }
}

fn keyboard_template_rgba() -> (Vec<u8>, u32, u32) {
    const W: usize = 36;
    const H: usize = 36;
    let mut buf = vec![0u8; W * H * 4];

    // Keyboard body outline (2 px stroke), with the four corner pixels clipped
    // so it reads as slightly rounded.
    let (x0, y0, x1, y1, t) = (3i32, 8i32, 33i32, 28i32, 2i32);
    fill(&mut buf, W, H, x0, y0, x1, y0 + t); // top
    fill(&mut buf, W, H, x0, y1 - t, x1, y1); // bottom
    fill(&mut buf, W, H, x0, y0, x0 + t, y1); // left
    fill(&mut buf, W, H, x1 - t, y0, x1, y1); // right
    for &(cx, cy) in &[(x0, y0), (x1 - 1, y0), (x0, y1 - 1), (x1 - 1, y1 - 1)] {
        buf[(cy as usize * W + cx as usize) * 4 + 3] = 0;
    }

    // Two rows of keys.
    for &kx in &[7, 12, 17, 22, 27] {
        fill(&mut buf, W, H, kx, 12, kx + 3, 15);
        fill(&mut buf, W, H, kx, 17, kx + 3, 20);
    }
    // Spacebar.
    fill(&mut buf, W, H, 11, 22, 25, 25);

    (buf, W as u32, H as u32)
}

/// Apply a new built-in-keyboard state everywhere: run `hidutil`, update the
/// shared flag, sync the tray checkbox + tooltip, and notify the frontend.
fn set_builtin_state(app: &tauri::AppHandle, disabled: bool) -> Result<(), String> {
    run_hidutil(disabled)?;
    patch_karabiner_disable_builtin(disabled);

    let state: State<AppState> = app.state();
    *state.builtin_disabled.lock().unwrap() = disabled;
    let _ = state.toggle_item.set_checked(disabled);
    let _ = state.tray.set_tooltip(Some(if disabled {
        "Ultimate Keyboards — built-in keyboard OFF"
    } else {
        "Ultimate Keyboards — built-in keyboard on"
    }));

    let _ = app.emit("builtin-keyboard-changed", disabled);
    Ok(())
}

fn builtin_disabled(app: &tauri::AppHandle) -> bool {
    *app.state::<AppState>().builtin_disabled.lock().unwrap()
}

#[tauri::command]
fn is_builtin_keyboard_disabled(state: State<AppState>) -> bool {
    *state.builtin_disabled.lock().unwrap()
}

#[tauri::command]
fn set_builtin_keyboard_disabled(app: tauri::AppHandle, disabled: bool) -> Result<(), String> {
    set_builtin_state(&app, disabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            run_shell_command,
            is_builtin_keyboard_disabled,
            set_builtin_keyboard_disabled
        ])
        .setup(|app| {
            // ── Status-bar (menu-bar) item ──────────────────────────────────
            let toggle_item =
                CheckMenuItemBuilder::with_id("toggle_builtin", "Disable built-in keyboard")
                    .checked(false)
                    .build(app)?;
            let show_item =
                MenuItemBuilder::with_id("show_window", "Open Ultimate Keyboards").build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit_app", "Quit Ultimate Keyboards").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&toggle_item)
                .separator()
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let (icon_rgba, icon_w, icon_h) = keyboard_template_rgba();
            let icon = tauri::image::Image::new_owned(icon_rgba, icon_w, icon_h);
            let tray = TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("Ultimate Keyboards — built-in keyboard on")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle_builtin" => {
                        let current = builtin_disabled(app);
                        if let Err(e) = set_builtin_state(app, !current) {
                            eprintln!("toggle built-in keyboard failed: {e}");
                            // Re-sync the checkbox in case the OS auto-toggled it.
                            let _ = app.state::<AppState>().toggle_item.set_checked(current);
                        }
                    }
                    "show_window" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "quit_app" => {
                        // Never leave the user with a dead keyboard.
                        let _ = set_builtin_state(app, false);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            app.manage(AppState {
                builtin_disabled: Mutex::new(false),
                tray,
                toggle_item,
            });

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window just hides it so the status-bar item stays alive.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // App is actually quitting (Cmd-Q / tray quit) — restore the keyboard.
                let _ = set_builtin_state(app, false);
            }
        });
}
