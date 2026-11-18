//! Narrow IPC client for the keyboard service (Unix socket on macOS, per-user
//! named pipe on Windows). No command accepts a shell command, an endpoint
//! path, or a filesystem path from the webview.
mod transport;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as os;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows as os;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

#[derive(Default)]
struct LiveWatch {
    enabled: bool,
    watch_supported: bool,
    last_seq: u64,
    last_emitted: Option<NativeStatus>,
}

struct LiveBridge {
    app: tauri::AppHandle,
    state: Mutex<LiveWatch>,
    cv: Condvar,
}

static BRIDGE: OnceLock<LiveBridge> = OnceLock::new();

fn observe_status(status: &NativeStatus) {
    let Some(bridge) = BRIDGE.get() else {
        return;
    };
    let should_emit = {
        let mut guard = bridge.state.lock().unwrap_or_else(|e| e.into_inner());
        let was_enabled = guard.enabled;
        guard.enabled = status.enabled;
        if status.state_seq > 0 {
            guard.last_seq = status.state_seq;
        }
        if status.enabled && !was_enabled {
            guard.watch_supported = true;
            bridge.cv.notify_one();
        } else if !status.enabled && was_enabled {
            bridge.cv.notify_one();
        }
        let changed = guard.last_emitted.as_ref() != Some(status);
        if changed {
            guard.last_emitted = Some(status.clone());
        }
        changed
    };
    if should_emit {
        crate::layer_hud::sync_from_status(&bridge.app, status);
    }
}

/// Keep the capture lease alive even when WebKit or WebView2 throttles timers in
/// a hidden window, and long-poll `watch` while remapping is on so layer holds
/// and releases reach the on-screen layer overlay as they happen.
pub fn start_heartbeat(app: tauri::AppHandle) {
    static STARTED: std::sync::Once = std::sync::Once::new();
    STARTED.call_once(|| {
        let _ = BRIDGE.set(LiveBridge {
            app,
            state: Mutex::new(LiveWatch {
                enabled: false,
                watch_supported: true,
                last_seq: 0,
                last_emitted: None,
            }),
            cv: Condvar::new(),
        });
        std::thread::spawn(|| loop {
            let status = os::status();
            observe_status(&status);
            std::thread::sleep(Duration::from_secs(3));
        });
        std::thread::spawn(|| {
            let Some(bridge) = BRIDGE.get() else {
                return;
            };
            loop {
                let since = {
                    let guard = bridge.state.lock().unwrap_or_else(|e| e.into_inner());
                    let guard = bridge
                        .cv
                        .wait_while(guard, |s| !s.enabled || !s.watch_supported)
                        .unwrap_or_else(|e| e.into_inner());
                    guard.last_seq
                };
                match os::watch(since) {
                    Ok(status) => {
                        // An unchanged reply (hold timeout, or a restart that answers at once) must not spin.
                        if status.state_seq == since {
                            std::thread::sleep(Duration::from_millis(50));
                        }
                        observe_status(&status);
                    }
                    Err(err) => {
                        if err.contains("Unknown command") {
                            let mut guard =
                                bridge.state.lock().unwrap_or_else(|e| e.into_inner());
                            guard.watch_supported = false;
                        } else {
                            std::thread::sleep(Duration::from_millis(400));
                        }
                    }
                }
            }
        });
    });
}

pub fn stop_on_exit() {
    os::stop_on_exit();
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    #[serde(default)]
    pub active_layers: Vec<String>,
    #[serde(default)]
    pub state_seq: u64,
    pub protocol_version: u32,
}

impl NativeStatus {
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub(crate) fn unavailable(state: &str, message: String, helper_installed: bool) -> Self {
        Self {
            state: state.into(),
            message,
            driver_ready: false,
            input_monitoring_granted: false,
            helper_installed,
            enabled: false,
            captured_devices: 0,
            profile_title: None,
            active_layers: Vec::new(),
            state_seq: 0,
            protocol_version: 1,
        }
    }
}

#[tauri::command(async)]
pub fn native_remapping_status() -> NativeStatus {
    let status = os::status();
    observe_status(&status);
    status
}

#[tauri::command(async)]
pub fn native_remapping_apply(profile: Value, enable: bool) -> Result<NativeStatus, String> {
    let status = os::apply(profile, enable)?;
    observe_status(&status);
    Ok(status)
}

#[tauri::command(async)]
pub fn native_remapping_disable() -> Result<NativeStatus, String> {
    let status = os::disable()?;
    observe_status(&status);
    Ok(status)
}

#[tauri::command(async)]
pub fn native_remapping_install(app: tauri::AppHandle) -> Result<String, String> {
    os::install(app)
}

/// Explicit user refresh only. Heartbeats never call this or restart the service.
#[tauri::command(async)]
pub fn native_remapping_refresh_permissions() -> Result<NativeStatus, String> {
    let status = os::refresh_permissions()?;
    observe_status(&status);
    Ok(status)
}

#[tauri::command(async)]
pub fn native_remapping_open_settings() -> Result<(), String> {
    os::open_settings()
}

#[tauri::command(async)]
pub fn native_remapping_activate_driver() -> Result<String, String> {
    os::activate_driver()
}

#[cfg(test)]
mod tests {
    use super::transport::{
        apply_request, check_windows_build, decode_response, disable_request, encode_request,
        exchange_with_transport, format_windows_run_command, missing_windows_service_status,
        restart_request, select_transport, status_request, windows_service_candidates,
        with_windows_status_notes, Transport, TransportKind, MAX_MESSAGE, UNIX_SOCKET,
        WINDOWS_ELEVATED_NOTE, WINDOWS_NO_DRIVER, WINDOWS_NO_INPUT_MONITORING, WINDOWS_PIPE,
    };
    use super::*;
    use serde_json::json;
    use std::cell::RefCell;
    use std::path::Path;

    fn response() -> Value {
        json!({
            "ok": true,
            "status": {
                "state": "stopped",
                "message": "Ready",
                "driverReady": true,
                "inputMonitoringGranted": true,
                "helperInstalled": true,
                "enabled": false,
                "capturedDevices": 0,
                "profileTitle": null,
                "protocolVersion": 1
            }
        })
    }

    #[test]
    fn accepts_complete_versioned_status() {
        let s = format!("{}\n", response());
        assert_eq!(decode_response(s.as_bytes()).unwrap().state, "stopped");
    }

    #[test]
    fn rejects_truncated_oversized_and_wrong_protocol() {
        assert!(decode_response(response().to_string().as_bytes()).is_err());
        assert!(decode_response(vec![b'x'; MAX_MESSAGE + 1].as_slice()).is_err());
        let mut value = response();
        value["status"]["protocolVersion"] = json!(2);
        assert!(decode_response(format!("{value}\n").as_bytes()).is_err());
    }

    #[test]
    fn propagates_service_rejections() {
        let mut value = response();
        value["ok"] = json!(false);
        value["error"] = json!("Profile contains an unsupported key: fn");
        assert!(decode_response(format!("{value}\n").as_bytes())
            .unwrap_err()
            .contains("unsupported key"));
    }

    struct FakePipeTransport {
        sent_frames: RefCell<Vec<Vec<u8>>>,
        next_reply: RefCell<Vec<u8>>,
        pid: i32,
    }

    impl FakePipeTransport {
        fn new(reply: Vec<u8>, pid: i32) -> Self {
            Self {
                sent_frames: RefCell::new(Vec::new()),
                next_reply: RefCell::new(reply),
                pid,
            }
        }

        fn set_reply(&self, reply: Vec<u8>) {
            *self.next_reply.borrow_mut() = reply;
        }
    }

    impl Transport for FakePipeTransport {
        fn kind(&self) -> TransportKind {
            TransportKind::NamedPipe
        }

        fn endpoint(&self) -> &str {
            WINDOWS_PIPE
        }

        fn transact(&self, framed_request: &[u8]) -> Result<(Vec<u8>, i32), String> {
            self.sent_frames.borrow_mut().push(framed_request.to_vec());
            Ok((self.next_reply.borrow().clone(), self.pid))
        }
    }

    #[test]
    fn pipe_transport_selects_windows_named_pipe_and_macos_unix_socket() {
        let win = select_transport("windows").unwrap();
        assert_eq!(win.kind, TransportKind::NamedPipe);
        assert_eq!(win.endpoint, r"\\.\pipe\ultimatekeyboards-remapper");

        let mac = select_transport("macos").unwrap();
        assert_eq!(mac.kind, TransportKind::UnixSocket);
        assert_eq!(mac.endpoint, UNIX_SOCKET);

        assert!(select_transport("linux").is_err());
    }

    #[test]
    fn pipe_transport_frames_requests_and_decodes_responses() {
        // Matches `native/service-win`: profileTitle omitted when None, inputMonitoringGranted true.
        let win_stopped = json!({
            "ok": true,
            "status": {
                "state": "stopped",
                "message": "Remapping is off. Your keyboard works as normal.",
                "driverReady": false,
                "inputMonitoringGranted": true,
                "helperInstalled": true,
                "enabled": false,
                "capturedDevices": 0,
                "protocolVersion": 1
            }
        });
        let pipe = FakePipeTransport::new(format!("{win_stopped}\n").into_bytes(), 4242);
        assert_eq!(pipe.kind(), TransportKind::NamedPipe);
        assert_eq!(pipe.endpoint(), WINDOWS_PIPE);

        let (status, pid) = exchange_with_transport(&pipe, status_request()).unwrap();
        assert_eq!(pid, 4242);
        assert_eq!(status.state, "stopped");
        assert!(!status.enabled);
        assert_eq!(status.profile_title, None);

        // Save / non-enabling apply keeps `enable: false` on the wire so Save never starts remapping.
        let profile = json!({ "version": 1, "title": "Laptop", "rules": [] });
        let (_, _) = exchange_with_transport(&pipe, apply_request(profile.clone(), false)).unwrap();

        let win_running = json!({
            "ok": true,
            "status": {
                "state": "running",
                "message": "Remapping is on for all keyboards.",
                "driverReady": true,
                "inputMonitoringGranted": true,
                "helperInstalled": true,
                "enabled": true,
                "capturedDevices": 1,
                "profileTitle": "Laptop",
                "protocolVersion": 1
            }
        });
        pipe.set_reply(format!("{win_running}\n").into_bytes());
        let (running, _) = exchange_with_transport(&pipe, apply_request(profile, true)).unwrap();
        assert!(running.enabled && running.driver_ready && running.captured_devices == 1);
        assert_eq!(running.profile_title.as_deref(), Some("Laptop"));

        pipe.set_reply(format!("{win_stopped}\n").into_bytes());
        let (stopped, _) = exchange_with_transport(&pipe, disable_request()).unwrap();
        assert!(!stopped.enabled);
        let (_, _) = exchange_with_transport(&pipe, restart_request()).unwrap();

        {
            let frames = pipe.sent_frames.borrow();
            assert_eq!(frames.len(), 5);
            for frame in frames.iter() {
                assert_eq!(frame.last(), Some(&b'\n'), "every frame ends in newline");
                assert_eq!(
                    frame.iter().filter(|&&b| b == b'\n').count(),
                    1,
                    "single-line JSON frame"
                );
                assert!(frame.len() <= MAX_MESSAGE);
            }
            let parsed_save: Value = serde_json::from_slice(&frames[1]).unwrap();
            assert_eq!(parsed_save["command"], "apply");
            assert_eq!(parsed_save["enable"], false);
            let parsed_enable: Value = serde_json::from_slice(&frames[2]).unwrap();
            assert_eq!(parsed_enable["enable"], true);
        }

        // Oversized request is rejected before hitting the pipe.
        let huge = json!({ "version": 1, "command": "apply", "enable": false, "profile": "x".repeat(MAX_MESSAGE) });
        assert!(encode_request(&huge).is_err());
        assert!(exchange_with_transport(&pipe, huge).is_err());
        assert_eq!(pipe.sent_frames.borrow().len(), 5);

        // Unterminated response over the pipe is rejected.
        pipe.set_reply(win_stopped.to_string().into_bytes());
        assert!(exchange_with_transport(&pipe, status_request()).is_err());
    }

    #[test]
    fn windows_setup_quotes_run_key_checks_build_and_shows_elevated_limit() {
        let quoted = format_windows_run_command(Path::new(
            r"C:\Users\Tom Kwon\AppData\Local\Programs\Ultimate Keyboards\ultimate-keyboards-remapper-win.exe",
        ))
        .unwrap();
        assert_eq!(
            quoted,
            r#""C:\Users\Tom Kwon\AppData\Local\Programs\Ultimate Keyboards\ultimate-keyboards-remapper-win.exe""#
        );
        // Extended-length prefix from Windows path canonicalization is stripped for Run-key launch.
        let verbatim = format_windows_run_command(Path::new(
            r"\\?\C:\Program Files\Ultimate Keyboards\ultimate-keyboards-remapper-win.exe",
        ))
        .unwrap();
        assert_eq!(
            verbatim,
            r#""C:\Program Files\Ultimate Keyboards\ultimate-keyboards-remapper-win.exe""#
        );
        assert!(format_windows_run_command(Path::new("relative\\service.exe")).is_err());
        assert!(format_windows_run_command(Path::new(r#"C:\bad"quote\service.exe"#)).is_err());

        // Windows 10 22H2 (build 19045) floor.
        assert!(check_windows_build(19044).unwrap_err().contains("22H2"));
        assert!(check_windows_build(19045).is_ok());
        assert!(check_windows_build(26100).is_ok());

        // Elevated-window limit is shown in place and stays idempotent across heartbeats.
        let base = NativeStatus {
            state: "running".into(),
            message: "Remapping is on for all keyboards.".into(),
            driver_ready: true,
            input_monitoring_granted: false,
            helper_installed: true,
            enabled: true,
            captured_devices: 1,
            profile_title: Some("Laptop".into()),
            active_layers: Vec::new(),
            state_seq: 0,
            protocol_version: 1,
        };
        let noted = with_windows_status_notes(base);
        assert!(noted.input_monitoring_granted);
        assert!(noted.message.contains(WINDOWS_ELEVATED_NOTE));
        assert_eq!(with_windows_status_notes(noted.clone()), noted);

        let missing = missing_windows_service_status(false);
        assert_eq!(missing.state, "not_installed");
        assert!(missing.input_monitoring_granted && !missing.helper_installed);
        for msg in [
            missing.message.as_str(),
            missing_windows_service_status(true).message.as_str(),
            WINDOWS_ELEVATED_NOTE,
            WINDOWS_NO_INPUT_MONITORING,
            WINDOWS_NO_DRIVER,
        ] {
            assert!(!msg.to_lowercase().contains("karabiner"), "{msg}");
            assert!(!msg.to_lowercase().contains("macos"), "{msg}");
        }

        let candidates = windows_service_candidates(
            Some(Path::new(r"C:\App\ultimate-keyboards.exe")),
            Some(Path::new(r"C:\App\resources")),
            Some(Path::new(r"C:\Users\Tom\AppData\Local")),
            "x86_64",
        );
        assert!(candidates.len() >= 4);
    }
}
