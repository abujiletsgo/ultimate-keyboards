//! OS-specific plumbing behind one interface. Everything the shared code needs
//! from the operating system (open a link, switch the built-in keyboard, the
//! scroll-engine permission) is a function here; `cfg(target_os)` lives in this
//! folder and in lib.rs's module list, nowhere else.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

#[cfg(not(any(target_os = "macos", windows)))]
compile_error!("Ultimate Keyboards builds on macOS and Windows only");

/// Open an `https://` link in the default browser. Callers have already
/// checked the URL against their allow-list.
pub fn open_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("only https:// links can be opened".into());
    }
    open_url_os(url)
}
