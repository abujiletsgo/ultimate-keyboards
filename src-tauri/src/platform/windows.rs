//! Windows: links open through ShellExecute; macOS-only features say why they
//! are not here instead of pretending.

use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// Why the scroll & mouse engine is missing on this OS (the UI shows it in place).
pub const MOUSE_ENGINE_REASON: &str = "Scroll and mouse tuning is not available on Windows.";

/// Turning the laptop keyboard off has no safe Windows equivalent here (no
/// per-device switch without a kernel driver), so only "restore" succeeds, and
/// restoring when nothing was changed is a no-op.
pub fn set_builtin_keyboard(disabled: bool) -> Result<(), String> {
    if disabled {
        Err("Turning off the laptop keyboard is not available on Windows.".into())
    } else {
        Ok(())
    }
}

/// Exporting rules for another remapper is a Mac-only feature.
pub fn install_karabiner_rules(_title: &str, _json: &str) -> Result<String, String> {
    Err("Exporting rules for another remapper is not available on Windows.".into())
}

/// Windows has no Accessibility grant to ask for; the scroll engine is absent
/// instead (see `MOUSE_ENGINE_REASON`).
pub fn accessibility_trusted() -> bool {
    true
}

pub fn open_accessibility_settings() -> Result<(), String> {
    Err("There is no Accessibility setting to open on Windows.".into())
}

pub(super) fn open_url_os(url: &str) -> Result<(), String> {
    let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() };
    let verb = wide("open");
    let target = wide(url);
    // SAFETY: both buffers are NUL-terminated and outlive the call; null
    // parameters and directory are allowed by ShellExecuteW.
    let code = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;
    // Values above 32 mean success.
    if code > 32 {
        Ok(())
    } else {
        Err(format!("Windows could not open the link (ShellExecute code {code})"))
    }
}
