//! Compile-only stand-in for `native_remapping.rs` on Windows until the
//! Windows keyboard service and its named-pipe client land (KE-73, KE-80).
//! Same commands and the same JSON shape as the macOS client; every call
//! reports that the service is not installed. Nothing here touches input.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const NOT_READY: &str = "Keyboard remapping for Windows is not set up in this build yet.";

pub fn start_heartbeat() {}

pub fn stop_on_exit() {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStatus {
    pub state: String,
    pub message: String,
    pub driver_ready: bool,
    pub input_monitoring_granted: bool,
    pub helper_installed: bool,
    pub enabled: bool,
    pub captured_devices: usize,
    pub profile_title: Option<String>,
    pub protocol_version: u32,
}

fn not_installed() -> NativeStatus {
    NativeStatus {
        state: "not_installed".into(),
        message: NOT_READY.into(),
        driver_ready: false,
        input_monitoring_granted: false,
        helper_installed: false,
        enabled: false,
        captured_devices: 0,
        profile_title: None,
        protocol_version: 1,
    }
}

#[tauri::command(async)]
pub fn native_remapping_status() -> NativeStatus {
    not_installed()
}

#[tauri::command(async)]
pub fn native_remapping_apply(_profile: Value, _enable: bool) -> Result<NativeStatus, String> {
    Err(NOT_READY.into())
}

#[tauri::command(async)]
pub fn native_remapping_disable() -> Result<NativeStatus, String> {
    Ok(not_installed())
}

#[tauri::command(async)]
pub fn native_remapping_install(_app: tauri::AppHandle) -> Result<String, String> {
    Err(NOT_READY.into())
}

#[tauri::command(async)]
pub fn native_remapping_open_settings() -> Result<(), String> {
    Err(NOT_READY.into())
}

#[tauri::command(async)]
pub fn native_remapping_refresh_permissions() -> Result<NativeStatus, String> {
    Ok(not_installed())
}

#[tauri::command(async)]
pub fn native_remapping_activate_driver() -> Result<String, String> {
    Err(NOT_READY.into())
}
