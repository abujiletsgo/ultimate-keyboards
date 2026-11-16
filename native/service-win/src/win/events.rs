//! A hidden top-level window whose only job is to hear about lock, user switch, sleep and
//! shutdown, and to release the keyboard before any of them happen.
use super::fail_open_all;
use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::Console::*;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Power::RegisterSuspendResumeNotification;
use windows_sys::Win32::System::RemoteDesktop::WTSRegisterSessionNotification;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

const SLEEP: &str = "Your PC went to sleep, so remapping turned off. Turn it on again to keep going.";
const LOCKED: &str = "Your PC was locked or switched to another user, so remapping turned off. Turn it on again to keep going.";
const SHUTDOWN: &str = "Windows is shutting down.";

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        // Sleep is announced before it happens: PBT_APMQUERYSUSPEND = 0, PBT_APMSUSPEND = 4. Modern Standby
        // laptops may skip those, so the resume events (6, 7, 0x12) switch remapping off as well.
        WM_POWERBROADCAST => {
            if matches!(wparam as u32, 0 | 4 | 6 | 7 | 0x12) {
                fail_open_all("stopped", SLEEP);
            }
            1
        }
        // CONSOLE_CONNECT 1, CONSOLE_DISCONNECT 2, REMOTE_CONNECT 3, REMOTE_DISCONNECT 4,
        // SESSION_LOGON 5, SESSION_LOGOFF 6, SESSION_LOCK 7. Unlock (8) needs nothing: we are already off.
        WM_WTSSESSION_CHANGE => {
            if matches!(wparam as u32, 1..=4 | 6 | 7) {
                fail_open_all("stopped", LOCKED);
            }
            0
        }
        WM_QUERYENDSESSION => 1,
        WM_ENDSESSION => {
            if wparam != 0 {
                fail_open_all("stopped", SHUTDOWN);
            }
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe extern "system" fn ctrl_handler(_event: u32) -> i32 {
    fail_open_all("stopped", SHUTDOWN);
    std::process::exit(0)
}

/// Creates the window and runs this thread's message loop until the process is told to quit.
pub fn run_loop() -> Result<(), String> {
    unsafe {
        let class: Vec<u16> = "UltimateKeyboardsRemapperEvents\0".encode_utf16().collect();
        let instance = GetModuleHandleW(std::ptr::null());
        let mut wc: WNDCLASSW = std::mem::zeroed();
        wc.lpfnWndProc = Some(wndproc);
        wc.hInstance = instance;
        wc.lpszClassName = class.as_ptr();
        if RegisterClassW(&wc) == 0 {
            return Err("cannot register the event window class".into());
        }
        let hwnd = CreateWindowExW(0, class.as_ptr(), class.as_ptr(), WS_OVERLAPPED, 0, 0, 0, 0, std::ptr::null_mut(), std::ptr::null_mut(), instance, std::ptr::null());
        if hwnd.is_null() {
            return Err("cannot create the event window".into());
        }
        // NOTIFY_FOR_THIS_SESSION = 0; DEVICE_NOTIFY_WINDOW_HANDLE = 0.
        if WTSRegisterSessionNotification(hwnd, 0) == 0 {
            return Err("cannot subscribe to lock and user-switch events".into());
        }
        RegisterSuspendResumeNotification(hwnd, 0);
        SetConsoleCtrlHandler(Some(ctrl_handler), 1);
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    Ok(())
}
