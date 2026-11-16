//! Frame pacing for the app's WKWebView (Studio Decisions #77: never cap the
//! refresh rate).
//!
//! WebKit ships `PreferPageRenderingUpdatesNear60FPSEnabled` turned on, so a
//! WKWebView renders pages near 60 fps even on a 120 Hz ProMotion display
//! (checked on macOS 26: the preference reads `true` by default). The app turns
//! it off for its webview and reads it back; `scripts/check-frames.ts` fails
//! the build if this call disappears.
//!
//! The opt-in frame probe (`UK_FRAME_PROBE=<file>`) lets QA record per-frame
//! main-thread cost from the running app (src/lib/frameProbe.ts). Without the
//! variable it does nothing.

use std::sync::OnceLock;

const FEATURE: &str = "PreferPageRenderingUpdatesNear60FPSEnabled";

static PACING: OnceLock<Result<bool, String>> = OnceLock::new();

/// Turn the 60 fps preference off. Result: the preference's value read back
/// (false = rendering follows the display), or why it could not be changed.
#[cfg(target_os = "macos")]
pub fn uncap(window: &tauri::WebviewWindow) {
    let sent = window.with_webview(|webview| {
        let result = unsafe { set_feature(webview.inner() as *mut objc2::runtime::AnyObject, FEATURE, false) };
        match &result {
            Ok(v) => eprintln!("frames: {FEATURE} = {v}"),
            Err(e) => eprintln!("frames: could not change {FEATURE}: {e}"),
        }
        let _ = PACING.set(result);
    });
    if let Err(e) = sent {
        let _ = PACING.set(Err(e.to_string()));
    }
}

/// Only WKWebView holds a 60 fps preference; other webviews follow the display.
#[cfg(not(target_os = "macos"))]
pub fn uncap(_window: &tauri::WebviewWindow) {
    let _ = PACING.set(Err("this webview does not cap the frame rate; nothing to change".into()));
}

/// Set one WebKit feature flag on a live WKWebView and return its new value.
#[cfg(target_os = "macos")]
unsafe fn set_feature(webview: *mut objc2::runtime::AnyObject, key: &str, enabled: bool) -> Result<bool, String> {
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2::{msg_send, sel};
    use std::ffi::CStr;

    if webview.is_null() {
        return Err("no WKWebView".into());
    }
    let config: *mut AnyObject = msg_send![webview, configuration];
    let prefs: *mut AnyObject = msg_send![config, preferences];
    let cls = AnyClass::get(c"WKPreferences").ok_or("WKPreferences missing")?;
    let has_features: Bool = msg_send![cls, respondsToSelector: sel!(_features)];
    let can_set: Bool = msg_send![prefs, respondsToSelector: sel!(_setEnabled:forFeature:)];
    let can_read: Bool = msg_send![prefs, respondsToSelector: sel!(_isEnabledForFeature:)];
    if !has_features.as_bool() || !can_set.as_bool() || !can_read.as_bool() {
        return Err("this WebKit has no feature flags API".into());
    }
    let features: *mut AnyObject = msg_send![cls, _features];
    let count: usize = msg_send![features, count];
    for i in 0..count {
        let feature: *mut AnyObject = msg_send![features, objectAtIndex: i];
        let name: *mut AnyObject = msg_send![feature, key];
        if name.is_null() {
            continue;
        }
        let utf8: *const std::ffi::c_char = msg_send![name, UTF8String];
        if utf8.is_null() || CStr::from_ptr(utf8).to_str() != Ok(key) {
            continue;
        }
        let _: () = msg_send![prefs, _setEnabled: Bool::new(enabled), forFeature: feature];
        let now: Bool = msg_send![prefs, _isEnabledForFeature: feature];
        return Ok(now.as_bool());
    }
    Err(format!("{key} not found in this WebKit"))
}

/// What the uncap did: `{ "feature": ..., "enabled": bool }` or an error.
#[tauri::command]
pub fn frame_pacing_status() -> Result<serde_json::Value, String> {
    match PACING.get() {
        Some(Ok(v)) => Ok(serde_json::json!({ "feature": FEATURE, "enabled": v })),
        Some(Err(e)) => Err(e.clone()),
        None => Err("not applied yet".into()),
    }
}

/// The frame probe's output file when QA launched the app with UK_FRAME_PROBE.
#[tauri::command]
pub fn frame_probe_target() -> Option<String> {
    std::env::var("UK_FRAME_PROBE").ok().filter(|p| !p.is_empty())
}

/// Write the probe's report to the UK_FRAME_PROBE file (only that file).
#[tauri::command(async)]
pub fn frame_probe_write(report: String) -> Result<(), String> {
    let path = frame_probe_target().ok_or("frame probe is off")?;
    std::fs::write(path, report).map_err(|e| e.to_string())
}
