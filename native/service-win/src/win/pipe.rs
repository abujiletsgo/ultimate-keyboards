//! Named-pipe server: same one-line JSON contract as the macOS Unix socket. The pipe's
//! ACL admits only the current user, remote clients are refused by the kernel, and every
//! request is checked again by comparing the client's token SID with ours.
use super::{shared, Shared};
use crate::guard::now_ms;
use crate::proto::{encode_response, read_request};
use std::io::{self, Read, Write};
use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::Security::Authorization::*;
use windows_sys::Win32::Security::*;
use windows_sys::Win32::Storage::FileSystem::*;
use windows_sys::Win32::System::Pipes::*;
use windows_sys::Win32::System::Threading::*;
use windows_sys::Win32::System::IO::*;

pub const PIPE_NAME: &str = r"\\.\pipe\ultimatekeyboards-remapper";
const IO_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_CLIENTS: usize = 16;
const PIPE_BUFFER: u32 = 64 * 1024;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

/// A TOKEN_USER in 8-byte-aligned storage.
pub struct UserSid(Vec<u64>);

impl UserSid {
    fn from_token(token: HANDLE) -> Option<Self> {
        let mut len = 0u32;
        unsafe { GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut len) };
        if len == 0 {
            return None;
        }
        let mut buf = vec![0u64; (len as usize).div_ceil(8)];
        (unsafe { GetTokenInformation(token, TokenUser, buf.as_mut_ptr().cast(), len, &mut len) } != 0)
            .then_some(Self(buf))
    }
    pub fn current_process() -> Option<Self> {
        let mut token = std::ptr::null_mut();
        if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
            return None;
        }
        let sid = Self::from_token(token);
        unsafe { CloseHandle(token) };
        sid
    }
    fn psid(&self) -> PSID {
        unsafe { (*self.0.as_ptr().cast::<TOKEN_USER>()).User.Sid }
    }
    fn to_sddl_string(&self) -> Option<String> {
        let mut out: *mut u16 = std::ptr::null_mut();
        if unsafe { ConvertSidToStringSidW(self.psid(), &mut out) } == 0 {
            return None;
        }
        let len = (0..).take_while(|&i| unsafe { *out.add(i) } != 0).count();
        let s = String::from_utf16(unsafe { std::slice::from_raw_parts(out, len) }).ok();
        unsafe { LocalFree(out.cast()) };
        s
    }
}

/// Is the process on the other end of `pipe` running as the same user as this service?
fn client_is_same_user(pipe: HANDLE, ours: &UserSid) -> bool {
    unsafe {
        if ImpersonateNamedPipeClient(pipe) == 0 {
            return false;
        }
        let mut token = std::ptr::null_mut();
        let opened = OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, 1, &mut token) != 0;
        RevertToSelf();
        if !opened {
            return false;
        }
        let theirs = UserSid::from_token(token);
        CloseHandle(token);
        theirs.is_some_and(|t| EqualSid(t.psid(), ours.psid()) != 0)
    }
}

fn create_instance(name: &[u16], first: bool, ours: &UserSid) -> Result<HANDLE, String> {
    let sddl = wide(&format!("D:P(A;;GA;;;{})", ours.to_sddl_string().ok_or("cannot read the user SID")?));
    let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    if unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(), 1, &mut descriptor, std::ptr::null_mut()) } == 0 {
        return Err(format!("cannot build the pipe ACL (error {})", unsafe { GetLastError() }));
    }
    let attrs = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor,
        bInheritHandle: 0,
    };
    let open_mode = PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | if first { FILE_FLAG_FIRST_PIPE_INSTANCE } else { 0 };
    let handle = unsafe {
        CreateNamedPipeW(
            name.as_ptr(),
            open_mode,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            PIPE_UNLIMITED_INSTANCES,
            PIPE_BUFFER,
            PIPE_BUFFER,
            0,
            &attrs,
        )
    };
    let error = unsafe { GetLastError() };
    unsafe { LocalFree(descriptor.cast()) };
    if handle == INVALID_HANDLE_VALUE {
        return Err(match error {
            ERROR_ACCESS_DENIED | ERROR_PIPE_BUSY => "Another Ultimate Keyboards keyboard service is already running.".into(),
            e => format!("Could not create the keyboard service pipe (error {e})."),
        });
    }
    Ok(handle)
}

/// One accepted connection with overlapped I/O under a single 2 s budget.
struct Conn {
    pipe: HANDLE,
    event: HANDLE,
    deadline: Instant,
}

impl Conn {
    fn wait(&self, overlapped: &mut OVERLAPPED, pending: bool) -> io::Result<u32> {
        let mut n = 0u32;
        if pending {
            let left = self.deadline.saturating_duration_since(Instant::now()).as_millis() as u32;
            if unsafe { WaitForSingleObject(self.event, left) } != WAIT_OBJECT_0 {
                unsafe {
                    CancelIoEx(self.pipe, overlapped);
                    GetOverlappedResult(self.pipe, overlapped, &mut n, 1);
                }
                return Err(io::ErrorKind::TimedOut.into());
            }
        }
        if unsafe { GetOverlappedResult(self.pipe, overlapped, &mut n, 0) } == 0 {
            return match unsafe { GetLastError() } {
                ERROR_BROKEN_PIPE | ERROR_PIPE_NOT_CONNECTED => Ok(0),
                _ => Err(io::Error::last_os_error()),
            };
        }
        Ok(n)
    }
}

impl Read for Conn {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let mut ov: OVERLAPPED = unsafe { std::mem::zeroed() };
        ov.hEvent = self.event;
        let ok = unsafe { ReadFile(self.pipe, buf.as_mut_ptr().cast(), buf.len().min(u32::MAX as usize) as u32, std::ptr::null_mut(), &mut ov) };
        let error = unsafe { GetLastError() };
        let pending = ok == 0 && error == ERROR_IO_PENDING;
        if ok == 0 && !pending {
            // The client hung up: end of input, not a failure.
            return if matches!(error, ERROR_BROKEN_PIPE | ERROR_PIPE_NOT_CONNECTED) { Ok(0) } else { Err(io::Error::last_os_error()) };
        }
        self.wait(&mut ov, pending).map(|n| n as usize)
    }
}

impl Write for Conn {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut ov: OVERLAPPED = unsafe { std::mem::zeroed() };
        ov.hEvent = self.event;
        let ok = unsafe { WriteFile(self.pipe, buf.as_ptr().cast(), buf.len().min(u32::MAX as usize) as u32, std::ptr::null_mut(), &mut ov) };
        let pending = ok == 0 && unsafe { GetLastError() } == ERROR_IO_PENDING;
        if ok == 0 && !pending {
            return Err(io::Error::last_os_error());
        }
        self.wait(&mut ov, pending).map(|n| n as usize)
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Drop for Conn {
    fn drop(&mut self) {
        unsafe {
            DisconnectNamedPipe(self.pipe);
            CloseHandle(self.pipe);
            CloseHandle(self.event);
        }
    }
}

fn serve_client(sh: &Shared, mut conn: Conn, ours: &UserSid) {
    let authorized = client_is_same_user(conn.pipe, ours);
    let request = read_request(&mut conn);
    let response = {
        let mut svc = sh.svc.lock().unwrap_or_else(|e| e.into_inner());
        svc.handle(request, authorized, now_ms())
    };
    if conn.write_all(&encode_response(&response)).is_ok() {
        // DisconnectNamedPipe discards unread data: wait (within the 2 s budget) for the client to take
        // the reply and hang up. FlushFileBuffers would block forever on a client that never reads.
        while matches!(conn.read(&mut [0u8; 64]), Ok(n) if n > 0) {}
    }
}

/// Creates the first pipe instance (so a second service fails loudly) and accepts clients forever.
pub fn start(name: &str) -> Result<(), String> {
    let ours = UserSid::current_process().ok_or("cannot read the current user")?;
    let name = wide(name);
    let mut next = create_instance(&name, true, &ours)? as isize;
    std::thread::Builder::new()
        .name("uk-pipe".into())
        .spawn(move || {
            let clients = std::sync::Arc::new(AtomicUsize::new(0));
            let ours = std::sync::Arc::new(ours);
            loop {
                let pipe = next as HANDLE;
                let event = unsafe { CreateEventW(std::ptr::null(), 1, 0, std::ptr::null()) };
                let mut ov: OVERLAPPED = unsafe { std::mem::zeroed() };
                ov.hEvent = event;
                let connected = unsafe { ConnectNamedPipe(pipe, &mut ov) };
                let error = unsafe { GetLastError() };
                let ok = if connected != 0 || error == ERROR_PIPE_CONNECTED {
                    true
                } else if error == ERROR_IO_PENDING {
                    unsafe { WaitForSingleObject(event, INFINITE) };
                    let mut n = 0;
                    unsafe { GetOverlappedResult(pipe, &ov, &mut n, 0) != 0 }
                } else {
                    false
                };
                // The next instance must exist before this client is served, or new clients see "no pipe".
                next = loop {
                    match create_instance(&name, false, &ours) {
                        Ok(h) => break h as isize,
                        Err(_) => std::thread::sleep(Duration::from_millis(100)),
                    }
                };
                let conn = Conn { pipe, event, deadline: Instant::now() + IO_TIMEOUT };
                if !ok || clients.load(SeqCst) >= MAX_CLIENTS {
                    drop(conn);
                    continue;
                }
                clients.fetch_add(1, SeqCst);
                let (done, ours) = (clients.clone(), ours.clone());
                let handle = std::thread::Builder::new().spawn(move || {
                    if let Some(sh) = shared() {
                        serve_client(sh, conn, &ours);
                    }
                    done.fetch_sub(1, SeqCst);
                });
                if handle.is_err() {
                    clients.fetch_sub(1, SeqCst);
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

// HANDLE is a raw pointer; each connection is used by exactly one thread at a time.
unsafe impl Send for Conn {}
