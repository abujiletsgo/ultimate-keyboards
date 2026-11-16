//! Windows named-pipe transport, per-user sign-in startup registration
//! (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`), and service lifecycle.
use super::transport::{
    apply_request, check_windows_build, disable_request, exchange_with_transport,
    format_windows_run_command, missing_windows_service_status, read_response_line,
    restart_request, status_request, with_windows_status_notes, windows_service_candidates,
    Transport, TransportKind, TIMEOUT, WINDOWS_ELEVATED_NOTE, WINDOWS_NO_DRIVER,
    WINDOWS_NO_INPUT_MONITORING, WINDOWS_PIPE, WINDOWS_RUN_SUBKEY, WINDOWS_RUN_VALUE,
    WINDOWS_SERVICE_EXE,
};
use super::NativeStatus;
use core::ffi::c_void;
use serde_json::Value;
use std::io::{self, Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

type Handle = *mut c_void;
type Hkey = *mut c_void;

const INVALID_HANDLE_VALUE: Handle = (-1isize) as Handle;
// HKEY_CURRENT_USER in winreg.h is ((HKEY)(ULONG_PTR)((LONG)0x80000001)), sign-extended on 64-bit.
const HKEY_CURRENT_USER: Hkey = (0x8000_0001u32 as i32 as isize) as Hkey;

const GENERIC_READ: u32 = 0x8000_0000;
const GENERIC_WRITE: u32 = 0x4000_0000;
const OPEN_EXISTING: u32 = 3;
const FILE_FLAG_OVERLAPPED: u32 = 0x4000_0000;
const WAIT_OBJECT_0: u32 = 0;

const ERROR_SUCCESS: u32 = 0;
const ERROR_FILE_NOT_FOUND: u32 = 2;
const ERROR_ACCESS_DENIED: u32 = 5;
const ERROR_BROKEN_PIPE: u32 = 109;
const ERROR_PIPE_BUSY: u32 = 231;
const ERROR_PIPE_NOT_CONNECTED: u32 = 233;
const ERROR_IO_PENDING: u32 = 997;

const KEY_QUERY_VALUE: u32 = 0x0001;
const KEY_SET_VALUE: u32 = 0x0002;
const REG_SZ: u32 = 1;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const AUTO_START_COOLDOWN: Duration = Duration::from_secs(30);

#[repr(C)]
struct OsVersionInfoW {
    dw_os_version_info_size: u32,
    dw_major_version: u32,
    dw_minor_version: u32,
    dw_build_number: u32,
    dw_platform_id: u32,
    sz_csd_version: [u16; 128],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct OverlappedOffsetParts {
    offset: u32,
    offset_high: u32,
}

#[repr(C)]
union OverlappedOffset {
    parts: OverlappedOffsetParts,
    pointer: *mut c_void,
}

#[repr(C)]
struct Overlapped {
    internal: usize,
    internal_high: usize,
    u: OverlappedOffset,
    h_event: Handle,
}

#[link(name = "ntdll")]
extern "system" {
    fn RtlGetVersion(info: *mut OsVersionInfoW) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    fn CreateFileW(
        lp_file_name: *const u16,
        dw_desired_access: u32,
        dw_share_mode: u32,
        lp_security_attributes: *const c_void,
        dw_creation_disposition: u32,
        dw_flags_and_attributes: u32,
        h_template_file: Handle,
    ) -> Handle;
    fn WaitNamedPipeW(lp_named_pipe_name: *const u16, n_time_out: u32) -> i32;
    fn GetNamedPipeServerProcessId(pipe: Handle, server_process_id: *mut u32) -> i32;
    fn CreateEventW(
        lp_event_attributes: *const c_void,
        b_manual_reset: i32,
        b_initial_state: i32,
        lp_name: *const u16,
    ) -> Handle;
    fn ReadFile(
        h_file: Handle,
        lp_buffer: *mut u8,
        n_number_of_bytes_to_read: u32,
        lp_number_of_bytes_read: *mut u32,
        lp_overlapped: *mut Overlapped,
    ) -> i32;
    fn WriteFile(
        h_file: Handle,
        lp_buffer: *const u8,
        n_number_of_bytes_to_write: u32,
        lp_number_of_bytes_written: *mut u32,
        lp_overlapped: *mut Overlapped,
    ) -> i32;
    fn WaitForSingleObject(h_handle: Handle, dw_milliseconds: u32) -> u32;
    fn CancelIoEx(h_file: Handle, lp_overlapped: *const Overlapped) -> i32;
    fn GetOverlappedResult(
        h_file: Handle,
        lp_overlapped: *const Overlapped,
        lp_number_of_bytes_transferred: *mut u32,
        b_wait: i32,
    ) -> i32;
    fn CloseHandle(h_object: Handle) -> i32;
    fn GetLastError() -> u32;
}

#[link(name = "advapi32")]
extern "system" {
    fn RegCreateKeyExW(
        h_key: Hkey,
        lp_sub_key: *const u16,
        reserved: u32,
        lp_class: *mut u16,
        dw_options: u32,
        sam_desired: u32,
        lp_security_attributes: *const c_void,
        phk_result: *mut Hkey,
        lpdw_disposition: *mut u32,
    ) -> u32;
    fn RegOpenKeyExW(
        h_key: Hkey,
        lp_sub_key: *const u16,
        ul_options: u32,
        sam_desired: u32,
        phk_result: *mut Hkey,
    ) -> u32;
    fn RegSetValueExW(
        h_key: Hkey,
        lp_value_name: *const u16,
        reserved: u32,
        dw_type: u32,
        lp_data: *const u8,
        cb_data: u32,
    ) -> u32;
    fn RegQueryValueExW(
        h_key: Hkey,
        lp_value_name: *const u16,
        lp_reserved: *const u32,
        lp_type: *mut u32,
        lp_data: *mut u8,
        lpcb_data: *mut u32,
    ) -> u32;
    fn RegCloseKey(h_key: Hkey) -> u32;
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

fn windows_build() -> u32 {
    let mut info: OsVersionInfoW = unsafe { std::mem::zeroed() };
    info.dw_os_version_info_size = std::mem::size_of::<OsVersionInfoW>() as u32;
    unsafe { RtlGetVersion(&mut info) };
    info.dw_build_number
}

enum PipeOpenError {
    NotOpen,
    Failed(String),
}

struct PipeClient {
    pipe: Handle,
    event: Handle,
    deadline: Instant,
}

impl PipeClient {
    fn connect(endpoint: &str, timeout: Duration) -> Result<Self, PipeOpenError> {
        let deadline = Instant::now() + timeout;
        let name = wide(endpoint);
        let pipe = loop {
            let handle = unsafe {
                CreateFileW(
                    name.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    FILE_FLAG_OVERLAPPED,
                     std::ptr::null_mut(),
                )
            };
            if handle != INVALID_HANDLE_VALUE {
                break handle;
            }
            let error = unsafe { GetLastError() };
            match error {
                ERROR_FILE_NOT_FOUND => return Err(PipeOpenError::NotOpen),
                ERROR_PIPE_BUSY => {
                    let left = deadline.saturating_duration_since(Instant::now());
                    if left.is_zero() {
                        return Err(PipeOpenError::Failed(
                            "The Windows keyboard service is busy. Try again in a moment.".into(),
                        ));
                    }
                    let wait_ms = left.as_millis().min(250) as u32;
                    unsafe { WaitNamedPipeW(name.as_ptr(), wait_ms.max(1)) };
                }
                ERROR_ACCESS_DENIED => {
                    return Err(PipeOpenError::Failed(
                        "Another Windows user on this PC already has the keyboard service open. Sign out of the other account or close Ultimate Keyboards there, then try again.".into(),
                    ))
                }
                other => {
                    return Err(PipeOpenError::Failed(format!(
                        "Could not connect to the Windows keyboard service (error {other})."
                    )))
                }
            }
        };
        let event = unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) };
        if event.is_null() {
            unsafe { CloseHandle(pipe) };
            return Err(PipeOpenError::Failed(
                "Could not prepare the Windows pipe event.".into(),
            ));
        }
        Ok(Self {
            pipe,
            event,
            deadline,
        })
    }

    fn server_pid(&self) -> Result<i32, String> {
        let mut pid = 0u32;
        let ok = unsafe { GetNamedPipeServerProcessId(self.pipe, &mut pid) };
        if ok == 0 || pid == 0 {
            return Err("Could not identify the Windows keyboard service process.".into());
        }
        Ok(pid as i32)
    }

    fn wait(&self, overlapped: &mut Overlapped, pending: bool) -> io::Result<u32> {
        let mut transferred = 0u32;
        if pending {
            let left_ms = self
                .deadline
                .saturating_duration_since(Instant::now())
                .as_millis()
                .min(u32::MAX as u128) as u32;
            if unsafe { WaitForSingleObject(self.event, left_ms) } != WAIT_OBJECT_0 {
                unsafe {
                    CancelIoEx(self.pipe, overlapped);
                    // Wait for cancellation so the kernel releases stack buffers before return.
                    GetOverlappedResult(self.pipe, overlapped, &mut transferred, 1);
                }
                return Err(io::ErrorKind::TimedOut.into());
            }
        }
        if unsafe { GetOverlappedResult(self.pipe, overlapped, &mut transferred, 0) } == 0 {
            return match unsafe { GetLastError() } {
                ERROR_BROKEN_PIPE | ERROR_PIPE_NOT_CONNECTED => Ok(0),
                code => Err(io::Error::from_raw_os_error(code as i32)),
            };
        }
        Ok(transferred)
    }
}

impl Read for PipeClient {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let mut ov: Overlapped = unsafe { std::mem::zeroed() };
        ov.h_event = self.event;
        let to_read = buf.len().min(u32::MAX as usize) as u32;
        let ok = unsafe {
            ReadFile(
                self.pipe,
                buf.as_mut_ptr(),
                to_read,
                std::ptr::null_mut(),
                &mut ov,
            )
        };
        let error = unsafe { GetLastError() };
        let pending = ok == 0 && error == ERROR_IO_PENDING;
        if ok == 0 && !pending {
            return if matches!(error, ERROR_BROKEN_PIPE | ERROR_PIPE_NOT_CONNECTED) {
                Ok(0)
            } else {
                Err(io::Error::from_raw_os_error(error as i32))
            };
        }
        self.wait(&mut ov, pending).map(|n| n as usize)
    }
}

impl Write for PipeClient {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut ov: Overlapped = unsafe { std::mem::zeroed() };
        ov.h_event = self.event;
        let to_write = buf.len().min(u32::MAX as usize) as u32;
        let ok = unsafe {
            WriteFile(
                self.pipe,
                buf.as_ptr(),
                to_write,
                std::ptr::null_mut(),
                &mut ov,
            )
        };
        let error = unsafe { GetLastError() };
        let pending = ok == 0 && error == ERROR_IO_PENDING;
        if ok == 0 && !pending {
            return Err(io::Error::from_raw_os_error(error as i32));
        }
        self.wait(&mut ov, pending).map(|n| n as usize)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Drop for PipeClient {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.event);
            CloseHandle(self.pipe);
        }
    }
}

pub struct NamedPipeTransport;

impl Transport for NamedPipeTransport {
    fn kind(&self) -> TransportKind {
        TransportKind::NamedPipe
    }

    fn endpoint(&self) -> &str {
        WINDOWS_PIPE
    }

    fn transact(&self, framed_request: &[u8]) -> Result<(Vec<u8>, i32), String> {
        let mut client = match PipeClient::connect(self.endpoint(), TIMEOUT) {
            Ok(client) => client,
            Err(PipeOpenError::NotOpen) => {
                return Err("Keyboard service is unavailable: pipe not open.".into())
            }
            Err(PipeOpenError::Failed(msg)) => return Err(msg),
        };
        let pid = client.server_pid()?;
        client
            .write_all(framed_request)
            .map_err(|e| format!("Could not send the keyboard profile: {e}"))?;
        let line = read_response_line(&mut client)?;
        Ok((line, pid))
    }
}

fn pipe_is_absent() -> bool {
    matches!(
        PipeClient::connect(WINDOWS_PIPE, Duration::from_millis(50)),
        Err(PipeOpenError::NotOpen)
    )
}

fn query_login_startup() -> Option<String> {
    let subkey = wide(WINDOWS_RUN_SUBKEY);
    let value_name = wide(WINDOWS_RUN_VALUE);
    let mut hkey: Hkey = std::ptr::null_mut();
    if unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_QUERY_VALUE, &mut hkey) }
        != ERROR_SUCCESS
    {
        return None;
    }
    let mut kind = 0u32;
    let mut bytes = 0u32;
    let status = unsafe {
        RegQueryValueExW(
            hkey,
            value_name.as_ptr(),
            std::ptr::null(),
            &mut kind,
            std::ptr::null_mut(),
            &mut bytes,
        )
    };
    if status != ERROR_SUCCESS || kind != REG_SZ || bytes < 2 || bytes % 2 != 0 {
        unsafe { RegCloseKey(hkey) };
        return None;
    }
    let mut utf16 = vec![0u16; (bytes as usize) / 2];
    let status = unsafe {
        RegQueryValueExW(
            hkey,
            value_name.as_ptr(),
            std::ptr::null(),
            &mut kind,
            utf16.as_mut_ptr().cast(),
            &mut bytes,
        )
    };
    unsafe { RegCloseKey(hkey) };
    if status != ERROR_SUCCESS || kind != REG_SZ {
        return None;
    }
    while utf16.last() == Some(&0) {
        utf16.pop();
    }
    String::from_utf16(&utf16).ok()
}

/// Registers the per-user service under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
/// so Windows starts it at sign-in without administrator rights.
fn ensure_login_startup(exe: &Path) -> Result<(), String> {
    let command = format_windows_run_command(exe)?;
    if query_login_startup().as_deref() == Some(command.as_str()) {
        return Ok(());
    }
    let subkey = wide(WINDOWS_RUN_SUBKEY);
    let value_name = wide(WINDOWS_RUN_VALUE);
    let data = wide(&command);
    let mut hkey: Hkey = std::ptr::null_mut();
    let open_code = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            std::ptr::null_mut(),
            0,
            KEY_SET_VALUE | KEY_QUERY_VALUE,
            std::ptr::null(),
            &mut hkey,
            std::ptr::null_mut(),
        )
    };
    if open_code != ERROR_SUCCESS {
        return Err(format!(
            "Could not open the Windows sign-in startup key (error {open_code})."
        ));
    }
    let set_code = unsafe {
        RegSetValueExW(
            hkey,
            value_name.as_ptr(),
            0,
            REG_SZ,
            data.as_ptr().cast(),
            (data.len() * 2) as u32,
        )
    };
    unsafe { RegCloseKey(hkey) };
    if set_code != ERROR_SUCCESS {
        return Err(format!(
            "Could not register the keyboard service to start at sign-in (error {set_code})."
        ));
    }
    Ok(())
}

fn find_service_binary(resource_dir: Option<&Path>) -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok();
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    for candidate in windows_service_candidates(
        exe_path.as_deref(),
        resource_dir,
        local_app_data.as_deref(),
        std::env::consts::ARCH,
    ) {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    #[cfg(debug_assertions)]
    if let Some(exe) = exe_path.as_deref() {
        for ancestor in exe.ancestors().take(6) {
            for profile in ["release", "debug"] {
                let dev = ancestor
                    .join("native")
                    .join("service-win")
                    .join("target")
                    .join(profile)
                    .join(WINDOWS_SERVICE_EXE);
                if dev.is_file() {
                    return Some(dev);
                }
            }
        }
    }
    None
}

fn spawn_service(exe: &Path) -> Result<(), String> {
    Command::new(exe)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not start the Windows keyboard service: {e}"))
}

static LAST_PASSIVE_START: Mutex<Option<Instant>> = Mutex::new(None);
static LOGIN_SYNCED: std::sync::Once = std::sync::Once::new();

fn passive_start_allowed() -> bool {
    let mut guard = LAST_PASSIVE_START.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_some_and(|t| t.elapsed() < AUTO_START_COOLDOWN) {
        return false;
    }
    *guard = Some(Instant::now());
    true
}

fn start_and_wait(exe: &Path, wait_budget: Duration) -> Result<(NativeStatus, i32), String> {
    spawn_service(exe)?;
    let deadline = Instant::now() + wait_budget;
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(80));
        if let Ok(result) = exchange_with_transport(&NamedPipeTransport, status_request()) {
            return Ok(result);
        }
    }
    Err("Started the Windows keyboard service, but its named pipe did not answer in time.".into())
}

fn ensure_service_running(
    resource_dir: Option<&Path>,
    explicit_action: bool,
) -> Result<(NativeStatus, i32), String> {
    if let Ok(existing) = exchange_with_transport(&NamedPipeTransport, status_request()) {
        if explicit_action {
            if let Some(exe) = find_service_binary(resource_dir) {
                let _ = ensure_login_startup(&exe);
            }
        } else {
            LOGIN_SYNCED.call_once(|| {
                if let Some(exe) = find_service_binary(resource_dir) {
                    let _ = ensure_login_startup(&exe);
                }
            });
        }
        return Ok(existing);
    }
    // Surface fast-user-switching / access errors directly rather than spawning a second instance.
    if let Err(PipeOpenError::Failed(msg)) =
        PipeClient::connect(WINDOWS_PIPE, Duration::from_millis(100))
    {
        return Err(msg);
    }
    let Some(exe) = find_service_binary(resource_dir) else {
        return Err(missing_windows_service_status(false).message);
    };
    ensure_login_startup(&exe)?;
    if !explicit_action && !passive_start_allowed() {
        return Err(missing_windows_service_status(true).message);
    }
    let budget = if explicit_action {
        Duration::from_secs(5)
    } else {
        Duration::from_secs(2)
    };
    start_and_wait(&exe, budget)
}

pub fn stop_on_exit() {
    if !pipe_is_absent() {
        let _ = exchange_with_transport(&NamedPipeTransport, disable_request());
    }
}

pub fn status() -> NativeStatus {
    let helper_present = find_service_binary(None).is_some();
    if let Err(msg) = check_windows_build(windows_build()) {
        return NativeStatus {
            state: "driver_unavailable".into(),
            message: msg,
            driver_ready: false,
            input_monitoring_granted: true,
            helper_installed: helper_present,
            enabled: false,
            captured_devices: 0,
            profile_title: None,
            protocol_version: 1,
        };
    }
    match ensure_service_running(None, false) {
        Ok((status, _)) => with_windows_status_notes(status),
        Err(_) if !helper_present && pipe_is_absent() => missing_windows_service_status(false),
        Err(err) => NativeStatus {
            state: "error".into(),
            message: err,
            driver_ready: false,
            input_monitoring_granted: true,
            helper_installed: true,
            enabled: false,
            captured_devices: 0,
            profile_title: None,
            protocol_version: 1,
        },
    }
}

pub fn apply(profile: Value, enable: bool) -> Result<NativeStatus, String> {
    check_windows_build(windows_build())?;
    ensure_service_running(None, true)?;
    let (status, _) = exchange_with_transport(&NamedPipeTransport, apply_request(profile, enable))?;
    Ok(with_windows_status_notes(status))
}

pub fn disable() -> Result<NativeStatus, String> {
    if pipe_is_absent() {
        let helper_present = find_service_binary(None).is_some();
        if !helper_present {
            return Ok(missing_windows_service_status(false));
        }
        return Ok(with_windows_status_notes(NativeStatus {
            state: "stopped".into(),
            message: "Remapping is off. Your keyboard works as normal.".into(),
            driver_ready: false,
            input_monitoring_granted: true,
            helper_installed: true,
            enabled: false,
            captured_devices: 0,
            profile_title: None,
            protocol_version: 1,
        }));
    }
    let (status, _) = exchange_with_transport(&NamedPipeTransport, disable_request())?;
    Ok(with_windows_status_notes(status))
}

pub fn install(app: tauri::AppHandle) -> Result<String, String> {
    check_windows_build(windows_build())?;
    let resource_dir = app.path().resource_dir().ok();
    let exe = find_service_binary(resource_dir.as_deref()).ok_or_else(|| {
        "This copy is missing the bundled Windows keyboard service (ultimate-keyboards-remapper-win.exe). Reinstall Ultimate Keyboards.".to_string()
    })?;
    ensure_login_startup(&exe)?;
    ensure_service_running(resource_dir.as_deref(), true)?;
    Ok(format!(
        "The Windows keyboard service is running and set to start automatically when you sign in. No driver or Input Monitoring step is needed. {WINDOWS_ELEVATED_NOTE}"
    ))
}

pub fn open_settings() -> Result<(), String> {
    Err(WINDOWS_NO_INPUT_MONITORING.into())
}

pub fn refresh_permissions() -> Result<NativeStatus, String> {
    check_windows_build(windows_build())?;
    let exe = find_service_binary(None);
    if let Some(path) = exe.as_deref() {
        ensure_login_startup(path)?;
    }
    let (current, old_pid) = ensure_service_running(None, true)?;
    if !matches!(current.state.as_str(), "error" | "driver_unavailable") {
        return Ok(with_windows_status_notes(current));
    }
    let Some(exe_path) = exe else {
        return Ok(with_windows_status_notes(current));
    };
    let _ = exchange_with_transport(&NamedPipeTransport, restart_request());
    // Wait for `service-win`'s 300 ms exit delay before spawning the replacement instance.
    let exit_deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < exit_deadline {
        if pipe_is_absent() {
            break;
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    let (mut restarted, new_pid) = start_and_wait(&exe_path, Duration::from_secs(5))?;
    if new_pid != old_pid {
        restarted.message =
            "The Windows keyboard service restarted safely; apply your rules when ready.".into();
    }
    Ok(with_windows_status_notes(restarted))
}

pub fn activate_driver() -> Result<String, String> {
    Err(WINDOWS_NO_DRIVER.into())
}
