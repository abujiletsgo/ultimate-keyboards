//! WH_KEYBOARD_LL on a thread of its own, plus `SendInput` output.
use super::{shared, Shared};
use crate::guard::{now_ms, Beats};
use crate::keymap::{all_usages, key_code, usage_from_event, KeyCode};
use crate::service::{check_windows_build, Host, KeyAction};
use std::mem::size_of;
use std::sync::atomic::{AtomicIsize, Ordering::SeqCst};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{GetLastError, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::SystemInformation::OSVERSIONINFOW;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

/// `dwExtraInfo` on every key we inject; the hook lets these through untouched.
pub const OUT_TAG: usize = 0x554B_0001;
/// A key-up of an unassigned virtual key the watchdog injects to prove the hook is alive.
pub const PROBE_TAG: usize = 0x554B_0002;
const VK_UNASSIGNED: u16 = 0xE8;
const WM_INSTALL: u32 = WM_APP + 1;
const PUMP_TIMER_MS: u32 = 100;
/// Windows gives an LL hook ~300 ms; wait for the service lock for less than that.
const LOCK_WAIT: Duration = Duration::from_millis(150);

#[link(name = "ntdll")]
extern "system" {
    fn RtlGetVersion(info: *mut OSVERSIONINFOW) -> i32;
}

fn windows_build() -> u32 {
    let mut info: OSVERSIONINFOW = unsafe { std::mem::zeroed() };
    info.dwOSVersionInfoSize = size_of::<OSVERSIONINFOW>() as u32;
    unsafe { RtlGetVersion(&mut info) };
    info.dwBuildNumber
}

/// Shared by the hook thread and everything that installs or removes the hook.
pub struct HookCtl {
    thread_id: u32,
    hhook: AtomicIsize,
    pub beats: Arc<Beats>,
    reply: Mutex<Option<mpsc::Sender<Result<(), String>>>>,
}

impl HookCtl {
    /// Starts the hook thread (message loop, no hook yet) and waits until it can take commands.
    pub fn spawn(beats: Arc<Beats>) -> Result<Arc<HookCtl>, String> {
        let (tx, rx) = mpsc::channel();
        std::thread::Builder::new()
            .name("uk-hook".into())
            .spawn(move || hook_thread(tx, beats))
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(2)).map_err(|e| format!("hook thread did not start: {e}"))
    }

    fn install(&self) -> Result<(), String> {
        if self.hhook.load(SeqCst) != 0 {
            return Ok(());
        }
        let (tx, rx) = mpsc::channel();
        *self.reply.lock().unwrap() = Some(tx);
        if unsafe { PostThreadMessageW(self.thread_id, WM_INSTALL, 0, 0) } == 0 {
            return Err("The keyboard hook thread is gone.".into());
        }
        rx.recv_timeout(Duration::from_secs(2))
            .unwrap_or_else(|_| Err("Windows did not start the keyboard hook in time.".into()))?;
        self.beats.arm(now_ms());
        Ok(())
    }

    /// Callable from any thread, including from inside the hook itself.
    pub fn remove(&self) {
        self.beats.disarm();
        let h = self.hhook.swap(0, SeqCst);
        if h != 0 {
            unsafe { UnhookWindowsHookEx(h as _) };
        }
    }
}

fn hook_thread(ready: mpsc::Sender<Arc<HookCtl>>, beats: Arc<Beats>) {
    let mut msg: MSG = unsafe { std::mem::zeroed() };
    // Touch the queue first so PostThreadMessage to this thread id cannot fail.
    unsafe { PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_NOREMOVE) };
    let ctl = Arc::new(HookCtl {
        thread_id: unsafe { GetCurrentThreadId() },
        hhook: AtomicIsize::new(0),
        beats: beats.clone(),
        reply: Mutex::new(None),
    });
    let _ = ready.send(ctl.clone());
    unsafe { SetTimer(std::ptr::null_mut(), 0, PUMP_TIMER_MS, None) };
    while unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) } > 0 {
        beats.pump.store(now_ms(), SeqCst);
        if msg.message == WM_INSTALL {
            let result = unsafe {
                let h = SetWindowsHookExW(WH_KEYBOARD_LL, Some(callback), GetModuleHandleW(std::ptr::null()), 0);
                if h.is_null() {
                    Err(format!("Windows would not start the keyboard hook (error {}).", GetLastError()))
                } else {
                    ctl.hhook.store(h as isize, SeqCst);
                    Ok(())
                }
            };
            if let Some(tx) = ctl.reply.lock().unwrap().take() {
                let _ = tx.send(result);
            }
        } else {
            unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
}

unsafe extern "system" fn callback(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let k = &*(lparam as *const KBDLLHOOKSTRUCT);
        if let Some(sh) = shared() {
            if handle(sh, k, wparam as u32) {
                return 1;
            }
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

/// `true` swallows the event.
fn handle(sh: &Shared, k: &KBDLLHOOKSTRUCT, message: u32) -> bool {
    let now = now_ms();
    sh.beats.hook.store(now, SeqCst);
    if k.dwExtraInfo == PROBE_TAG {
        return true;
    }
    // Our own output and anyone else's injected input (other tools, remote sessions) go through.
    if k.dwExtraInfo == OUT_TAG || k.flags & LLKHF_INJECTED != 0 {
        return false;
    }
    let down = match message {
        WM_KEYDOWN | WM_SYSKEYDOWN => true,
        WM_KEYUP | WM_SYSKEYUP => false,
        _ => return false,
    };
    let Some(usage) = usage_from_event(k.vkCode as u16, k.scanCode as u16, k.flags & LLKHF_EXTENDED != 0) else {
        return false;
    };
    let give_up = Instant::now() + LOCK_WAIT;
    let action = loop {
        match sh.svc.try_lock() {
            Ok(mut svc) => break svc.key(usage, down, now),
            Err(std::sync::TryLockError::Poisoned(p)) => break p.into_inner().key(usage, down, now),
            Err(_) if Instant::now() < give_up => std::thread::yield_now(),
            // Service busy for too long: better one key passing unchanged than a frozen keyboard.
            Err(_) => return false,
        }
    };
    sh.wake();
    action == KeyAction::Swallow
}

fn input(usage: u16, down: bool, tag: usize) -> Option<INPUT> {
    let (vk, scan, mut flags) = match key_code(usage)? {
        KeyCode::Scan { code, extended } => {
            (0, code, KEYEVENTF_SCANCODE | if extended { KEYEVENTF_EXTENDEDKEY } else { 0 })
        }
        KeyCode::Vk(vk) => (vk, 0, 0),
    };
    if !down {
        flags |= KEYEVENTF_KEYUP;
    }
    Some(INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: tag } },
    })
}

fn submit(inputs: &[INPUT]) -> bool {
    inputs.is_empty()
        || unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) } == inputs.len() as u32
}

pub fn send_key(usage: u16, down: bool) -> bool {
    input(usage, down, OUT_TAG).is_some_and(|i| submit(&[i]))
}

/// Key-up for every key this crate can type, in one call. Used when the service lock is unreachable.
pub fn send_all_up() {
    let all: Vec<INPUT> = all_usages().filter_map(|u| input(u, false, OUT_TAG)).collect();
    submit(&all);
}

pub fn send_probe() {
    let probe = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: VK_UNASSIGNED, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: PROBE_TAG },
        },
    };
    submit(&[probe]);
}

pub struct WinHost(pub Arc<HookCtl>);

impl Host for WinHost {
    fn preflight(&mut self) -> Result<(), String> {
        check_windows_build(windows_build())
    }
    fn install_hook(&mut self) -> Result<(), String> {
        self.0.install()
    }
    fn remove_hook(&mut self) {
        self.0.remove()
    }
    fn send(&mut self, usage: u16, down: bool) -> bool {
        send_key(usage, down)
    }
}

pub fn build_number() -> u32 {
    windows_build()
}
