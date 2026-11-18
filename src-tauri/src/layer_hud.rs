//! Floating on-screen layer HUD ("Show which layer is on, right on screen").
//!
//! Pure presentation rules live in platform-neutral Rust so tests prove:
//! - the HUD appears only when user preference is on AND remapping is running
//!   with captured keyboards AND at least one layer is active;
//! - stopping remapping, turning the overlay off, or releasing the layer key
//!   clears the HUD immediately;
//! - key hints come from the active layer's bindings (up to 6 concise pairs +
//!   `+N` overflow count).
//!
//! On macOS, the HUD renders in a borderless, click-through, non-activating
//! `NSPanel` backed by `NSVisualEffectView` (`BehindWindow` frosted HUD glass,
//! `CanJoinAllSpaces | FullScreenAuxiliary`), so it floats above full-screen
//! and desktop apps without stealing keyboard focus or requiring private APIs.
//! On Windows, a click-through, non-focusable transparent `WebviewWindow`
//! (`?hud=1`) renders the matching `<LayerHud />` surface.

use crate::native_remapping::NativeStatus;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};

pub const MAX_HUD_HINTS: usize = 6;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudKeyHint {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HudPresentation {
    /// Topmost (most recently activated) layer name.
    pub layer: String,
    /// Full held layer stack in activation order, e.g. `["nav", "sym"]`.
    pub stack: Vec<String>,
    /// Concise key pairs on `layer`, e.g. `H → ←`.
    pub hints: Vec<HudKeyHint>,
    /// Additional changed keys on `layer` beyond `hints`.
    pub more_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedOverlayConfig {
    enabled: bool,
    #[serde(default)]
    hints: BTreeMap<String, Vec<HudKeyHint>>,
}

impl Default for PersistedOverlayConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            hints: BTreeMap::new(),
        }
    }
}

struct OverlayStore {
    enabled: bool,
    hints: BTreeMap<String, Vec<HudKeyHint>>,
    config_path: Option<PathBuf>,
    last_status: Option<NativeStatus>,
    last_shown: Option<HudPresentation>,
}

impl Default for OverlayStore {
    fn default() -> Self {
        Self {
            enabled: true,
            hints: BTreeMap::new(),
            config_path: None,
            last_status: None,
            last_shown: None,
        }
    }
}

static STORE: OnceLock<Mutex<OverlayStore>> = OnceLock::new();

fn store() -> &'static Mutex<OverlayStore> {
    STORE.get_or_init(|| Mutex::new(OverlayStore::default()))
}

/// Pure predicate mirroring `nativeIsRunning` on the frontend: never claim a
/// layer is live unless capture and permissions are confirmed.
pub fn status_is_running(status: &NativeStatus) -> bool {
    status.state == "running"
        && status.enabled
        && status.helper_installed
        && status.driver_ready
        && status.input_monitoring_granted
        && status.captured_devices > 0
}

pub fn compute_hud_presentation(
    overlay_enabled: bool,
    status: &NativeStatus,
    hints_by_layer: &BTreeMap<String, Vec<HudKeyHint>>,
) -> Option<HudPresentation> {
    if !overlay_enabled || !status_is_running(status) {
        return None;
    }
    let layer = status.active_layers.last()?.clone();
    let (hints, more_count) = match hints_by_layer.get(&layer) {
        Some(all) => (
            all.iter().take(MAX_HUD_HINTS).cloned().collect(),
            all.len().saturating_sub(MAX_HUD_HINTS),
        ),
        None => (Vec::new(), 0),
    };
    Some(HudPresentation {
        layer,
        stack: status.active_layers.clone(),
        hints,
        more_count,
    })
}

/// Fallback hint extractor from a raw `NativeProfile` JSON when `apply` runs
/// before the webview has synced its formatted hints.
pub fn extract_hints_from_profile(profile: &Value) -> BTreeMap<String, Vec<HudKeyHint>> {
    let mut map: BTreeMap<String, Vec<HudKeyHint>> = BTreeMap::new();
    let Some(rules) = profile.get("rules").and_then(Value::as_array) else {
        return map;
    };
    for rule in rules {
        if rule.get("type").and_then(Value::as_str) != Some("layer_binding") {
            continue;
        }
        let (Some(layer), Some(from), Some(to)) = (
            rule.get("layerName").and_then(Value::as_str),
            rule.get("fromKey").and_then(Value::as_str),
            rule.get("toKey").and_then(Value::as_str),
        ) else {
            continue;
        };
        let mods = rule
            .get("toModifiers")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(short_modifier)
                    .collect::<String>()
            })
            .unwrap_or_default();
        map.entry(layer.to_string()).or_default().push(HudKeyHint {
            from: short_key(from),
            to: format!("{mods}{}", short_key(to)),
        });
    }
    map
}

fn short_modifier(m: &str) -> &'static str {
    let family = m.strip_prefix("left_").or_else(|| m.strip_prefix("right_")).unwrap_or(m);
    if cfg!(windows) {
        match family {
            "control" => "Ctrl+",
            "option" => "Alt+",
            "shift" => "Shift+",
            "command" => "Win+",
            _ => "",
        }
    } else {
        match family {
            "control" => "⌃",
            "option" => "⌥",
            "shift" => "⇧",
            "command" => "⌘",
            _ => "",
        }
    }
}

fn short_key(code: &str) -> String {
    match code {
        "left_arrow" => "←".into(),
        "down_arrow" => "↓".into(),
        "up_arrow" => "↑".into(),
        "right_arrow" => "→".into(),
        "return_or_enter" => "⏎".into(),
        "delete_or_backspace" => "⌫".into(),
        "delete_forward" => "⌦".into(),
        "escape" => "Esc".into(),
        "spacebar" => "Space".into(),
        "tab" => "Tab".into(),
        "open_bracket" => "[".into(),
        "close_bracket" => "]".into(),
        "backslash" => "\\".into(),
        "semicolon" => ";".into(),
        "quote" => "'".into(),
        "grave_accent_and_tilde" => "`".into(),
        "comma" => ",".into(),
        "period" => ".".into(),
        "slash" => "/".into(),
        "hyphen" => "-".into(),
        "equal_sign" => "=".into(),
        other if other.len() == 1 => other.to_ascii_uppercase(),
        other => other.replace('_', " "),
    }
}

fn load_persisted(path: &Path) -> Option<PersistedOverlayConfig> {
    let bytes = std::fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn save_persisted(path: &Path, cfg: &PersistedOverlayConfig) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    if let Ok(bytes) = serde_json::to_vec(cfg) {
        if std::fs::write(&tmp, bytes).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

/// Load persisted preference + layer hints at app startup (including `--native-background`).
pub fn init(app: &tauri::AppHandle) {
    let path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("layer-overlay.json"));
    let loaded = path.as_deref().and_then(load_persisted);
    let mut guard = store().lock().unwrap_or_else(|e| e.into_inner());
    guard.config_path = path;
    if let Some(cfg) = loaded {
        guard.enabled = cfg.enabled;
        guard.hints = cfg.hints;
    }
}

/// Update hints when `native_remapping_apply` succeeds if the store has none for those layers yet.
pub fn note_applied_profile(profile: &Value) {
    let extracted = extract_hints_from_profile(profile);
    if extracted.is_empty() {
        return;
    }
    let mut guard = store().lock().unwrap_or_else(|e| e.into_inner());
    if guard.hints.is_empty() {
        guard.hints = extracted;
    }
}

/// Recompute and apply the floating HUD whenever service status or user preference changes.
pub fn sync_from_status(app: &tauri::AppHandle, status: &NativeStatus) {
    let next = {
        let mut guard = store().lock().unwrap_or_else(|e| e.into_inner());
        guard.last_status = Some(status.clone());
        let computed = compute_hud_presentation(guard.enabled, status, &guard.hints);
        if computed == guard.last_shown {
            return;
        }
        guard.last_shown = computed.clone();
        computed
    };
    present_hud(app, next);
}

pub fn hide_on_exit(app: &tauri::AppHandle) {
    {
        let mut guard = store().lock().unwrap_or_else(|e| e.into_inner());
        guard.last_shown = None;
    }
    present_hud(app, None);
}

/// Frontend command: syncs user choice (`enabled`) and formatted layer key hints.
#[tauri::command]
pub fn sync_layer_overlay(
    app: tauri::AppHandle,
    enabled: bool,
    hints: BTreeMap<String, Vec<HudKeyHint>>,
) {
    let (to_save, recomputed) = {
        let mut guard = store().lock().unwrap_or_else(|e| e.into_inner());
        guard.enabled = enabled;
        guard.hints = hints.clone();
        let save = guard.config_path.clone().map(|p| {
            (
                p,
                PersistedOverlayConfig {
                    enabled,
                    hints,
                },
            )
        });
        let next = guard
            .last_status
            .as_ref()
            .and_then(|st| compute_hud_presentation(guard.enabled, st, &guard.hints));
        let changed = next != guard.last_shown;
        if changed {
            guard.last_shown = next.clone();
        }
        (save, changed.then_some(next))
    };
    if let Some((path, cfg)) = to_save {
        save_persisted(&path, &cfg);
    }
    if let Some(next) = recomputed {
        present_hud(&app, next);
    }
}

#[tauri::command]
pub fn get_layer_overlay_state() -> Option<HudPresentation> {
    store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .last_shown
        .clone()
}

fn present_hud(app: &tauri::AppHandle, presentation: Option<HudPresentation>) {
    let _ = app.emit("layer-hud-update", &presentation);
    #[cfg(target_os = "macos")]
    macos_hud::present(app, presentation);
    #[cfg(windows)]
    windows_hud::present(app, presentation);
}

/// Format the title and hint strings shown in the native HUD pill.
pub fn format_hud_strings(p: &HudPresentation) -> (String, String) {
    let title = if p.stack.len() > 1 {
        p.stack.join(" › ")
    } else {
        p.layer.clone()
    };
    if p.hints.is_empty() {
        return (title, String::new());
    }
    let mut parts: Vec<String> = p
        .hints
        .iter()
        .map(|h| format!("{} {}", h.from, h.to))
        .collect();
    if p.more_count > 0 {
        parts.push(format!("+{}", p.more_count));
    }
    (title, parts.join("   "))
}

#[cfg(target_os = "macos")]
mod macos_hud {
    use super::{format_hud_strings, HudPresentation};
    use objc2::encode::{Encode, Encoding, RefEncode};
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2::{msg_send, sel};
    use std::cell::RefCell;
    use std::ffi::CString;

    #[repr(C)]
    #[derive(Clone, Copy, Debug, PartialEq, Default)]
    pub(crate) struct CGPoint {
        pub x: f64,
        pub y: f64,
    }
    unsafe impl Encode for CGPoint {
        const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
    }
    unsafe impl RefEncode for CGPoint {
        const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
    }

    #[repr(C)]
    #[derive(Clone, Copy, Debug, PartialEq, Default)]
    pub(crate) struct CGSize {
        pub width: f64,
        pub height: f64,
    }
    unsafe impl Encode for CGSize {
        const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
    }
    unsafe impl RefEncode for CGSize {
        const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
    }

    #[repr(C)]
    #[derive(Clone, Copy, Debug, PartialEq, Default)]
    pub(crate) struct CGRect {
        pub origin: CGPoint,
        pub size: CGSize,
    }
    unsafe impl Encode for CGRect {
        const ENCODING: Encoding =
            Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGSize::ENCODING]);
    }
    unsafe impl RefEncode for CGRect {
        const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
    }

    #[repr(C)]
    struct CGColorOpaque {
        _priv: [u8; 0],
    }
    unsafe impl RefEncode for CGColorOpaque {
        const ENCODING_REF: Encoding = Encoding::Struct("CGColor", &[]);
    }

    // NSPanel style mask: borderless (0) + NSWindowStyleMaskNonactivatingPanel (1 << 7)
    const NONACTIVATING_BORDERLESS: usize = 1 << 7;
    // NSBackingStoreBuffered
    const BACKING_BUFFERED: usize = 2;
    // NSStatusWindowLevel (floats above normal & floating windows without fighting screen savers)
    const STATUS_WINDOW_LEVEL: isize = 25;
    // CanJoinAllSpaces (1<<0) | Stationary (1<<4) | IgnoresCycle (1<<6) | FullScreenAuxiliary (1<<8)
    const HUD_COLLECTION_BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
    // NSVisualEffectMaterialHUDWindow = 13, BlendingModeBehindWindow = 0, StateActive = 1
    const MATERIAL_HUD_WINDOW: isize = 13;
    const BLEND_BEHIND_WINDOW: isize = 0;
    const VISUAL_STATE_ACTIVE: isize = 1;

    struct NativeHudPanel {
        panel: *mut AnyObject,
        effect: *mut AnyObject,
        dot: *mut AnyObject,
        title_field: *mut AnyObject,
        sep: *mut AnyObject,
        hints_field: *mut AnyObject,
    }

    thread_local! {
        static PANEL: RefCell<Option<NativeHudPanel>> = const { RefCell::new(None) };
    }

    pub fn present(app: &tauri::AppHandle, presentation: Option<HudPresentation>) {
        let _ = app.run_on_main_thread(move || unsafe {
            match presentation {
                Some(p) => show_or_update(&p),
                None => hide(),
            }
        });
    }

    pub(crate) unsafe fn nsstring(text: &str) -> *mut AnyObject {
        let cls = AnyClass::get(c"NSString").expect("NSString");
        let sanitized: String = text.chars().filter(|&c| c != '\0').collect();
        let cstr = CString::new(sanitized).unwrap_or_default();
        msg_send![cls, stringWithUTF8String: cstr.as_ptr()]
    }

    unsafe fn rgba(r: f64, g: f64, b: f64, a: f64) -> *mut AnyObject {
        let cls = AnyClass::get(c"NSColor").expect("NSColor");
        msg_send![cls, colorWithSRGBRed: r, green: g, blue: b, alpha: a]
    }

    unsafe fn make_label(font: *mut AnyObject, color: *mut AnyObject) -> *mut AnyObject {
        let cls = AnyClass::get(c"NSTextField").expect("NSTextField");
        let empty = nsstring("");
        let field: *mut AnyObject = msg_send![cls, labelWithString: empty];
        let _: () = msg_send![field, setFont: font];
        let _: () = msg_send![field, setTextColor: color];
        let _: () = msg_send![field, setDrawsBackground: Bool::NO];
        let _: () = msg_send![field, setBezeled: Bool::NO];
        let _: () = msg_send![field, setEditable: Bool::NO];
        let _: () = msg_send![field, setSelectable: Bool::NO];
        // NSLineBreakByTruncatingTail = 4
        let _: () = msg_send![field, setLineBreakMode: 4usize];
        field
    }

    unsafe fn build_panel() -> Option<NativeHudPanel> {
        let panel_cls = AnyClass::get(c"NSPanel")?;
        let effect_cls = AnyClass::get(c"NSVisualEffectView")?;
        let view_cls = AnyClass::get(c"NSView")?;
        let font_cls = AnyClass::get(c"NSFont")?;
        let color_cls = AnyClass::get(c"NSColor")?;

        let initial = CGRect {
            origin: CGPoint { x: 0.0, y: 0.0 },
            size: CGSize {
                width: 240.0,
                height: 40.0,
            },
        };
        let alloc: *mut AnyObject = msg_send![panel_cls, alloc];
        let panel: *mut AnyObject = msg_send![
            alloc,
            initWithContentRect: initial,
            styleMask: NONACTIVATING_BORDERLESS,
            backing: BACKING_BUFFERED,
            defer: Bool::NO
        ];
        if panel.is_null() {
            return None;
        }
        let clear: *mut AnyObject = msg_send![color_cls, clearColor];
        let _: () = msg_send![panel, setReleasedWhenClosed: Bool::NO];
        let _: () = msg_send![panel, setFloatingPanel: Bool::YES];
        let _: () = msg_send![panel, setBecomesKeyOnlyIfNeeded: Bool::YES];
        let _: () = msg_send![panel, setHidesOnDeactivate: Bool::NO];
        let _: () = msg_send![panel, setIgnoresMouseEvents: Bool::YES];
        let _: () = msg_send![panel, setOpaque: Bool::NO];
        let _: () = msg_send![panel, setBackgroundColor: clear];
        let _: () = msg_send![panel, setHasShadow: Bool::YES];
        let _: () = msg_send![panel, setLevel: STATUS_WINDOW_LEVEL];
        let _: () = msg_send![panel, setCollectionBehavior: HUD_COLLECTION_BEHAVIOR];

        let effect_alloc: *mut AnyObject = msg_send![effect_cls, alloc];
        let effect: *mut AnyObject = msg_send![effect_alloc, initWithFrame: initial];
        let _: () = msg_send![effect, setMaterial: MATERIAL_HUD_WINDOW];
        let _: () = msg_send![effect, setBlendingMode: BLEND_BEHIND_WINDOW];
        let _: () = msg_send![effect, setState: VISUAL_STATE_ACTIVE];
        let _: () = msg_send![effect, setWantsLayer: Bool::YES];
        let layer: *mut AnyObject = msg_send![effect, layer];
        if !layer.is_null() {
            let _: () = msg_send![layer, setCornerRadius: 16.0f64];
            let _: () = msg_send![layer, setMasksToBounds: Bool::YES];
            let _: () = msg_send![layer, setBorderWidth: 1.0f64];
            let rim = rgba(1.0, 1.0, 1.0, 0.18);
            let cg_rim: *mut CGColorOpaque = msg_send![rim, CGColor];
            let _: () = msg_send![layer, setBorderColor: cg_rim];
        }

        // Layer dot (#5fc8ec matching BoardLegend Layer hue)
        let dot_alloc: *mut AnyObject = msg_send![view_cls, alloc];
        let dot: *mut AnyObject = msg_send![
            dot_alloc,
            initWithFrame: CGRect {
                origin: CGPoint { x: 14.0, y: 16.0 },
                size: CGSize { width: 8.0, height: 8.0 },
            }
        ];
        let _: () = msg_send![dot, setWantsLayer: Bool::YES];
        let dot_layer: *mut AnyObject = msg_send![dot, layer];
        if !dot_layer.is_null() {
            let _: () = msg_send![dot_layer, setCornerRadius: 4.0f64];
            let sky = rgba(95.0 / 255.0, 200.0 / 255.0, 236.0 / 255.0, 1.0);
            let cg_sky: *mut CGColorOpaque = msg_send![sky, CGColor];
            let _: () = msg_send![dot_layer, setBackgroundColor: cg_sky];
        }

        // Fonts: SF Pro Semibold 13pt for layer name, SF Mono Medium 11.5pt for key hints
        let title_font: *mut AnyObject = msg_send![font_cls, systemFontOfSize: 13.0f64, weight: 0.30f64];
        let hints_font: *mut AnyObject =
            msg_send![font_cls, monospacedSystemFontOfSize: 11.5f64, weight: 0.20f64];
        let primary_ink = rgba(244.0 / 255.0, 246.0 / 255.0, 255.0 / 255.0, 0.98);
        let secondary_ink = rgba(226.0 / 255.0, 232.0 / 255.0, 255.0 / 255.0, 0.82);

        let title_field = make_label(title_font, primary_ink);
        let hints_field = make_label(hints_font, secondary_ink);

        // 1pt vertical hairline separator between layer name and key hints
        let sep_alloc: *mut AnyObject = msg_send![view_cls, alloc];
        let sep: *mut AnyObject = msg_send![
            sep_alloc,
            initWithFrame: CGRect {
                origin: CGPoint { x: 0.0, y: 11.0 },
                size: CGSize { width: 1.0, height: 18.0 },
            }
        ];
        let _: () = msg_send![sep, setWantsLayer: Bool::YES];
        let sep_layer: *mut AnyObject = msg_send![sep, layer];
        if !sep_layer.is_null() {
            let sep_col = rgba(1.0, 1.0, 1.0, 0.16);
            let cg_sep: *mut CGColorOpaque = msg_send![sep_col, CGColor];
            let _: () = msg_send![sep_layer, setBackgroundColor: cg_sep];
        }

        let _: () = msg_send![effect, addSubview: dot];
        let _: () = msg_send![effect, addSubview: title_field];
        let _: () = msg_send![effect, addSubview: sep];
        let _: () = msg_send![effect, addSubview: hints_field];
        let _: () = msg_send![panel, setContentView: effect];

        Some(NativeHudPanel {
            panel,
            effect,
            dot,
            title_field,
            sep,
            hints_field,
        })
    }

    unsafe fn screen_visible_frame() -> Option<CGRect> {
        let cls = AnyClass::get(c"NSScreen")?;
        let mut screen: *mut AnyObject = msg_send![cls, mainScreen];
        if screen.is_null() {
            let screens: *mut AnyObject = msg_send![cls, screens];
            if !screens.is_null() {
                let count: usize = msg_send![screens, count];
                if count > 0 {
                    screen = msg_send![screens, objectAtIndex: 0usize];
                }
            }
        }
        if screen.is_null() {
            return None;
        }
        let rect: CGRect = msg_send![screen, visibleFrame];
        Some(rect)
    }

    unsafe fn show_or_update(p: &HudPresentation) {
        PANEL.with(|slot| {
            if slot.borrow().is_none() {
                *slot.borrow_mut() = build_panel();
            }
            let borrow = slot.borrow();
            let Some(hud) = borrow.as_ref() else {
                return;
            };
            let (title, hints) = format_hud_strings(p);
            let ns_title = nsstring(&title);
            let _: () = msg_send![hud.title_field, setStringValue: ns_title];
            let _: () = msg_send![hud.title_field, sizeToFit];
            let title_frame: CGRect = msg_send![hud.title_field, frame];

            let max_screen_w = screen_visible_frame()
                .map(|r| (r.size.width - 48.0).clamp(240.0, 680.0))
                .unwrap_or(560.0);

            let height = 40.0f64;
            let pad_x = 14.0f64;
            let dot_size = 8.0f64;
            let dot_gap = 8.0f64;
            let title_x = pad_x + dot_size + dot_gap;
            let title_w = title_frame.size.width.min(220.0);

            let mut total_w = title_x + title_w + pad_x;
            if hints.is_empty() {
                let _: () = msg_send![hud.sep, setHidden: Bool::YES];
                let _: () = msg_send![hud.hints_field, setHidden: Bool::YES];
            } else {
                let ns_hints = nsstring(&hints);
                let _: () = msg_send![hud.hints_field, setStringValue: ns_hints];
                let _: () = msg_send![hud.hints_field, sizeToFit];
                let hints_frame: CGRect = msg_send![hud.hints_field, frame];
                let sep_x = title_x + title_w + 12.0;
                let hints_x = sep_x + 13.0;
                let avail_hints_w = (max_screen_w - hints_x - pad_x).max(80.0);
                let hints_w = hints_frame.size.width.min(avail_hints_w);

                let _: () = msg_send![
                    hud.sep,
                    setFrame: CGRect {
                        origin: CGPoint { x: sep_x, y: (height - 16.0) * 0.5 },
                        size: CGSize { width: 1.0, height: 16.0 },
                    }
                ];
                let _: () = msg_send![
                    hud.hints_field,
                    setFrame: CGRect {
                        origin: CGPoint {
                            x: hints_x,
                            y: ((height - hints_frame.size.height) * 0.5).round(),
                        },
                        size: CGSize {
                            width: hints_w,
                            height: hints_frame.size.height,
                        },
                    }
                ];
                let _: () = msg_send![hud.sep, setHidden: Bool::NO];
                let _: () = msg_send![hud.hints_field, setHidden: Bool::NO];
                total_w = hints_x + hints_w + pad_x;
            }

            let _: () = msg_send![
                hud.dot,
                setFrame: CGRect {
                    origin: CGPoint {
                        x: pad_x,
                        y: (height - dot_size) * 0.5,
                    },
                    size: CGSize {
                        width: dot_size,
                        height: dot_size,
                    },
                }
            ];
            let _: () = msg_send![
                hud.title_field,
                setFrame: CGRect {
                    origin: CGPoint {
                        x: title_x,
                        y: ((height - title_frame.size.height) * 0.5).round(),
                    },
                    size: CGSize {
                        width: title_w,
                        height: title_frame.size.height,
                    },
                }
            ];

            let (origin_x, origin_y) = match screen_visible_frame() {
                Some(vis) => (
                    (vis.origin.x + (vis.size.width - total_w) * 0.5).round(),
                    (vis.origin.y + 28.0).round(),
                ),
                None => (200.0, 80.0),
            };
            let panel_frame = CGRect {
                origin: CGPoint {
                    x: origin_x,
                    y: origin_y,
                },
                size: CGSize {
                    width: total_w.ceil(),
                    height,
                },
            };
            let _: () = msg_send![
                hud.effect,
                setFrame: CGRect {
                    origin: CGPoint { x: 0.0, y: 0.0 },
                    size: panel_frame.size,
                }
            ];
            let _: () = msg_send![hud.panel, setFrame: panel_frame, display: Bool::YES];
            let _: () = msg_send![hud.panel, orderFrontRegardless];
        });
    }

    unsafe fn hide() {
        PANEL.with(|slot| {
            if let Some(hud) = slot.borrow().as_ref() {
                let null_sender: *mut AnyObject = std::ptr::null_mut();
                let _: () = msg_send![hud.panel, orderOut: null_sender];
            }
        });
    }

    #[cfg(test)]
    pub(crate) mod encoding_tests {
        use super::*;

        #[test]
        fn macos_geometry_and_foundation_encodings_match_runtime() {
            assert_eq!(
                CGRect::ENCODING.to_string(),
                "{CGRect={CGPoint=dd}{CGSize=dd}}"
            );
            unsafe {
                let s = nsstring("nav › sym");
                assert!(!s.is_null());
                let len: usize = msg_send![s, length];
                assert!(len >= 7);
            }
        }
    }
}

#[cfg(windows)]
mod windows_hud {
    use super::HudPresentation;
    use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

    const LABEL: &str = "layer-hud";
    const WIDTH: f64 = 520.0;
    const HEIGHT: f64 = 64.0;

    pub fn present(app: &tauri::AppHandle, presentation: Option<HudPresentation>) {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            match presentation {
                Some(ref p) => {
                    let window = match handle.get_webview_window(LABEL) {
                        Some(w) => w,
                        None => {
                            let Ok(w) = WebviewWindowBuilder::new(
                                &handle,
                                LABEL,
                                WebviewUrl::App("index.html?hud=1".into()),
                            )
                            .title("Layer Overlay")
                            .inner_size(WIDTH, HEIGHT)
                            .decorations(false)
                            .transparent(true)
                            .shadow(false)
                            .always_on_top(true)
                            .focusable(false)
                            .focused(false)
                            .skip_taskbar(true)
                            .resizable(false)
                            .visible(false)
                            .build()
                            else {
                                return;
                            };
                            let _ = w.set_ignore_cursor_events(true);
                            w
                        }
                    };
                    if let Ok(Some(monitor)) = window.primary_monitor() {
                        let scale = monitor.scale_factor();
                        let work = monitor.work_area();
                        let work_w = work.size.width as f64 / scale;
                        let work_h = work.size.height as f64 / scale;
                        let work_x = work.position.x as f64 / scale;
                        let work_y = work.position.y as f64 / scale;
                        let _ = window.set_size(LogicalSize::new(WIDTH, HEIGHT));
                        let _ = window.set_position(LogicalPosition::new(
                            work_x + (work_w - WIDTH) * 0.5,
                            work_y + work_h - HEIGHT - 24.0,
                        ));
                    }
                    let _ = window.set_ignore_cursor_events(true);
                    let _ = handle.emit("layer-hud-update", &presentation);
                    let _ = window.show();
                }
                None => {
                    if let Some(window) = handle.get_webview_window(LABEL) {
                        let _ = window.hide();
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn running_status(layers: &[&str]) -> NativeStatus {
        NativeStatus {
            state: "running".into(),
            message: "Active".into(),
            driver_ready: true,
            input_monitoring_granted: true,
            helper_installed: true,
            enabled: true,
            captured_devices: 1,
            profile_title: Some("Laptop".into()),
            active_layers: layers.iter().map(|s| (*s).to_string()).collect(),
            state_seq: 3,
            protocol_version: 1,
        }
    }

    #[test]
    fn hud_shows_only_when_enabled_running_captured_and_in_non_base_layer() {
        let mut hints = BTreeMap::new();
        hints.insert(
            "nav".to_string(),
            (1..=8)
                .map(|i| HudKeyHint {
                    from: format!("K{i}"),
                    to: format!("V{i}"),
                })
                .collect(),
        );

        // Base layer -> hidden
        assert_eq!(
            compute_hud_presentation(true, &running_status(&[]), &hints),
            None
        );
        // Overlay preference off -> hidden even while holding `nav`
        assert_eq!(
            compute_hud_presentation(false, &running_status(&["nav"]), &hints),
            None
        );
        // Remapping stopped or uncaptured -> hidden even if stale layer list arrived
        let mut stopped = running_status(&["nav"]);
        stopped.enabled = false;
        assert_eq!(compute_hud_presentation(true, &stopped, &hints), None);

        let mut uncaptured = running_status(&["nav"]);
        uncaptured.captured_devices = 0;
        assert_eq!(compute_hud_presentation(true, &uncaptured, &hints), None);

        // Active `nav` -> shows topmost layer, full stack, 6 hints, and +2 overflow
        let shown =
            compute_hud_presentation(true, &running_status(&["base_ext", "nav"]), &hints).unwrap();
        assert_eq!(shown.layer, "nav");
        assert_eq!(shown.stack, vec!["base_ext".to_string(), "nav".to_string()]);
        assert_eq!(shown.hints.len(), MAX_HUD_HINTS);
        assert_eq!(shown.more_count, 2);

        let (title, summary) = format_hud_strings(&shown);
        assert_eq!(title, "base_ext › nav");
        assert!(summary.contains("K1 V1") && summary.ends_with("+2"));
    }

    #[test]
    fn profile_fallback_extracts_human_readable_layer_bindings() {
        let profile = json!({
            "version": 1,
            "title": "Test",
            "rules": [
                { "type": "layer_activator", "fromKey": "spacebar", "layerName": "nav", "tapKey": "spacebar" },
                { "type": "layer_binding", "layerName": "nav", "fromKey": "h", "toKey": "left_arrow" },
                { "type": "layer_binding", "layerName": "nav", "fromKey": "d", "toKey": "left_arrow", "toModifiers": ["control"] }
            ]
        });
        let hints = extract_hints_from_profile(&profile);
        let nav = &hints["nav"];
        assert_eq!(nav.len(), 2);
        assert_eq!(nav[0], HudKeyHint { from: "H".into(), to: "←".into() });
        assert!(nav[1].to.ends_with('←'));
    }
}
