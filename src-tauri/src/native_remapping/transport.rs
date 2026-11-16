//! Shared IPC framing, transport trait, and platform-neutral setup helpers.
use super::NativeStatus;
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const UNIX_SOCKET: &str = "/var/run/com.ultimatekeyboards.remapper.sock";
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_PIPE: &str = r"\\.\pipe\ultimatekeyboards-remapper";
pub const MAX_MESSAGE: usize = 1_048_576;
pub const TIMEOUT: Duration = Duration::from_secs(2);

#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_MIN_BUILD: u32 = 19045;
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_RUN_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_RUN_VALUE: &str = "UltimateKeyboardsRemapper";
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_SERVICE_EXE: &str = "ultimate-keyboards-remapper-win.exe";
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_ELEVATED_NOTE: &str =
    "Administrator windows (such as elevated PowerShell or Task Manager) keep normal keys.";
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_NO_INPUT_MONITORING: &str =
    "Windows does not require Input Monitoring permission for keyboard remapping.";
#[cfg_attr(not(windows), allow(dead_code))]
pub const WINDOWS_NO_DRIVER: &str = "Windows keyboard remapping needs no separate driver.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransportKind {
    UnixSocket,
    NamedPipe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
pub struct TransportSpec {
    pub kind: TransportKind,
    pub endpoint: &'static str,
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn select_transport(target_os: &str) -> Result<TransportSpec, String> {
    match target_os {
        "macos" => Ok(TransportSpec {
            kind: TransportKind::UnixSocket,
            endpoint: UNIX_SOCKET,
        }),
        "windows" => Ok(TransportSpec {
            kind: TransportKind::NamedPipe,
            endpoint: WINDOWS_PIPE,
        }),
        other => Err(format!("Native remapping is not supported on {other}.")),
    }
}

/// Narrow request/response transport implemented by the macOS Unix socket and
/// the Windows per-user named pipe.
pub trait Transport {
    #[allow(dead_code)]
    fn kind(&self) -> TransportKind;
    #[allow(dead_code)]
    fn endpoint(&self) -> &str;
    /// Sends one newline-terminated JSON request (`<= MAX_MESSAGE` bytes) and
    /// returns the raw newline-terminated response bytes plus the peer PID.
    fn transact(&self, framed_request: &[u8]) -> Result<(Vec<u8>, i32), String>;
}

#[derive(Deserialize)]
struct Response {
    ok: bool,
    status: NativeStatus,
    error: Option<String>,
}

pub fn status_request() -> Value {
    json!({ "version": 1, "command": "status" })
}

/// Builds an `apply` request. `enable` is always explicit (`false` validates and
/// stores the profile while keeping remapping off; Save never starts remapping).
pub fn apply_request(profile: Value, enable: bool) -> Value {
    json!({ "version": 1, "command": "apply", "profile": profile, "enable": enable })
}

pub fn disable_request() -> Value {
    json!({ "version": 1, "command": "disable" })
}

pub fn restart_request() -> Value {
    json!({ "version": 1, "command": "restart" })
}

pub fn encode_request(request: &Value) -> Result<Vec<u8>, String> {
    let mut bytes = serde_json::to_vec(request).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    if bytes.len() > MAX_MESSAGE {
        return Err("Keyboard profile is too large.".into());
    }
    Ok(bytes)
}

pub fn read_response_line(reader: impl Read) -> Result<Vec<u8>, String> {
    let mut line = Vec::new();
    BufReader::new(reader.take((MAX_MESSAGE + 1) as u64))
        .read_until(b'\n', &mut line)
        .map_err(|e| format!("Keyboard service did not respond: {e}"))?;
    if line.len() > MAX_MESSAGE || line.last() != Some(&b'\n') {
        return Err("Keyboard service returned an oversized or incomplete message.".into());
    }
    Ok(line)
}

pub fn decode_response_bytes(line: &[u8]) -> Result<NativeStatus, String> {
    if line.len() > MAX_MESSAGE || line.last() != Some(&b'\n') {
        return Err("Keyboard service returned an oversized or incomplete message.".into());
    }
    let response: Response = serde_json::from_slice(line)
        .map_err(|e| format!("Keyboard service returned an invalid response: {e}"))?;
    if response.status.protocol_version != 1 {
        return Err("Keyboard service needs an update to match this app.".into());
    }
    if !response.ok {
        return Err(response.error.unwrap_or(response.status.message));
    }
    Ok(response.status)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn decode_response(reader: impl Read) -> Result<NativeStatus, String> {
    let line = read_response_line(reader)?;
    decode_response_bytes(&line)
}

pub fn exchange_with_transport<T: Transport + ?Sized>(
    transport: &T,
    request: Value,
) -> Result<(NativeStatus, i32), String> {
    let bytes = encode_request(&request)?;
    let (line, pid) = transport.transact(&bytes)?;
    let status = decode_response_bytes(&line)?;
    Ok((status, pid))
}

#[cfg_attr(not(windows), allow(dead_code))]
pub fn check_windows_build(build: u32) -> Result<(), String> {
    if build >= WINDOWS_MIN_BUILD {
        Ok(())
    } else {
        Err("Remapping needs Windows 10 version 22H2 or newer. Update Windows, then turn it on again.".into())
    }
}

fn is_windows_drive_path(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
}

/// Formats a safe quoted command line for `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn format_windows_run_command(exe: &Path) -> Result<String, String> {
    let raw = exe
        .to_str()
        .ok_or("The keyboard service path contains unsupported characters.")?;
    let cleaned = raw
        .strip_prefix(r"\\?\")
        .filter(|rest| is_windows_drive_path(rest))
        .unwrap_or(raw);
    if cleaned.is_empty()
        || cleaned
            .chars()
            .any(|c| matches!(c, '"' | '\0' | '\r' | '\n'))
    {
        return Err("The keyboard service path cannot be registered for sign-in startup.".into());
    }
    if !is_windows_drive_path(cleaned) && !cleaned.starts_with(r"\\") {
        return Err("The keyboard service path must be an absolute Windows path.".into());
    }
    Ok(format!("\"{cleaned}\""))
}

/// Ensures Windows status responses carry `inputMonitoringGranted = true` and
/// surface the Windows elevated-window limit in place without mutating across polls.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn with_windows_status_notes(mut status: NativeStatus) -> NativeStatus {
    status.input_monitoring_granted = true;
    if matches!(status.state.as_str(), "stopped" | "running")
        && !status.message.contains("Administrator windows")
    {
        let base = status.message.trim();
        status.message = if base.is_empty() {
            WINDOWS_ELEVATED_NOTE.into()
        } else if base.ends_with('.') || base.ends_with('!') {
            format!("{base} {WINDOWS_ELEVATED_NOTE}")
        } else {
            format!("{base}. {WINDOWS_ELEVATED_NOTE}")
        };
    }
    status
}

#[cfg_attr(not(windows), allow(dead_code))]
pub fn missing_windows_service_status(helper_files_present: bool) -> NativeStatus {
    if helper_files_present {
        NativeStatus {
            state: "error".into(),
            message: "The Windows keyboard service is installed, but it is not running yet. Choose Check status or Install native components to start it.".into(),
            driver_ready: false,
            input_monitoring_granted: true,
            helper_installed: true,
            enabled: false,
            captured_devices: 0,
            profile_title: None,
            protocol_version: 1,
        }
    } else {
        NativeStatus {
            state: "not_installed".into(),
            message: "This copy is missing the bundled Windows keyboard service. Reinstall Ultimate Keyboards to set up remapping.".into(),
            driver_ready: false,
            input_monitoring_granted: true,
            helper_installed: false,
            enabled: false,
            captured_devices: 0,
            profile_title: None,
            protocol_version: 1,
        }
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
pub fn windows_service_candidates(
    exe_path: Option<&Path>,
    resource_dir: Option<&Path>,
    local_app_data: Option<&Path>,
    target_arch: &str,
) -> Vec<PathBuf> {
    let sidecar_triple = match target_arch {
        "aarch64" => Some("ultimate-keyboards-remapper-win-aarch64-pc-windows-msvc.exe"),
        "x86_64" => Some("ultimate-keyboards-remapper-win-x86_64-pc-windows-msvc.exe"),
        _ => None,
    };
    let mut out = Vec::new();
    let mut push = |p: PathBuf| {
        if !out.contains(&p) {
            out.push(p);
        }
    };
    if let Some(dir) = exe_path.and_then(Path::parent) {
        push(dir.join(WINDOWS_SERVICE_EXE));
        if let Some(triple_bin) = sidecar_triple {
            push(dir.join(triple_bin));
        }
        push(dir.join("native").join(WINDOWS_SERVICE_EXE));
        push(dir.join("resources").join("native").join(WINDOWS_SERVICE_EXE));
        push(dir.join("resources").join(WINDOWS_SERVICE_EXE));
    }
    if let Some(res) = resource_dir {
        push(res.join("native").join(WINDOWS_SERVICE_EXE));
        push(res.join(WINDOWS_SERVICE_EXE));
    }
    if let Some(app_data) = local_app_data {
        push(
            app_data
                .join("com.ultimatekeyboards.app")
                .join("Native")
                .join(WINDOWS_SERVICE_EXE),
        );
    }
    out
}
