//! Privileged native remapper. The synthetic mode cannot construct a hardware backend.
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    os::unix::{
        fs::{FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt},
        io::AsRawFd,
        net::{UnixListener, UnixStream},
    },
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc::{self, SyncSender},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use ultimate_keyboards_engine::{Engine, KeyEvent, OutputEvent, Profile};
const SOCKET: &str = "/var/run/com.ultimatekeyboards.remapper.sock";
const STATE_DIR: &str = "/Library/Application Support/com.ultimatekeyboards.app/Native/state";
const MAX_MESSAGE: usize = 1024 * 1024;
const LEASE: Duration = Duration::from_secs(15);
const TIMEOUT: Duration = Duration::from_secs(2);
const MAX_EVENT_WAIT_MS: u64 = 3;
// Bound IPC/safety latency while waking immediately on input or an engine deadline.
fn event_wait_ms(now_ms: u64, deadline_ms: Option<u64>) -> u64 {
    deadline_ms.map_or(MAX_EVENT_WAIT_MS, |deadline| {
        deadline.saturating_sub(now_ms).min(MAX_EVENT_WAIT_MS)
    })
}
static QUIT: AtomicBool = AtomicBool::new(false);
extern "C" fn signal_stop(_: libc::c_int) {
    QUIT.store(true, Ordering::Relaxed);
}

#[derive(Default, Clone, Copy)]
#[repr(C)]
struct RawEvent {
    device: u64,
    page: u16,
    usage: u16,
    down: bool,
    at_ms: u64,
}
#[cfg(target_os = "macos")]
mod native {
    use super::RawEvent;
    extern "C" {
        pub fn uk_permission() -> bool;
        pub fn uk_now_ms() -> u64;
        pub fn uk_request_permission() -> bool;
        pub fn uk_prepare_user_setup() -> bool;
        pub fn uk_devices_json() -> *const libc::c_char;
        pub fn uk_console_uid() -> u32;
        pub fn uk_authorize(fd: i32, team: *const libc::c_char) -> bool;
        pub fn uk_driver_present() -> bool;
        pub fn uk_begin() -> bool;
        pub fn uk_ready() -> bool;
        pub fn uk_fault() -> bool;
        pub fn uk_pump(wait_ms: u64);
        pub fn uk_capture() -> i32;
        pub fn uk_event(event: *mut RawEvent) -> bool;
        pub fn uk_post(page: u16, usage: u16, down: bool) -> bool;
        pub fn uk_end();
        pub fn uk_bridge_self_test() -> bool;
    }
}
#[cfg(not(target_os = "macos"))]
mod native {
    use super::RawEvent;
    pub unsafe fn uk_permission() -> bool {
        false
    }
    pub unsafe fn uk_now_ms() -> u64 {
        0
    }
    pub unsafe fn uk_request_permission() -> bool {
        false
    }
    pub unsafe fn uk_prepare_user_setup() -> bool {
        false
    }
    pub unsafe fn uk_devices_json() -> *const libc::c_char {
        c"{\"readOnly\":true,\"eligibleBuiltInCount\":0,\"error\":\"macOS is required\",\"devices\":[]}".as_ptr()
    }
    pub unsafe fn uk_console_uid() -> u32 {
        u32::MAX
    }
    pub unsafe fn uk_authorize(_: i32, _: *const libc::c_char) -> bool {
        false
    }
    pub unsafe fn uk_driver_present() -> bool {
        false
    }
    pub unsafe fn uk_begin() -> bool {
        false
    }
    pub unsafe fn uk_ready() -> bool {
        false
    }
    pub unsafe fn uk_fault() -> bool {
        true
    }
    pub unsafe fn uk_pump(_: u64) {}
    pub unsafe fn uk_capture() -> i32 {
        -1
    }
    pub unsafe fn uk_event(_: *mut RawEvent) -> bool {
        false
    }
    pub unsafe fn uk_post(_: u16, _: u16, _: bool) -> bool {
        false
    }
    pub unsafe fn uk_end() {}
    pub unsafe fn uk_bridge_self_test() -> bool {
        true
    }
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    version: u32,
    command: String,
    profile: Option<Profile>,
    enable: Option<bool>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeStatus {
    state: String,
    message: String,
    driver_ready: bool,
    input_monitoring_granted: bool,
    helper_installed: bool,
    enabled: bool,
    captured_devices: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile_title: Option<String>,
    protocol_version: u32,
}
#[derive(Serialize)]
struct Response {
    ok: bool,
    status: NativeStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Saved {
    version: u32,
    profile: Profile,
    enabled: bool,
    console_uid: u32,
}
struct Work {
    request: Result<Request, String>,
    authorized: bool,
    console_uid: u32,
    reply: SyncSender<Response>,
}

fn parse_request(bytes: &[u8]) -> Result<Request, String> {
    if bytes.len() > MAX_MESSAGE {
        return Err("IPC message exceeds 1 MiB".into());
    }
    let request: Request =
        serde_json::from_slice(bytes).map_err(|e| format!("Invalid request: {e}"))?;
    if request.version != 1 {
        return Err("Unsupported IPC version".into());
    }
    if !matches!(
        request.command.as_str(),
        "status" | "apply" | "disable" | "restart"
    ) {
        return Err("Unknown command".into());
    }
    if request.command != "apply" && (request.profile.is_some() || request.enable.is_some()) {
        return Err("Only apply accepts profile/enable".into());
    }
    Ok(request)
}
fn read_request(stream: &UnixStream) -> Result<Request, String> {
    let mut reader = BufReader::new(stream);
    let mut bytes = Vec::new();
    loop {
        let chunk = reader.fill_buf().map_err(|e| e.to_string())?;
        if chunk.is_empty() {
            return Err("Expected newline-terminated request".into());
        }
        let end = chunk.iter().position(|&b| b == b'\n');
        let n = end.map_or(chunk.len(), |n| n + 1);
        if bytes.len() + n > MAX_MESSAGE {
            return Err("IPC message exceeds 1 MiB".into());
        }
        bytes.extend_from_slice(&chunk[..n]);
        reader.consume(n);
        if end.is_some() {
            return parse_request(&bytes);
        }
    }
}
fn signed_peer(stream: &UnixStream) -> bool {
    let Some(team) = option_env!("UK_TEAM_ID") else {
        return false;
    };
    let Ok(team) = std::ffi::CString::new(team) else {
        return false;
    };
    unsafe { native::uk_authorize(stream.as_raw_fd(), team.as_ptr()) }
}
fn authenticated_session_matches(signed: bool, before: u32, after: u32) -> bool {
    signed && before != 0 && before != u32::MAX && before == after
}
fn serve(listener: UnixListener, tx: SyncSender<Work>, synthetic: bool) {
    let count = Arc::new(AtomicUsize::new(0));
    for incoming in listener.incoming() {
        let Ok(mut stream) = incoming else {
            continue;
        };
        if count.load(Ordering::SeqCst) >= 16 {
            continue;
        }
        count.fetch_add(1, Ordering::SeqCst);
        let count = count.clone();
        let tx = tx.clone();
        thread::spawn(move || {
            let _ = stream.set_read_timeout(Some(TIMEOUT));
            let _ = stream.set_write_timeout(Some(TIMEOUT));
            // Test sockets are owned by their invoking user. They cannot access native output.
            let console_uid = unsafe { native::uk_console_uid() };
            let authorized = synthetic
                || authenticated_session_matches(signed_peer(&stream), console_uid, unsafe {
                    native::uk_console_uid()
                });
            let request = read_request(&stream);
            let (reply, rx) = mpsc::sync_channel(1);
            if tx
                .try_send(Work {
                    request,
                    authorized,
                    console_uid,
                    reply,
                })
                .is_ok()
            {
                if let Ok(response) = rx.recv_timeout(TIMEOUT) {
                    if let Ok(mut json) = serde_json::to_vec(&response) {
                        json.push(b'\n');
                        let _ = stream.write_all(&json);
                    }
                }
            }
            count.fetch_sub(1, Ordering::SeqCst);
        });
    }
}

/// Counts output ownership across device-local engines; duplicate releases cannot release another keyboard.
#[derive(Default)]
struct Outputs {
    held: BTreeMap<u64, BTreeSet<(u16, u16)>>,
    refs: BTreeMap<(u16, u16), usize>,
}
impl Outputs {
    fn change(&mut self, device: u64, page: u16, usage: u16, down: bool) -> bool {
        let key = (page, usage);
        let held = self.held.entry(device).or_default();
        if down {
            if !held.insert(key) {
                return false;
            }
            let n = self.refs.entry(key).or_default();
            *n += 1;
            *n == 1
        } else {
            if !held.remove(&key) {
                return false;
            }
            let Some(n) = self.refs.get_mut(&key) else {
                return false;
            };
            *n -= 1;
            if *n == 0 {
                self.refs.remove(&key);
                true
            } else {
                false
            }
        }
    }
}
struct Service {
    synthetic: bool,
    profile: Option<Profile>,
    engines: BTreeMap<u64, Engine>,
    outputs: Outputs,
    state: String,
    message: String,
    enabled: bool,
    captured: usize,
    started: bool,
    console_uid: u32,
    lease: Option<Instant>,
    armed_resume: bool,
    restart_at: Option<Instant>,
}
impl Service {
    fn new(synthetic: bool) -> Self {
        Self {
            synthetic,
            profile: None,
            engines: BTreeMap::new(),
            outputs: Outputs::default(),
            state: "stopped".into(),
            message: "Remapping is disabled; physical keyboards remain available.".into(),
            enabled: false,
            captured: 0,
            started: false,
            console_uid: unsafe { native::uk_console_uid() },
            lease: None,
            armed_resume: false,
            restart_at: None,
        }
    }
    fn status(&self) -> NativeStatus {
        let permission = !self.synthetic && unsafe { native::uk_permission() };
        NativeStatus {
            state: self.state.clone(),
            message: self.message.clone(),
            driver_ready: self.started && unsafe { native::uk_ready() },
            input_monitoring_granted: permission,
            helper_installed: true,
            enabled: self.enabled,
            captured_devices: self.captured,
            profile_title: self.profile.as_ref().map(|p| p.title.clone()),
            protocol_version: 1,
        }
    }
    fn stop(&mut self, state: &str, message: &str) {
        // Reset each state machine before tearing down the virtual device. The bridge emits all-up.
        for engine in self.engines.values_mut() {
            let _ = engine.reset();
        }
        if self.started && !self.synthetic {
            unsafe {
                native::uk_end();
            }
        }
        self.started = false;
        self.enabled = false;
        self.captured = 0;
        self.armed_resume = false;
        self.engines.clear();
        self.outputs = Outputs::default();
        self.state = state.into();
        self.message = message.into();
    }
    fn start(&mut self) -> Result<(), String> {
        if self.synthetic {
            return Err(
                "Test mode never captures devices or posts HID output; enable=true is forbidden"
                    .into(),
            );
        }
        if self.profile.is_none() {
            return Err("Apply a validated profile before enabling".into());
        }
        if self.lease.is_none_or(|t| t.elapsed() > LEASE) {
            return Err("A trusted foreground session heartbeat is required".into());
        }
        if unsafe { libc::geteuid() } != 0 {
            return Err("The production helper must run as root".into());
        }
        if !unsafe { native::uk_permission() } {
            self.stop("needs_permission", "Grant Input Monitoring to Ultimate Keyboards Remapper in System Settings, then enable again.");
            return Err(self.message.clone());
        }
        if !unsafe { native::uk_driver_present() } {
            self.stop("driver_unavailable", "The signed virtual HID service is unavailable. Install and approve the bundled driver, then enable again.");
            return Err(self.message.clone());
        }
        let enabling_console = unsafe { native::uk_console_uid() };
        if !unsafe { native::uk_begin() } {
            self.stop(
                "driver_unavailable",
                "Could not connect to the virtual HID service; no keyboard was captured.",
            );
            return Err(self.message.clone());
        }
        self.started = true;
        let deadline = Instant::now() + Duration::from_millis(1200);
        while Instant::now() < deadline
            && !unsafe { native::uk_ready() }
            && !unsafe { native::uk_fault() }
        {
            thread::sleep(Duration::from_millis(5));
        }
        if !unsafe { native::uk_ready() } {
            self.stop(
                "driver_unavailable",
                "Virtual HID handshake did not become ready; no keyboard was captured.",
            );
            return Err(self.message.clone());
        }
        if enabling_console != unsafe { native::uk_console_uid() } {
            self.stop(
                "stopped",
                "Console session changed during enable; no keyboard was captured.",
            );
            return Err(self.message.clone());
        }
        let count = unsafe { native::uk_capture() };
        if count <= 0 {
            self.stop("error", if count == 0 { "No supported built-in keyboard is available. External/split and unsupported mixed-input devices remain untouched." } else { "Keyboard capture failed; all captured devices were released." });
            return Err(self.message.clone());
        }
        if enabling_console != unsafe { native::uk_console_uid() } {
            self.stop(
                "stopped",
                "Console session changed during capture; physical keyboards were released.",
            );
            return Err(self.message.clone());
        }
        self.enabled = true;
        self.captured = count as usize;
        self.state = "running".into();
        self.console_uid = enabling_console;
        self.message = "Native remapping is active on the built-in keyboard. Consumer/Fn inputs pass through unchanged.".into();
        Ok(())
    }
    fn handle(&mut self, request: Result<Request, String>, authorized: bool) -> Response {
        let result = request.and_then(|r| self.request(r, authorized));
        Response {
            ok: result.is_ok(),
            status: self.status(),
            error: result.err(),
        }
    }
    fn request(&mut self, r: Request, authorized: bool) -> Result<(), String> {
        if r.command != "status" && !authorized {
            return Err(
                "Mutation requires the signed Ultimate Keyboards app in the active console session"
                    .into(),
            );
        }
        if authorized {
            self.lease = Some(Instant::now());
            if r.command == "status" && self.armed_resume {
                self.armed_resume = false;
                if self.console_uid == unsafe { native::uk_console_uid() } {
                    self.start()?;
                }
            }
        }
        if self.restart_at.is_some() && r.command != "status" {
            return Err("Keyboard service is restarting; wait for a fresh status.".into());
        }
        match r.command.as_str() {
            "status" => Ok(()),
            "restart" => {
                self.stop("stopped", "Keyboard service is restarting to refresh permission state. Remapping remains disabled.");
                self.persist()?;
                self.restart_at = Some(Instant::now() + Duration::from_millis(300));
                Ok(())
            }
            "disable" => {
                self.stop(
                    "stopped",
                    "Remapping disabled; physical keyboards released.",
                );
                self.persist()
            }
            "apply" => {
                if self.synthetic && r.enable == Some(true) {
                    return Err("Test mode rejects enable=true and cannot capture devices or post HID output".into());
                }
                let profile = r
                    .profile
                    .ok_or("apply requires a complete profile snapshot")?;
                Engine::new(profile.clone()).map_err(|e| e.to_string())?;
                self.stop(
                    "stopped",
                    "Validated profile applied; remapping is disabled.",
                );
                self.profile = Some(profile);
                if r.enable == Some(true) {
                    if let Err(e) = self.start() {
                        let _ = self.persist();
                        return Err(e);
                    }
                }
                if let Err(e) = self.persist() {
                    self.stop(
                        "error",
                        "Could not persist configuration; remapping was released.",
                    );
                    return Err(e);
                }
                Ok(())
            }
            _ => Err("Unknown command".into()),
        }
    }
    fn persist(&self) -> Result<(), String> {
        if self.synthetic {
            return Ok(());
        }
        let Some(profile) = self.profile.as_ref() else {
            return Ok(());
        };
        secure_dir(Path::new(STATE_DIR))?;
        let saved = Saved {
            version: 1,
            profile: profile.clone(),
            enabled: self.enabled,
            console_uid: self.console_uid,
        };
        let data = serde_json::to_vec(&saved).map_err(|e| e.to_string())?;
        let temp = Path::new(STATE_DIR).join("profile.new");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&temp)
            .map_err(|e| format!("Cannot create state snapshot: {e}"))?;
        let result = (|| {
            file.write_all(&data)?;
            file.sync_all()?;
            fs::rename(&temp, Path::new(STATE_DIR).join("profile.json"))?;
            fs::File::open(STATE_DIR)?.sync_all()
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp);
        }
        result.map_err(|e| e.to_string())
    }
    fn load(&mut self) -> Result<(), String> {
        if self.synthetic {
            return Ok(());
        }
        secure_dir(Path::new(STATE_DIR))?;
        let pending = Path::new(STATE_DIR).join("profile.new");
        if let Ok(meta) = fs::symlink_metadata(&pending) {
            if meta.uid() != 0 || !meta.is_file() || meta.mode() & 0o077 != 0 {
                return Err("Untrusted pending state snapshot".into());
            }
            fs::remove_file(pending).map_err(|e| e.to_string())?;
        }
        let path = Path::new(STATE_DIR).join("profile.json");
        if !path.exists() {
            return Ok(());
        }
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(path)
            .map_err(|e| e.to_string())?;
        let meta = file.metadata().map_err(|e| e.to_string())?;
        if meta.uid() != 0 || meta.mode() & 0o077 != 0 || meta.len() > MAX_MESSAGE as u64 {
            return Err("Stored profile ownership, mode or size is invalid".into());
        }
        let saved: Saved = serde_json::from_reader(file).map_err(|e| e.to_string())?;
        if saved.version != 1 {
            return Err("Unsupported stored state version".into());
        }
        Engine::new(saved.profile.clone()).map_err(|e| e.to_string())?;
        self.profile = Some(saved.profile);
        self.console_uid = saved.console_uid;
        self.armed_resume = saved.enabled;
        if self.armed_resume {
            self.message =
                "Saved profile is waiting for a trusted app heartbeat in its console session."
                    .into();
        }
        Ok(())
    }
    fn output(&mut self, device: u64, page: u16, usage: u16, down: bool) -> bool {
        !self.outputs.change(device, page, usage, down)
            || unsafe { native::uk_post(page, usage, down) }
    }
    fn outputs(&mut self, device: u64, events: Vec<OutputEvent>) -> bool {
        for event in events {
            if !self.output(device, 7, event.usage, event.down) {
                return false;
            }
        }
        true
    }
    fn tick(&mut self) {
        if !self.enabled {
            return;
        }
        if self.lease.is_none_or(|t| t.elapsed() > LEASE)
            || self.console_uid != unsafe { native::uk_console_uid() }
        {
            self.stop("stopped", "The trusted app disconnected or console session changed; physical keyboards were released.");
            let _ = self.persist();
            return;
        }
        if !unsafe { native::uk_ready() }
            || unsafe { native::uk_fault() }
            || !unsafe { native::uk_permission() }
        {
            self.stop(
                "driver_unavailable",
                "Native input/output became unavailable; physical keyboards were released.",
            );
            let _ = self.persist();
            return;
        }
        let deadline = self
            .engines
            .values()
            .filter_map(Engine::next_deadline_ms)
            .min();
        let wait_ms = event_wait_ms(unsafe { native::uk_now_ms() }, deadline);
        unsafe {
            native::uk_pump(wait_ms);
        }
        // A power callback or session change during the wait must release input before output.
        if unsafe { native::uk_fault() }
            || !unsafe { native::uk_ready() }
            || self.console_uid != unsafe { native::uk_console_uid() }
            || self.lease.is_none_or(|t| t.elapsed() > LEASE)
        {
            self.stop(
                "stopped",
                "Device disconnect, sleep, or driver loss detected; physical keyboards released.",
            );
            let _ = self.persist();
            return;
        }
        let ms = unsafe { native::uk_now_ms() };
        let mut event = RawEvent::default();
        while unsafe { native::uk_event(&mut event) } {
            let success = if event.page == 7 {
                if !self.engines.contains_key(&event.device) {
                    let engine = Engine::new(self.profile.as_ref().unwrap().clone())
                        .expect("already validated profile");
                    self.engines.insert(event.device, engine);
                }
                let events = self
                    .engines
                    .get_mut(&event.device)
                    .unwrap()
                    .process(KeyEvent {
                        usage: event.usage,
                        down: event.down,
                        at_ms: event.at_ms,
                    });
                self.outputs(event.device, events)
            } else {
                self.output(event.device, event.page, event.usage, event.down)
            };
            if !success {
                self.stop(
                    "error",
                    "Virtual HID output failed; physical keyboards were released.",
                );
                let _ = self.persist();
                return;
            }
        }
        let ids: Vec<u64> = self
            .engines
            .iter()
            .filter(|(_, e)| e.next_deadline_ms().is_some_and(|d| d <= ms))
            .map(|(&id, _)| id)
            .collect();
        for id in ids {
            let events = self.engines.get_mut(&id).unwrap().tick(ms);
            if !self.outputs(id, events) {
                self.stop(
                    "error",
                    "Timed virtual HID output failed; physical keyboards were released.",
                );
                let _ = self.persist();
                break;
            }
        }
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.stop("stopped", "Helper stopped.");
    }
}

fn secure_dir(path: &Path) -> Result<(), String> {
    let mut components: Vec<_> = path.ancestors().collect();
    components.reverse();
    for p in components {
        let meta = fs::symlink_metadata(p).map_err(|e| {
            format!(
                "State directory must be installed by the signed installer: {}: {e}",
                p.display()
            )
        })?;
        if !meta.is_dir()
            || meta.file_type().is_symlink()
            || meta.uid() != 0
            || meta.mode() & 0o022 != 0
        {
            return Err(format!("Untrusted state ancestor: {}", p.display()));
        }
    }
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.mode() & 0o077 != 0 {
        return Err("State directory must be root-owned mode 0700".into());
    }
    Ok(())
}
fn production_lock() -> Result<fs::File, String> {
    if unsafe { libc::geteuid() } != 0 {
        return Err("Production helper requires root".into());
    }
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open("/var/run/com.ultimatekeyboards.remapper.lock")
        .map_err(|e| e.to_string())?;
    let meta = lock.metadata().map_err(|e| e.to_string())?;
    if meta.uid() != 0 || !meta.is_file() || meta.mode() & 0o077 != 0 {
        return Err("Untrusted helper lock file".into());
    }
    if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err("Another remapper helper already holds the service lock".into());
    }
    if let Ok(meta) = fs::symlink_metadata(SOCKET) {
        if meta.uid() != 0 || !meta.file_type().is_socket() {
            return Err("Untrusted existing helper socket".into());
        }
        if UnixStream::connect(SOCKET).is_ok() {
            return Err("A live process already owns the helper endpoint".into());
        }
        fs::remove_file(SOCKET).map_err(|e| e.to_string())?;
    }
    Ok(lock)
}
fn listener(path: &Path, synthetic: bool) -> Result<UnixListener, String> {
    if !synthetic && unsafe { libc::geteuid() } != 0 {
        return Err(
            "Production service requires root; use --check for read-only diagnostics".into(),
        );
    }
    if path.exists() || fs::symlink_metadata(path).is_ok() {
        // Never unlink an existing endpoint: it might belong to a live helper.
        return Err(format!("Socket already exists: {}. The installer must stop the prior service and remove its stale socket.", path.display()));
    }
    let listener = UnixListener::bind(path).map_err(|e| e.to_string())?;
    fs::set_permissions(
        path,
        fs::Permissions::from_mode(if synthetic { 0o600 } else { 0o666 }),
    )
    .map_err(|e| e.to_string())?;
    Ok(listener)
}
fn check() -> NativeStatus {
    let mut s = Service::new(false);
    s.state = if !unsafe { native::uk_permission() } {
        "needs_permission"
    } else if !unsafe { native::uk_driver_present() } {
        "driver_unavailable"
    } else {
        "stopped"
    }
    .into();
    s.message = format!("Read-only preflight: no virtual HID connection, device capture or event injection was attempted. This process may inherit its launcher's TCC identity; use LaunchServices --permission-status for fresh helper-bundle attribution. Driver readiness requires an explicit Enable handshake. Compiled trusted Team ID: {}.", option_env!("UK_TEAM_ID").unwrap_or("unset; production disabled"));
    let mut status = s.status();
    status.helper_installed = fs::metadata("/Library/Application Support/com.ultimatekeyboards.app/Native/Ultimate Keyboards Remapper.app/Contents/MacOS/ultimate-keyboards-remapper").is_ok_and(|m| m.uid() == 0 && m.is_file());
    status
}
fn self_test() -> Result<(), String> {
    if !setup_role_allowed(501, 501, 501)
        || setup_role_allowed(0, 0, 501)
        || setup_role_allowed(501, 0, 501)
        || setup_role_allowed(501, 501, 502)
    {
        return Err("Permission setup user-session guard failed".into());
    }
    if !unsafe { native::uk_bridge_self_test() } {
        return Err("Virtual HID report encoding self-test failed".into());
    }
    if parse_request(br#"{"version":9,"command":"status"}"#).is_ok()
        || parse_request(&vec![b' '; MAX_MESSAGE + 1]).is_ok()
    {
        return Err("IPC rejection self-test failed".into());
    }
    let mut service = Service::new(true);
    let req = parse_request(br#"{"version":1,"command":"apply","enable":true,"profile":{"version":1,"title":"test","rules":[]}}"#);
    if service.handle(req, true).ok || service.started {
        return Err("Test-mode capture guard failed".into());
    }
    let req = parse_request(br#"{"version":1,"command":"disable"}"#);
    if service.handle(req, false).ok {
        return Err("Authorization guard failed".into());
    }
    Ok(())
}
fn setup_role_allowed(uid: u32, euid: u32, console_uid: u32) -> bool {
    uid != 0 && euid != 0 && uid == euid && uid == console_uid && console_uid != u32::MAX
}
fn permission_setup(request: bool) -> Result<(), String> {
    if !setup_role_allowed(
        unsafe { libc::getuid() },
        unsafe { libc::geteuid() },
        unsafe { native::uk_console_uid() },
    ) {
        return Err("Permission setup must run as the active non-root console user.".into());
    }
    if !unsafe { native::uk_prepare_user_setup() } {
        return Err("Could not initialize the helper's user-session setup role.".into());
    }
    let granted = if request {
        unsafe { native::uk_request_permission() }
    } else {
        unsafe { native::uk_permission() }
    };
    println!(
        "{}",
        serde_json::json!({
            "protocolVersion": 1, "helperBundleIdentifier": "com.ultimatekeyboards.remapper",
            "permissionApi": "IOHIDCheckAccess", "inputMonitoringGranted": granted,
            "requestAttempted": request, "captureAttempted": false, "pid": std::process::id(),
            "uid": unsafe { libc::getuid() }
        })
    );
    Ok(())
}
fn build_info() -> serde_json::Value {
    serde_json::json!({
        "protocolVersion": 1,
        "version": env!("CARGO_PKG_VERSION"),
        "trustedTeamId": option_env!("UK_TEAM_ID"),
        "targetArchitecture": std::env::consts::ARCH,
    })
}
fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    // Pure compiled provenance: must precede every native, permission and socket path.
    if args.len() == 2 && args[1] == "--build-info" {
        println!("{}", build_info());
        return Ok(());
    }
    if args.len() == 2 && args[1] == "--request-permission" {
        return permission_setup(true);
    }
    if args.len() == 2 && args[1] == "--permission-status" {
        return permission_setup(false);
    }
    if args.len() == 2 && args[1] == "--list-devices" {
        let raw = unsafe { std::ffi::CStr::from_ptr(native::uk_devices_json()) };
        let value: serde_json::Value =
            serde_json::from_slice(raw.to_bytes()).map_err(|e| e.to_string())?;
        println!(
            "{}",
            serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?
        );
        return Ok(());
    }
    if args.len() == 2 && args[1] == "--check" {
        println!("{}", serde_json::to_string_pretty(&check()).unwrap());
        return Ok(());
    }
    if args.len() == 2 && args[1] == "--self-test" {
        self_test()?;
        println!("Self-test passed: report encoding, bounded IPC, authorization, and synthetic-mode capture prohibition.");
        return Ok(());
    }
    let synthetic = args.len() == 3 && args[1] == "--test-socket";
    if !synthetic && args.len() != 1 {
        return Err(
            "Usage: ultimate-keyboards-remapper [--build-info | --check | --list-devices | --request-permission | --permission-status | --self-test | --test-socket PATH]"
                .into(),
        );
    }
    if !synthetic && option_env!("UK_TEAM_ID").is_none_or(|s| s.is_empty()) {
        return Err(
            "Production helper was built without UK_TEAM_ID; refusing privileged IPC".into(),
        );
    }
    let path = if synthetic {
        PathBuf::from(&args[2])
    } else {
        PathBuf::from(SOCKET)
    };
    let _lock = if synthetic {
        None
    } else {
        Some(production_lock()?)
    };
    let listener = listener(&path, synthetic)?;
    struct SocketGuard(PathBuf);
    impl Drop for SocketGuard {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.0);
        }
    }
    let _guard = SocketGuard(path);
    unsafe {
        libc::signal(
            libc::SIGTERM,
            signal_stop as *const () as libc::sighandler_t,
        );
        libc::signal(libc::SIGINT, signal_stop as *const () as libc::sighandler_t);
    }
    let mut service = Service::new(synthetic);
    service.load()?;
    let (tx, rx) = mpsc::sync_channel(64);
    thread::spawn(move || serve(listener, tx, synthetic));
    let mut last = Instant::now();
    let mut wall = std::time::SystemTime::now();
    while !QUIT.load(Ordering::Relaxed) {
        if service
            .restart_at
            .is_some_and(|deadline| Instant::now() >= deadline)
        {
            break;
        }
        let now = Instant::now();
        let wall_now = std::time::SystemTime::now();
        // SystemTime includes sleep on macOS. A stalled event loop must also release captures.
        if service.enabled
            && (now.duration_since(last) > TIMEOUT
                || wall_now
                    .duration_since(wall)
                    .map_or(true, |gap| gap > TIMEOUT))
        {
            service.stop("stopped", "Sleep or event-loop interruption detected; physical keyboards released. Enable again to resume.");
            let _ = service.persist();
        }
        last = now;
        wall = wall_now;
        for work in rx.try_iter().take(16) {
            let authorized = work.authorized
                && (synthetic || work.console_uid == unsafe { native::uk_console_uid() });
            let response = service.handle(work.request, authorized);
            let _ = work.reply.send(response);
        }
        service.tick();
        // Active input waits in CFRunLoop and wakes on its HID source; never add a pickup sleep.
        // Disabled and synthetic modes have no native source, so retain a bounded idle sleep.
        if !service.enabled {
            thread::sleep(Duration::from_millis(MAX_EVENT_WAIT_MS));
        }
    }
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn build_info_contains_only_compiled_provenance() {
        let info = build_info();
        let fields = info.as_object().unwrap();
        assert_eq!(fields.len(), 4);
        assert_eq!(info["protocolVersion"], 1);
        assert_eq!(info["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(
            info["trustedTeamId"],
            serde_json::json!(option_env!("UK_TEAM_ID"))
        );
        assert_eq!(info["targetArchitecture"], std::env::consts::ARCH);
    }
    #[test]
    fn event_wait_respects_due_deadlines_and_bounds_safety_checks() {
        assert_eq!(event_wait_ms(100, None), 3);
        assert_eq!(event_wait_ms(100, Some(200)), 3);
        assert_eq!(event_wait_ms(100, Some(102)), 2);
        assert_eq!(event_wait_ms(100, Some(100)), 0);
        assert_eq!(event_wait_ms(100, Some(99)), 0);
        assert_eq!(event_wait_ms(u64::MAX - 1, Some(u64::MAX)), 1);
    }
    #[test]
    fn rejects_malformed_oversized_and_unknown_fields() {
        for bytes in [
            b"{invalid".as_slice(),
            br#"{"version":2,"command":"status"}"#,
            br#"{"version":1,"command":"status","path":"/etc/passwd"}"#,
            br#"{"version":1,"command":"status","enable":true}"#,
        ] {
            assert!(parse_request(bytes).is_err());
        }
        assert!(parse_request(&vec![0; MAX_MESSAGE + 1]).is_err());
    }
    #[test]
    fn untrusted_peer_can_only_read_status_and_cannot_refresh_lease() {
        let mut s = Service::new(true);
        assert!(
            s.handle(parse_request(br#"{"version":1,"command":"status"}"#), false)
                .ok
        );
        assert!(s.lease.is_none());
        assert!(
            !s.handle(
                parse_request(br#"{"version":1,"command":"disable"}"#),
                false
            )
            .ok
        );
    }
    #[test]
    fn synthetic_mode_never_enables_hardware() {
        self_test().unwrap();
    }
    #[test]
    fn output_refcounts_are_per_device_and_duplicate_safe() {
        let mut o = Outputs::default();
        assert!(o.change(1, 7, 224, true));
        assert!(!o.change(1, 7, 224, true));
        assert!(!o.change(2, 7, 224, true));
        assert!(!o.change(1, 7, 224, false));
        assert!(!o.change(1, 7, 224, false));
        assert!(o.change(2, 7, 224, false));
    }
    #[test]
    fn validated_snapshot_is_applied_without_enabling() {
        let mut s = Service::new(true);
        assert!(s.handle(parse_request(br#"{"version":1,"command":"apply","profile":{"version":1,"title":"safe","rules":[]},"enable":false}"#), true).ok);
        assert_eq!(s.status().profile_title.as_deref(), Some("safe"));
        assert!(!s.enabled);
        assert!(!s.started);
    }
    #[test]
    fn newline_frame_is_required() {
        use std::net::Shutdown;
        let (a, mut b) = UnixStream::pair().unwrap();
        b.write_all(br#"{"version":1,"command":"status"}"#).unwrap();
        b.shutdown(Shutdown::Write).unwrap();
        assert!(read_request(&a).is_err());
    }
    #[test]
    fn newline_frame_roundtrip() {
        let (a, mut b) = UnixStream::pair().unwrap();
        b.write_all(b"{\"version\":1,\"command\":\"status\"}\n")
            .unwrap();
        assert_eq!(read_request(&a).unwrap().command, "status");
    }
    #[test]
    fn audit_token_signature_rejects_this_unsigned_test_client() {
        let (a, _b) = UnixStream::pair().unwrap();
        let team = std::ffi::CString::new("9878YL387T").unwrap();
        assert!(!unsafe { native::uk_authorize(a.as_raw_fd(), team.as_ptr()) });
    }
    #[test]
    fn authorization_is_bound_to_the_same_non_root_console_session() {
        assert!(authenticated_session_matches(true, 501, 501));
        assert!(!authenticated_session_matches(false, 501, 501));
        assert!(!authenticated_session_matches(true, 501, 502));
        assert!(!authenticated_session_matches(true, 0, 0));
        assert!(!authenticated_session_matches(true, u32::MAX, u32::MAX));
    }
    #[test]
    fn permission_setup_rejects_root_and_other_console_sessions() {
        assert!(setup_role_allowed(501, 501, 501));
        for (uid, euid, console) in [
            (0, 0, 501),
            (501, 0, 501),
            (501, 502, 501),
            (501, 501, 502),
            (501, 501, u32::MAX),
        ] {
            assert!(!setup_role_allowed(uid, euid, console));
        }
    }
    #[test]
    fn restart_requires_authorization_and_preserves_profile_disabled() {
        let mut service = Service::new(true);
        service.profile = Some(Profile {
            title: "retained".into(),
            ..Profile::default()
        });
        assert!(
            !service
                .handle(
                    parse_request(br#"{"version":1,"command":"restart"}"#),
                    false
                )
                .ok
        );
        assert!(service.restart_at.is_none());
        let response = service.handle(parse_request(br#"{"version":1,"command":"restart"}"#), true);
        assert!(response.ok);
        assert!(service.restart_at.is_some());
        assert!(!service.started && !service.enabled && !service.armed_resume);
        assert_eq!(response.status.profile_title.as_deref(), Some("retained"));
        assert!(parse_request(br#"{"version":1,"command":"restart","enable":true}"#).is_err());
    }
}
