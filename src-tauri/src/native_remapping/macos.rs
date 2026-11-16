//! macOS Unix-socket transport, LaunchServices TCC permission checks, and
//! DriverKit activation (unchanged macOS contract).
use super::transport::{
    apply_request, disable_request, exchange_with_transport, read_response_line, restart_request,
    status_request, Transport, TransportKind, TIMEOUT, UNIX_SOCKET,
};
use super::NativeStatus;
use serde::Deserialize;
use serde_json::Value;
use std::io::{Read, Write};
use std::os::unix::fs::{DirBuilderExt, FileTypeExt, MetadataExt, OpenOptionsExt};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::Manager;

const HELPER_BUNDLE: &str =
    "/Library/Application Support/com.ultimatekeyboards.app/Native/Ultimate Keyboards Remapper.app";
const PERMISSION_REPORT_LIMIT: usize = 4096;

pub struct UnixSocketTransport;

impl Transport for UnixSocketTransport {
    fn kind(&self) -> TransportKind {
        TransportKind::UnixSocket
    }

    fn endpoint(&self) -> &str {
        UNIX_SOCKET
    }

    fn transact(&self, framed_request: &[u8]) -> Result<(Vec<u8>, i32), String> {
        // Both the on-disk endpoint and the connected peer must belong to root.
        // The service independently verifies our running code signature and console
        // session before accepting profile changes or refreshing its capture lease.
        let metadata = std::fs::symlink_metadata(self.endpoint())
            .map_err(|e| format!("Keyboard service is unavailable: {e}"))?;
        if metadata.uid() != 0 || !metadata.file_type().is_socket() {
            return Err("Keyboard service endpoint is not a trusted system socket.".into());
        }
        let mut stream = UnixStream::connect(self.endpoint())
            .map_err(|e| format!("Could not connect to the keyboard service: {e}"))?;
        let (mut uid, mut gid) = (0, 0);
        use std::os::fd::AsRawFd;
        if unsafe { libc::getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) } != 0 || uid != 0 {
            return Err("Keyboard service connection is not owned by the system.".into());
        }
        let mut pid: libc::pid_t = 0;
        let mut pid_size = std::mem::size_of_val(&pid) as libc::socklen_t;
        if unsafe {
            libc::getsockopt(
                stream.as_raw_fd(),
                libc::SOL_LOCAL,
                libc::LOCAL_PEERPID,
                (&mut pid as *mut libc::pid_t).cast(),
                &mut pid_size,
            )
        } != 0
            || pid <= 0
        {
            return Err("Could not identify the keyboard service process.".into());
        }
        stream
            .set_read_timeout(Some(TIMEOUT))
            .map_err(|e| e.to_string())?;
        stream
            .set_write_timeout(Some(TIMEOUT))
            .map_err(|e| e.to_string())?;
        stream
            .write_all(framed_request)
            .map_err(|e| format!("Could not send the keyboard profile: {e}"))?;
        Ok((read_response_line(stream)?, pid))
    }
}

fn exchange_with_pid(request: Value) -> Result<(NativeStatus, i32), String> {
    exchange_with_transport(&UnixSocketTransport, request)
}

fn exchange(request: Value) -> Result<NativeStatus, String> {
    exchange_with_pid(request).map(|(status, _)| status)
}

fn missing_service_status(helper_files_present: bool) -> NativeStatus {
    if helper_files_present {
        NativeStatus::unavailable(
            "error",
            "Ultimate Keyboards Remapper is installed but its service is unavailable. Use Repair keyboard service, finish the installer, then choose Check status.".into(),
            true,
        )
    } else {
        NativeStatus::unavailable(
            "not_installed",
            "Install the bundled keyboard service to use these rules on this Mac.".into(),
            false,
        )
    }
}

pub fn stop_on_exit() {
    if Path::new(UNIX_SOCKET).exists() {
        let _ = disable();
    }
}

pub fn status() -> NativeStatus {
    if !Path::new(UNIX_SOCKET).exists() {
        return missing_service_status(
            Path::new(HELPER_BUNDLE).exists()
                || Path::new("/Library/LaunchDaemons/com.ultimatekeyboards.remapper.plist")
                    .exists(),
        );
    }
    exchange(status_request()).unwrap_or_else(|e| NativeStatus::unavailable("error", e, true))
}

pub fn apply(profile: Value, enable: bool) -> Result<NativeStatus, String> {
    exchange(apply_request(profile, enable))
}

pub fn disable() -> Result<NativeStatus, String> {
    exchange(disable_request())
}

pub fn install(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("native/UltimateKeyboards-Native-Setup.pkg");
    if !path.is_file() {
        return Err("This copy is missing its keyboard-service installer. Reinstall Ultimate Keyboards using the complete macOS installer from the product downloads.".into());
    }
    let status = std::process::Command::new("/usr/bin/open")
        .arg("-a")
        .arg("Installer")
        .arg(&path)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!(
            "Could not open the keyboard-service installer: {status}"
        ));
    }
    Ok("The keyboard-service installer is open. Complete its macOS authorization steps, then refresh the service status.".into())
}

fn trusted_helper_bundle() -> Result<PathBuf, String> {
    let helper = PathBuf::from(HELPER_BUNDLE);
    if !helper.is_dir() {
        return Err("Install the bundled keyboard service first.".into());
    }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let own_signature = std::process::Command::new("/usr/bin/codesign")
        .args(["--display", "--verbose=4"])
        .arg(executable)
        .output()
        .map_err(|e| e.to_string())?;
    let signature_info = String::from_utf8_lossy(&own_signature.stderr);
    let team = signature_info
        .lines()
        .find_map(|line| line.strip_prefix("TeamIdentifier="))
        .filter(|team| {
            own_signature.status.success()
                && team.len() == 10
                && team.bytes().all(|c| c.is_ascii_alphanumeric())
        })
        .ok_or(
            "Use an Apple-signed native build to set up the helper's Input Monitoring permission.",
        )?;
    let requirement = format!("=identifier \"com.ultimatekeyboards.remapper\" and anchor apple generic and certificate leaf[subject.OU] = \"{team}\"");
    let verified = std::process::Command::new("/usr/bin/codesign")
        .args(["--verify", "--strict", "-R", &requirement])
        .arg(&helper)
        .output()
        .map_err(|e| e.to_string())?;
    if !verified.status.success() {
        return Err("The keyboard helper's signature does not match this app. Reinstall the bundled native components.".into());
    }
    Ok(helper)
}

#[derive(Clone, Copy)]
enum PermissionMode {
    Status,
    Request,
}
impl PermissionMode {
    fn argument(self) -> &'static str {
        match self {
            Self::Status => "--permission-status",
            Self::Request => "--request-permission",
        }
    }
    fn requests(self) -> bool {
        matches!(self, Self::Request)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PermissionReport {
    protocol_version: u32,
    helper_bundle_identifier: String,
    permission_api: String,
    input_monitoring_granted: bool,
    request_attempted: bool,
    capture_attempted: bool,
    pid: u32,
    uid: u32,
}

fn parse_permission_report(
    reader: impl Read,
    mode: PermissionMode,
    expected_uid: u32,
) -> Result<PermissionReport, String> {
    let mut data = Vec::new();
    reader
        .take((PERMISSION_REPORT_LIMIT + 1) as u64)
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() > PERMISSION_REPORT_LIMIT {
        return Err("Helper permission report exceeds its size limit.".into());
    }
    let report: PermissionReport = serde_json::from_slice(&data)
        .map_err(|e| format!("Invalid helper permission report: {e}"))?;
    if report.protocol_version != 1
        || report.helper_bundle_identifier != "com.ultimatekeyboards.remapper"
        || report.permission_api != "IOHIDCheckAccess"
        || report.request_attempted != mode.requests()
        || report.capture_attempted
        || report.pid == 0
        || report.uid == 0
        || report.uid != expected_uid
    {
        return Err(
            "Helper permission report did not match the requested safe user-session role.".into(),
        );
    }
    Ok(report)
}

struct PermissionFiles {
    directory: PathBuf,
    stdout: PathBuf,
    stderr: PathBuf,
}
impl PermissionFiles {
    fn create() -> Result<Self, String> {
        let mut random = [0_u8; 16];
        std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut random))
            .map_err(|e| e.to_string())?;
        let suffix: String = random.iter().map(|b| format!("{b:02x}")).collect();
        let directory =
            std::env::temp_dir().join(format!("ultimate-keyboards-permission-{suffix}"));
        std::fs::DirBuilder::new()
            .mode(0o700)
            .create(&directory)
            .map_err(|e| e.to_string())?;
        let files = Self {
            stdout: directory.join("stdout.json"),
            stderr: directory.join("stderr.txt"),
            directory,
        };
        for path in [&files.stdout, &files.stderr] {
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .custom_flags(libc::O_NOFOLLOW)
                .open(path)
                .map_err(|e| e.to_string())?;
        }
        Ok(files)
    }
}
impl Drop for PermissionFiles {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

fn permission_launch_arguments(
    helper: &Path,
    files: &PermissionFiles,
    mode: PermissionMode,
) -> Vec<std::ffi::OsString> {
    [
        std::ffi::OsString::from("-n"),
        "-g".into(),
        "-W".into(),
        "--stdout".into(),
        files.stdout.as_os_str().to_owned(),
        "--stderr".into(),
        files.stderr.as_os_str().to_owned(),
        helper.as_os_str().to_owned(),
        "--args".into(),
        mode.argument().into(),
    ]
    .into()
}

fn fresh_bundle_permission(mode: PermissionMode) -> Result<PermissionReport, String> {
    let helper = trusted_helper_bundle()?;
    let files = PermissionFiles::create()?;
    // LaunchServices establishes the helper app as responsible for its own TCC request.
    // Directly spawning its executable would inherit this app/terminal's responsibility.
    let mut child = std::process::Command::new("/usr/bin/open")
        .args(permission_launch_arguments(&helper, &files, mode))
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if !status.success() {
                return Err(format!(
                    "Could not launch the helper's permission setup role: {status}"
                ));
            }
            break;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("The helper permission check timed out. Reinstall the updated native components and try again.".into());
        }
        std::thread::sleep(Duration::from_millis(30));
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&files.stdout)
        .map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if metadata.uid() != unsafe { libc::getuid() }
        || !metadata.is_file()
        || metadata.mode() & 0o077 != 0
    {
        return Err("The helper permission report has unexpected ownership or permissions.".into());
    }
    parse_permission_report(file, mode, unsafe { libc::getuid() })
}

fn permission_request_arguments(helper: &Path) -> Vec<std::ffi::OsString> {
    [
        std::ffi::OsString::from("-n"),
        "-g".into(),
        helper.as_os_str().to_owned(),
        "--args".into(),
        PermissionMode::Request.argument().into(),
    ]
    .into()
}

pub fn open_settings() -> Result<(), String> {
    let helper = trusted_helper_bundle()?;
    // Do not wait for the permission-request process or a human to answer an OS dialog.
    // The helper completes finishLaunching before it invokes IOHIDRequestAccess.
    let launched = std::process::Command::new("/usr/bin/open")
        .args(permission_request_arguments(&helper))
        .status()
        .map_err(|e| e.to_string())?;
    if !launched.success() {
        return Err(format!(
            "Could not launch Input Monitoring permission setup: {launched}"
        ));
    }
    let status = std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Could not open Input Monitoring settings: {status}"
        ))
    }
}

pub fn refresh_permissions() -> Result<NativeStatus, String> {
    let fresh = fresh_bundle_permission(PermissionMode::Status)?;
    let (mut current, old_pid) = exchange_with_pid(status_request())?;
    if !fresh.input_monitoring_granted {
        if !current.input_monitoring_granted {
            current.message = "Grant Input Monitoring to Ultimate Keyboards Remapper, then choose Check status. Terminal or main-app permission does not grant the helper access.".into();
        }
        return Ok(current);
    }
    if current.input_monitoring_granted {
        return Ok(current);
    }
    exchange(restart_request())?;
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(200));
        if let Ok((mut status, pid)) = exchange_with_pid(status_request()) {
            if pid != old_pid {
                if status.input_monitoring_granted {
                    status.message = "Input Monitoring is ready. The keyboard service restarted safely; apply your profile to enable remapping.".into();
                } else {
                    status.message = "The helper bundle is approved, but the restarted system service still reports no Input Monitoring access. Remapping remains disabled.".into();
                }
                return Ok(status);
            }
        }
    }
    Err("The keyboard service did not restart within 15 seconds. Remapping remains disabled; check status again.".into())
}

pub fn activate_driver() -> Result<String, String> {
    let manager = Path::new("/Applications/.Karabiner-VirtualHIDDevice-Manager.app");
    if !manager.is_dir() {
        return Err("Install the bundled keyboard service before activating its driver.".into());
    }
    // Only execute the unmodified, upstream-signed system-extension manager.
    let requirement = "=identifier \"org.pqrs.Karabiner-VirtualHIDDevice-Manager\" and anchor apple generic and certificate leaf[subject.OU] = \"G43BCU2T37\"";
    let verified = std::process::Command::new("/usr/bin/codesign")
        .args(["--verify", "--strict", "-R", requirement])
        .arg(manager)
        .output()
        .map_err(|e| e.to_string())?;
    if !verified.status.success() {
        return Err("The virtual-keyboard manager's signature is invalid. Reinstall it from the bundled installer.".into());
    }
    let mut child = std::process::Command::new(
        manager.join("Contents/MacOS/Karabiner-VirtualHIDDevice-Manager"),
    )
    .arg("activate")
    .spawn()
    .map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok("Driver activation requested. Follow macOS's driver-extension approval prompts, then refresh the service status.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unavailable_endpoint_distinguishes_missing_from_installed_service() {
        let missing = missing_service_status(false);
        assert_eq!(missing.state, "not_installed");
        assert!(!missing.helper_installed);
        let installed = missing_service_status(true);
        assert_eq!(installed.state, "error");
        assert!(installed.helper_installed);
        assert!(installed.message.contains("Repair keyboard service"));
        assert!(!installed.enabled);
        assert!(!installed.driver_ready);
        assert_eq!(installed.captured_devices, 0);
    }

    fn permission_report() -> Value {
        json!({
            "protocolVersion": 1,
            "helperBundleIdentifier": "com.ultimatekeyboards.remapper",
            "permissionApi": "IOHIDCheckAccess",
            "inputMonitoringGranted": true,
            "requestAttempted": false,
            "captureAttempted": false,
            "pid": 123,
            "uid": 501
        })
    }

    #[test]
    fn permission_report_rejects_wrong_role_identity_and_unsafe_results() {
        assert!(parse_permission_report(
            permission_report().to_string().as_bytes(),
            PermissionMode::Status,
            501
        )
        .is_ok());
        for (key, value) in [
            ("requestAttempted", json!(true)),
            ("captureAttempted", json!(true)),
            ("uid", json!(0)),
            ("pid", json!(0)),
            ("protocolVersion", json!(2)),
            ("permissionApi", json!("CGPreflightListenEventAccess")),
            ("helperBundleIdentifier", json!("other")),
        ] {
            let mut report = permission_report();
            report[key] = value;
            assert!(parse_permission_report(
                report.to_string().as_bytes(),
                PermissionMode::Status,
                501
            )
            .is_err());
        }
        assert!(parse_permission_report(
            permission_report().to_string().as_bytes(),
            PermissionMode::Status,
            502
        )
        .is_err());
        assert!(parse_permission_report(
            vec![b' '; PERMISSION_REPORT_LIMIT + 1].as_slice(),
            PermissionMode::Status,
            501
        )
        .is_err());
    }

    #[test]
    fn launchservices_permissions_use_fresh_bundle_and_private_output() {
        let files = PermissionFiles::create().unwrap();
        let directory = files.directory.clone();
        assert_eq!(
            std::fs::metadata(&files.stdout).unwrap().mode() & 0o777,
            0o600
        );
        assert_eq!(std::fs::metadata(&directory).unwrap().mode() & 0o700, 0o700);
        let args =
            permission_launch_arguments(Path::new(HELPER_BUNDLE), &files, PermissionMode::Status);
        assert_eq!(args[0], "-n");
        assert!(args.contains(&std::ffi::OsString::from(HELPER_BUNDLE)));
        assert_eq!(args.last().unwrap(), "--permission-status");
        assert!(!args
            .iter()
            .any(|a| a.to_string_lossy().contains("Contents/MacOS")));
        drop(files);
        assert!(!directory.exists());
    }

    #[test]
    fn permission_request_does_not_wait_for_human_dialog_or_report() {
        let args = permission_request_arguments(Path::new(HELPER_BUNDLE));
        assert_eq!(args.last().unwrap(), "--request-permission");
        assert!(!args.contains(&std::ffi::OsString::from("-W")));
        assert!(!args.contains(&std::ffi::OsString::from("--stdout")));
        assert!(args.contains(&std::ffi::OsString::from(HELPER_BUNDLE)));
    }
}
