//! On-screen layer overlay: while a layer key is held, a small frosted pill at
//! the bottom of the screen names the layer that is on; it hides on release.
//!
//! The rule (shown only while remapping is really running and a layer is held)
//! is platform-neutral and tested. On macOS the pill is a borderless,
//! click-through, non-activating `NSPanel` with behind-window glass
//! (`NSVisualEffectView`, Studio L6 notification layer), so it floats over
//! full-screen apps without taking keyboard focus. Other platforms show nothing
//! yet (shortcut: Windows has no overlay; add one when Windows ships publicly).

use crate::native_remapping::NativeStatus;
use std::sync::Mutex;

static LAST_SHOWN: Mutex<Option<String>> = Mutex::new(None);

/// Never claim a layer is live unless capture and permissions are confirmed.
pub fn status_is_running(status: &NativeStatus) -> bool {
    status.state == "running"
        && status.enabled
        && status.helper_installed
        && status.driver_ready
        && status.input_monitoring_granted
        && status.captured_devices > 0
}

/// The overlay text: held layers in the order they went on, or `None` to hide.
pub fn layer_title(status: &NativeStatus) -> Option<String> {
    (status_is_running(status) && !status.active_layers.is_empty())
        .then(|| status.active_layers.join(" › "))
}

/// Show, update or hide the overlay for a fresh service status.
pub fn sync_from_status(app: &tauri::AppHandle, status: &NativeStatus) {
    let next = layer_title(status);
    {
        let mut last = LAST_SHOWN.lock().unwrap_or_else(|e| e.into_inner());
        if *last == next {
            return;
        }
        *last = next.clone();
    }
    present(app, next);
}

pub fn hide_on_exit(app: &tauri::AppHandle) {
    *LAST_SHOWN.lock().unwrap_or_else(|e| e.into_inner()) = None;
    present(app, None);
}

#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
fn present(app: &tauri::AppHandle, title: Option<String>) {
    #[cfg(target_os = "macos")]
    let _ = app.run_on_main_thread(move || unsafe {
        match title {
            Some(t) => macos_hud::show(&t),
            None => macos_hud::hide(),
        }
    });
}

#[cfg(target_os = "macos")]
mod macos_hud {
    use objc2::encode::{Encode, Encoding, RefEncode};
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
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
        const ENCODING_REF: Encoding = Encoding::Pointer(&Encoding::Struct("CGColor", &[]));
    }

    fn rect(x: f64, y: f64, width: f64, height: f64) -> CGRect {
        CGRect { origin: CGPoint { x, y }, size: CGSize { width, height } }
    }

    // Borderless + NSWindowStyleMaskNonactivatingPanel: never takes focus from the app being typed in.
    const NONACTIVATING_BORDERLESS: usize = 1 << 7;
    const BACKING_BUFFERED: usize = 2;
    // NSStatusWindowLevel: above normal and floating windows.
    const STATUS_WINDOW_LEVEL: isize = 25;
    // CanJoinAllSpaces | Stationary | IgnoresCycle | FullScreenAuxiliary
    const COLLECTION_BEHAVIOR: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
    // NSVisualEffectMaterialPopover follows light and dark mode (HUDWindow is dark-only).
    const MATERIAL_POPOVER: isize = 6;
    const BLEND_BEHIND_WINDOW: isize = 0;
    const STATE_ACTIVE: isize = 1;
    // Studio tokens: radius-group-desktop 18, 4-based spacing.
    const HEIGHT: f64 = 40.0;
    const RADIUS: f64 = 18.0;
    const PAD: f64 = 16.0;
    const DOT: f64 = 8.0;
    const GAP: f64 = 8.0;
    const BOTTOM: f64 = 28.0;

    struct Hud {
        panel: *mut AnyObject,
        effect: *mut AnyObject,
        dot: *mut AnyObject,
        title: *mut AnyObject,
    }

    thread_local! {
        static HUD: RefCell<Option<Hud>> = const { RefCell::new(None) };
    }

    unsafe fn class(name: &std::ffi::CStr) -> &'static AnyClass {
        AnyClass::get(name).expect("AppKit class")
    }

    pub(crate) unsafe fn nsstring(text: &str) -> *mut AnyObject {
        let c = CString::new(text.replace('\0', "")).unwrap_or_default();
        msg_send![class(c"NSString"), stringWithUTF8String: c.as_ptr()]
    }

    unsafe fn cg(color: *mut AnyObject) -> *mut CGColorOpaque {
        msg_send![color, CGColor]
    }

    /// The pill's own resolved appearance (follows the system light/dark setting).
    unsafe fn is_dark(view: *mut AnyObject) -> bool {
        let appearance: *mut AnyObject = msg_send![view, effectiveAppearance];
        let name: *mut AnyObject = msg_send![appearance, name];
        let utf8: *const std::ffi::c_char = msg_send![name, UTF8String];
        !utf8.is_null() && std::ffi::CStr::from_ptr(utf8).to_string_lossy().contains("Dark")
    }

    unsafe fn build() -> Hud {
        let start = rect(0.0, 0.0, 160.0, HEIGHT);
        let panel: *mut AnyObject = msg_send![class(c"NSPanel"), alloc];
        let panel: *mut AnyObject = msg_send![
            panel,
            initWithContentRect: start,
            styleMask: NONACTIVATING_BORDERLESS,
            backing: BACKING_BUFFERED,
            defer: Bool::NO
        ];
        let clear: *mut AnyObject = msg_send![class(c"NSColor"), clearColor];
        let _: () = msg_send![panel, setReleasedWhenClosed: Bool::NO];
        let _: () = msg_send![panel, setFloatingPanel: Bool::YES];
        let _: () = msg_send![panel, setBecomesKeyOnlyIfNeeded: Bool::YES];
        let _: () = msg_send![panel, setHidesOnDeactivate: Bool::NO];
        let _: () = msg_send![panel, setIgnoresMouseEvents: Bool::YES];
        let _: () = msg_send![panel, setOpaque: Bool::NO];
        let _: () = msg_send![panel, setBackgroundColor: clear];
        let _: () = msg_send![panel, setHasShadow: Bool::YES];
        let _: () = msg_send![panel, setLevel: STATUS_WINDOW_LEVEL];
        let _: () = msg_send![panel, setCollectionBehavior: COLLECTION_BEHAVIOR];

        let effect: *mut AnyObject = msg_send![class(c"NSVisualEffectView"), alloc];
        let effect: *mut AnyObject = msg_send![effect, initWithFrame: start];
        let _: () = msg_send![effect, setMaterial: MATERIAL_POPOVER];
        let _: () = msg_send![effect, setBlendingMode: BLEND_BEHIND_WINDOW];
        let _: () = msg_send![effect, setState: STATE_ACTIVE];
        let _: () = msg_send![effect, setWantsLayer: Bool::YES];
        let layer: *mut AnyObject = msg_send![effect, layer];
        let _: () = msg_send![layer, setCornerRadius: RADIUS];
        let _: () = msg_send![layer, setMasksToBounds: Bool::YES];
        let _: () = msg_send![layer, setBorderWidth: 1.0f64];

        let dot: *mut AnyObject = msg_send![class(c"NSView"), alloc];
        let dot: *mut AnyObject = msg_send![dot, initWithFrame: rect(PAD, (HEIGHT - DOT) / 2.0, DOT, DOT)];
        let _: () = msg_send![dot, setWantsLayer: Bool::YES];
        let dot_layer: *mut AnyObject = msg_send![dot, layer];
        let _: () = msg_send![dot_layer, setCornerRadius: DOT / 2.0];

        // labelColor is the system's dynamic ink: >= 7:1 on the popover material in both modes.
        let font: *mut AnyObject = msg_send![class(c"NSFont"), systemFontOfSize: 13.0f64, weight: 0.3f64];
        let ink: *mut AnyObject = msg_send![class(c"NSColor"), labelColor];
        let title: *mut AnyObject = msg_send![class(c"NSTextField"), labelWithString: nsstring("")];
        let _: () = msg_send![title, setFont: font];
        let _: () = msg_send![title, setTextColor: ink];
        // NSLineBreakByTruncatingTail
        let _: () = msg_send![title, setLineBreakMode: 4usize];

        let _: () = msg_send![effect, addSubview: dot];
        let _: () = msg_send![effect, addSubview: title];
        let _: () = msg_send![panel, setContentView: effect];
        Hud { panel, effect, dot, title }
    }

    pub unsafe fn show(text: &str) {
        HUD.with(|slot| {
            let mut slot = slot.borrow_mut();
            let hud = slot.get_or_insert_with(|| build());

            // CGColors are static, so re-resolve the theme-dependent ones on every show.
            let dark = is_dark(hud.effect);
            let rim = msg_send![class(c"NSColor"), colorWithWhite: if dark { 1.0f64 } else { 0.0f64 }, alpha: if dark { 0.18f64 } else { 0.10f64 }];
            let layer: *mut AnyObject = msg_send![hud.effect, layer];
            let _: () = msg_send![layer, setBorderColor: cg(rim)];
            let accent: *mut AnyObject = msg_send![class(c"NSColor"), controlAccentColor];
            let dot_layer: *mut AnyObject = msg_send![hud.dot, layer];
            let _: () = msg_send![dot_layer, setBackgroundColor: cg(accent)];

            let _: () = msg_send![hud.title, setStringValue: nsstring(text)];
            let _: () = msg_send![hud.title, sizeToFit];
            let fit: CGRect = msg_send![hud.title, frame];
            let title_x = PAD + DOT + GAP;
            let title_w = fit.size.width.ceil().min(320.0);
            let width = title_x + title_w + PAD;
            let _: () = msg_send![
                hud.title,
                setFrame: rect(title_x, ((HEIGHT - fit.size.height) / 2.0).round(), title_w, fit.size.height)
            ];
            let _: () = msg_send![hud.effect, setFrame: rect(0.0, 0.0, width, HEIGHT)];

            let screen: *mut AnyObject = msg_send![class(c"NSScreen"), mainScreen];
            let (x, y) = if screen.is_null() {
                (200.0, 80.0)
            } else {
                let vis: CGRect = msg_send![screen, visibleFrame];
                ((vis.origin.x + (vis.size.width - width) / 2.0).round(), vis.origin.y + BOTTOM)
            };
            let _: () = msg_send![hud.panel, setFrame: rect(x, y, width, HEIGHT), display: Bool::YES];
            let _: () = msg_send![hud.panel, orderFrontRegardless];
        });
    }

    pub unsafe fn hide() {
        HUD.with(|slot| {
            if let Some(hud) = slot.borrow().as_ref() {
                let none: *mut AnyObject = std::ptr::null_mut();
                let _: () = msg_send![hud.panel, orderOut: none];
            }
        });
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn geometry_encodings_match_the_objc_runtime() {
            assert_eq!(CGRect::ENCODING.to_string(), "{CGRect={CGPoint=dd}{CGSize=dd}}");
            unsafe {
                let s = nsstring("nav › sym");
                let len: usize = msg_send![s, length];
                assert_eq!(len, 9);
                // objc2 checks the CGColor return encoding in debug builds; a wrong one panics here.
                let accent: *mut AnyObject = msg_send![class(c"NSColor"), controlAccentColor];
                assert!(!cg(accent).is_null());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn running(layers: &[&str]) -> NativeStatus {
        NativeStatus {
            state: "running".into(),
            message: "Active".into(),
            driver_ready: true,
            input_monitoring_granted: true,
            helper_installed: true,
            enabled: true,
            captured_devices: 1,
            profile_title: Some("Laptop".into()),
            active_layers: layers.iter().map(|s| s.to_string()).collect(),
            state_seq: 3,
            protocol_version: 1,
        }
    }

    #[test]
    fn overlay_shows_only_while_running_and_a_layer_is_held() {
        assert_eq!(layer_title(&running(&[])), None);
        assert_eq!(layer_title(&running(&["nav"])).as_deref(), Some("nav"));
        assert_eq!(layer_title(&running(&["nav", "numbers"])).as_deref(), Some("nav › numbers"));

        let mut stopped = running(&["nav"]);
        stopped.enabled = false;
        assert_eq!(layer_title(&stopped), None);
        let mut uncaptured = running(&["nav"]);
        uncaptured.captured_devices = 0;
        assert_eq!(layer_title(&uncaptured), None);
        let mut paused = running(&["nav"]);
        paused.state = "stopped".into();
        assert_eq!(layer_title(&paused), None);
    }
}
