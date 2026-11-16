//! The scroll & mouse engine exists on macOS only (CGEventTap). On other
//! systems the same interface reports why it is absent and never starts.

pub fn unavailable_reason() -> Option<&'static str> {
    Some(crate::platform::MOUSE_ENGINE_REASON)
}

pub fn start() -> Result<(), String> {
    Err(crate::platform::MOUSE_ENGINE_REASON.into())
}

pub fn set_config(_enabled: bool, _reverse: bool, _speed: f64) {}

pub fn get_config() -> (bool, bool, f64) {
    (false, false, 1.0)
}
