use std::path::PathBuf;
use std::sync::Mutex;

mod device;
mod build;
mod newconfig;
mod frames;
mod layer_hud;
mod platform;

// The scroll & mouse engine and the keyboard-service client are macOS code
// today. Elsewhere the same names resolve to stand-ins that say why they are
// absent (see platform/).
#[cfg(target_os = "macos")]
mod mouse_engine;
#[cfg(not(target_os = "macos"))]
#[path = "platform/mouse_engine_unavailable.rs"]
mod mouse_engine;
// macOS and Windows both have a real keyboard-service client (B-9: Windows
// was routed to the stand-in, so the app never reached the installed service).
#[cfg(any(target_os = "macos", windows))]
mod native_remapping;
#[cfg(not(any(target_os = "macos", windows)))]
#[path = "platform/native_remapping_stub.rs"]
mod native_remapping;

use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent, State, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// Runtime state shared between the status-bar (tray) menu and the frontend.
struct AppState {
    /// `true` while the MacBook's built-in keyboard is disabled.
    builtin_disabled: Mutex<bool>,
    /// The status-bar item — kept alive here, and used to refresh its tooltip.
    tray: tauri::tray::TrayIcon<tauri::Wry>,
    /// The tray menu's checkbox item — kept so both code paths stay in sync.
    /// `None` where the OS has no built-in-keyboard switch (Windows).
    toggle_item: Option<tauri::menu::CheckMenuItem<tauri::Wry>>,
    /// Marker file that exists while the built-in keyboard is disabled, so a
    /// crash (or SIGKILL) never leaves the user with a dead keyboard: the next
    /// launch sees the marker and restores.
    disabled_marker: PathBuf,
    /// `true` while the frontend has unsaved edits (any section). Consulted on
    /// quit so Cmd-Q / tray Quit never silently discard work.
    dirty: Mutex<bool>,
}

// ── Status-bar icon ─────────────────────────────────────────────────────────
// The split-keyboard glyph from design/tray-template.svg, rendered at 2× (72 px)
// by scripts/render-tray-icon.py as raw RGBA — a macOS template image: black
// where opaque, so the system tints it.
const TRAY_ICON_RGBA: &[u8] = include_bytes!("../icons/tray-template.rgba");
const TRAY_ICON_SIZE: u32 = 72;

/// Apply a new built-in-keyboard state everywhere: switch the keyboard, update the
/// shared flag, sync the tray checkbox + tooltip, and notify the frontend.
fn set_builtin_state(app: &tauri::AppHandle, disabled: bool) -> Result<(), String> {
    platform::set_builtin_keyboard(disabled)?;

    let state: State<AppState> = app.state();
    *state.builtin_disabled.lock().unwrap() = disabled;
    if disabled {
        if let Some(dir) = state.disabled_marker.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&state.disabled_marker, b"1");
    } else {
        let _ = std::fs::remove_file(&state.disabled_marker);
    }
    if let Some(item) = &state.toggle_item {
        let _ = item.set_checked(disabled);
        let _ = state.tray.set_tooltip(Some(if disabled {
            "Ultimate Keyboards — built-in keyboard OFF"
        } else {
            "Ultimate Keyboards — built-in keyboard on"
        }));
    }
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

#[tauri::command(async)]
fn set_builtin_keyboard_disabled(app: tauri::AppHandle, disabled: bool) -> Result<(), String> {
    set_builtin_state(&app, disabled)
}

/// Write Karabiner-Elements rules (macOS only; Windows reports why not).
#[tauri::command(async)]
fn install_karabiner_rules(title: String, json: String) -> Result<String, String> {
    platform::install_karabiner_rules(&title, &json)
}

/// The frontend reports whether any section has unsaved edits.
#[tauri::command]
fn set_dirty(state: State<AppState>, dirty: bool) {
    *state.dirty.lock().unwrap() = dirty;
}

/// The one way the app quits. macOS Cmd-Q normally calls `NSApp terminate:`
/// directly, which tao does not intercept, so the app menu's Quit item is our
/// own (with the Cmd+Q accelerator) and the tray Quit routes here too. With
/// unsaved edits we ask first (non-blocking dialog; a blocking one must not
/// run on the main thread) and only then call `exit`, which raises
/// `ExitRequested` where the built-in keyboard is restored.
fn request_quit(app: &tauri::AppHandle) {
    let dirty = *app.state::<AppState>().dirty.lock().unwrap();
    if !dirty {
        layer_hud::hide_on_exit(app);
        native_remapping::stop_on_exit();
        app.exit(0);
        return;
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    let handle = app.clone();
    app.dialog()
        .message("You have unsaved changes. Quit anyway and discard them?")
        .title("Unsaved changes")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Discard and Quit".into(),
            "Cancel".into(),
        ))
        .show(move |confirmed| {
            if confirmed {
                *handle.state::<AppState>().dirty.lock().unwrap() = false;
                layer_hud::hide_on_exit(&handle);
                native_remapping::stop_on_exit();
                handle.exit(0);
            }
        });
}

// ── Mouse / scroll engine ───────────────────────────────────────────────────

/// Frontend-facing mouse-engine config (mirrors mouse_engine's atomics).
#[derive(serde::Serialize, serde::Deserialize)]
struct MouseConfig {
    enabled: bool,
    reverse: bool,
    speed: f64,
}

/// Push new config to the live engine. Starts the tap thread on first enable;
/// returns an error (e.g. missing Accessibility permission) the UI can surface.
#[tauri::command(async)]
fn set_mouse_config(config: MouseConfig) -> Result<(), String> {
    if config.enabled {
        mouse_engine::start()?;
    }
    mouse_engine::set_config(config.enabled, config.reverse, config.speed);
    Ok(())
}

/// Whether the OS lets the scroll engine run (macOS: Accessibility granted).
#[tauri::command]
fn accessibility_trusted() -> bool {
    platform::accessibility_trusted()
}

/// Why the scroll & mouse engine is not available on this OS, or `None`.
#[tauri::command]
fn mouse_engine_unavailable_reason() -> Option<&'static str> {
    mouse_engine::unavailable_reason()
}

/// Open System Settings at Privacy & Security › Accessibility. Fixed URL, no input.
#[tauri::command(async)]
fn open_accessibility_settings() -> Result<(), String> {
    platform::open_accessibility_settings()
}

/// Open a GitHub page in the default browser. Only https://github.com/ URLs
/// with no whitespace are accepted, so the webview cannot launch anything else.
#[tauri::command(async)]
fn open_github_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/") || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("only https://github.com/ links can be opened".into());
    }
    platform::open_url(&url)
}

/// Hosts of the template catalog's video and source links (src/lib/templates/catalog.json).
/// The front end checks the exact catalog URL first; this is the second, host-level fence.
const TEMPLATE_LINK_HOSTS: &[&str] = &[
    "www.youtube.com",
    "github.com",
    "geekhack.org",
    "manual.raycast.com",
    "precondition.github.io",
    "zmk.dev",
];

fn template_link_allowed(url: &str) -> bool {
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    TEMPLATE_LINK_HOSTS.contains(&host)
}

#[tauri::command]
fn open_template_link(url: String) -> Result<(), String> {
    if !template_link_allowed(&url) {
        return Err("only template video and source links can be opened".into());
    }
    platform::open_url(&url)
}

#[cfg(all(test, windows))]
mod windows_client_tests {
    /// B-9: the Windows app must use the real client, never the stand-in.
    #[test]
    fn windows_app_uses_real_keyboard_service_client() {
        let status = super::native_remapping::native_remapping_status();
        assert!(
            !status.message.contains("not set up in this build"),
            "Windows build is wired to the stand-in: {}",
            status.message
        );
    }
}

#[cfg(test)]
mod template_link_tests {
    use super::template_link_allowed;

    #[test]
    fn allows_catalog_hosts_only() {
        assert!(template_link_allowed("https://www.youtube.com/watch?v=XuQVbZ0wENE&t=622s"));
        assert!(template_link_allowed("https://zmk.dev/docs/keymaps/behaviors/hold-tap"));
        assert!(!template_link_allowed("http://www.youtube.com/watch?v=x"));
        assert!(!template_link_allowed("https://www.youtube.com.evil.example/watch"));
        assert!(!template_link_allowed("https://user@www.youtube.com/watch"));
        assert!(!template_link_allowed("file:///etc/passwd"));
        assert!(!template_link_allowed("https://www.youtube.com/watch?v=a b"));
    }
}

#[tauri::command]
fn get_mouse_config() -> MouseConfig {
    let (enabled, reverse, speed) = mouse_engine::get_config();
    MouseConfig {
        enabled,
        reverse,
        speed,
    }
}

/// Replaces Tauri's default menu so Cmd-Q goes through request_quit instead of
/// terminating the process behind our back.
#[cfg(target_os = "macos")]
fn install_app_menu(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::menu::{PredefinedMenuItem, SubmenuBuilder};

    let quit_menu_item = MenuItemBuilder::with_id("menu_quit", "Quit Ultimate Keyboards")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;
    let app_submenu = SubmenuBuilder::new(app, "Ultimate Keyboards")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit_menu_item)
        .build()?;
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;
    let app_menu = MenuBuilder::new(app)
        .items(&[&app_submenu, &edit_submenu, &window_submenu])
        .build()?;
    app.set_menu(app_menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == "menu_quit" {
            request_quit(app);
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            is_builtin_keyboard_disabled,
            set_builtin_keyboard_disabled,
            set_dirty,
            install_karabiner_rules,
            native_remapping::native_remapping_status,
            layer_hud::sync_layer_overlay,
            layer_hud::get_layer_overlay_state,
            frames::frame_pacing_status,
            frames::frame_probe_target,
            frames::frame_probe_write,
            native_remapping::native_remapping_refresh_permissions,
            native_remapping::native_remapping_apply,
            native_remapping::native_remapping_disable,
            native_remapping::native_remapping_install,
            native_remapping::native_remapping_open_settings,
            native_remapping::native_remapping_activate_driver,
            device::list_usb_keyboards,
            device::serial_open,
            device::serial_write,
            device::serial_close,
            device::hid_open,
            device::hid_transact,
            device::hid_close,
            device::vial_definition,
            device::fetch_device_metadata,
            build::git_repo_status,
            build::git_diff_file,
            build::git_commit_push,
            build::gh_info,
            build::gh_run_list,
            build::gh_run_download,
            build::list_firmware,
            build::flash_uf2,
            set_mouse_config,
            get_mouse_config,
            accessibility_trusted,
            mouse_engine_unavailable_reason,
            open_accessibility_settings,
            open_github_url,
            open_template_link,
            newconfig::create_zmk_config,
            newconfig::push_initial_config
        ])
        .setup(|app| {
            layer_hud::init(app.handle());
            native_remapping::start_heartbeat(app.handle().clone());
            // ── Status-bar (menu-bar) item ──────────────────────────────────
            // Switching the laptop keyboard off is a macOS feature; the item
            // is simply absent elsewhere.
            let toggle_item = if cfg!(target_os = "macos") {
                Some(
                    CheckMenuItemBuilder::with_id("toggle_builtin", "Disable built-in keyboard")
                        .checked(false)
                        .build(app)?,
                )
            } else {
                None
            };
            let show_item =
                MenuItemBuilder::with_id("show_window", "Open Ultimate Keyboards").build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit_app", "Quit Ultimate Keyboards").build(app)?;

            let mut menu = MenuBuilder::new(app);
            if let Some(item) = &toggle_item {
                menu = menu.item(item).separator();
            }
            let menu = menu.item(&show_item).separator().item(&quit_item).build()?;

            // The app menu is a macOS convention; on Windows the tray's Quit and
            // the window's own controls cover it.
            #[cfg(target_os = "macos")]
            install_app_menu(app)?;

            // macOS tints a black template glyph; the Windows tray needs a coloured
            // icon that reads on light and dark taskbars, so it uses the app icon.
            let icon = if cfg!(target_os = "macos") {
                tauri::image::Image::new(TRAY_ICON_RGBA, TRAY_ICON_SIZE, TRAY_ICON_SIZE)
            } else {
                app.default_window_icon().cloned().ok_or("the app has no icon")?
            };
            let tray = TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .tooltip(if toggle_item.is_some() {
                    "Ultimate Keyboards — built-in keyboard on"
                } else {
                    "Ultimate Keyboards"
                })
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle_builtin" => {
                        let current = builtin_disabled(app);
                        if let Err(e) = set_builtin_state(app, !current) {
                            eprintln!("toggle built-in keyboard failed: {e}");
                            // Re-sync the checkbox in case the OS auto-toggled it.
                            if let Some(item) = &app.state::<AppState>().toggle_item {
                                let _ = item.set_checked(current);
                            }
                        }
                    }
                    "show_window" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "quit_app" => request_quit(app),
                    _ => {}
                })
                .build(app)?;

            let disabled_marker = app
                .path()
                .app_data_dir()
                .map(|d| d.join("builtin-keyboard-disabled"))
                .unwrap_or_else(|_| {
                    std::env::temp_dir().join("ultimate-keyboards-builtin-disabled")
                });
            let marker_present = disabled_marker.exists();

            app.manage(AppState {
                builtin_disabled: Mutex::new(false),
                tray,
                toggle_item,
                disabled_marker,
                dirty: Mutex::new(false),
            });

            // A previous run disabled the built-in keyboard and never restored
            // it (crash, SIGKILL, power loss) — restore now, before anything else.
            if marker_present {
                if let Err(e) = set_builtin_state(app.handle(), false) {
                    eprintln!("startup restore of built-in keyboard failed: {e}");
                }
            }

            // The native setup package registers the app for login so the
            // authenticated service lease remains alive without an editor window.
            if std::env::args().any(|arg| arg == "--native-background") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // 120 Hz displays get 120 Hz rendering (frames.rs).
            if let Some(window) = app.get_webview_window("main") {
                frames::uncap(&window);
            }

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
            if let RunEvent::ExitRequested { api, .. } = event {
                // Backstop for exit paths that bypass request_quit: never
                // discard unsaved edits silently.
                let dirty = *app.state::<AppState>().dirty.lock().unwrap();
                if dirty {
                    api.prevent_exit();
                    request_quit(app);
                    return;
                }
                // Never leave the user with a dead keyboard.
                layer_hud::hide_on_exit(app);
                native_remapping::stop_on_exit();
                let _ = set_builtin_state(app, false);
            }
        });
}
