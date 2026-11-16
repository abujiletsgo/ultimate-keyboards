//! Windows side: a WH_MOUSE_LL hook on its own thread (with a message loop)
//! sees wheel notches. When the engine is on it swallows them and an emitter
//! thread re-sends eased (or reversed/scaled) wheel input with SendInput.
//!
//! Trackpad protection: only whole notches (|delta| a multiple of 120) are
//! touched. Precision touchpads send small deltas and pass through, and so do
//! injected events (ours carry LLMHF_INJECTED), so we never see our own output.
//!
//! The hook callback only reads atomics and sends on a channel. Windows drops
//! low-level hooks that answer too slowly (LowLevelHooksTimeout).

use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;

use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::Media::timeBeginPeriod;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_HWHEEL, MOUSEEVENTF_WHEEL, MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, LLMHF_INJECTED,
    LLMHF_LOWER_IL_INJECTED, MSG, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_MOUSEHWHEEL, WM_MOUSEWHEEL,
};

use super::{run_emitter, Msg, CONFIG};

static STARTED: AtomicBool = AtomicBool::new(false);
static EMIT_TX: OnceLock<mpsc::Sender<Msg>> = OnceLock::new();

/// One wheel notch in Windows delta units.
const WHEEL_DELTA: i32 = 120;

fn send_wheel(flags: u32, delta: i32) {
    let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: delta as u32,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
}

/// True when the event was taken over (swallow it).
fn handle(msg: u32, info: &MSLLHOOKSTRUCT) -> bool {
    if !CONFIG.enabled.load(Ordering::Relaxed) {
        return false;
    }
    if info.flags & (LLMHF_INJECTED | LLMHF_LOWER_IL_INJECTED) != 0 {
        return false;
    }
    let delta = (info.mouseData >> 16) as u16 as i16 as i32;
    // Precision touchpads send small deltas: leave them alone.
    if delta == 0 || delta % WHEEL_DELTA != 0 {
        return false;
    }
    let reverse = CONFIG.reverse.load(Ordering::Relaxed);
    let speed = CONFIG.speed();
    let smooth = CONFIG.smooth.load(Ordering::Relaxed);
    if !smooth && !reverse && (speed - 1.0).abs() < f64::EPSILON {
        return false; // nothing to do
    }
    let Some(tx) = EMIT_TX.get() else {
        return false;
    };
    let d = delta as f64 * speed;
    let m = if msg == WM_MOUSEWHEEL {
        let v = if reverse { -d } else { d };
        if smooth { Msg::Smooth(v, 0.0) } else { Msg::Now(v, 0.0) }
    } else if smooth {
        Msg::Smooth(0.0, d)
    } else {
        Msg::Now(0.0, d)
    };
    tx.send(m).is_ok()
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && (wparam == WM_MOUSEWHEEL as usize || wparam == WM_MOUSEHWHEEL as usize) {
        let info = &*(lparam as *const MSLLHOOKSTRUCT);
        if handle(wparam as u32, info) {
            return 1;
        }
    }
    CallNextHookEx(null_mut(), code, wparam, lparam)
}

/// Start the engine: emitter thread plus the hook thread. Runs once.
pub fn start() -> Result<(), String> {
    if STARTED
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(());
    }

    let (wtx, wrx) = mpsc::channel::<Msg>();
    let emitter = std::thread::Builder::new()
        .name("mouse-emitter".into())
        .spawn(move || {
            // 1 ms timer resolution so the 8.3 ms tick isn't rounded to 15.6 ms.
            unsafe { timeBeginPeriod(1) };
            run_emitter(wrx, |v, h| {
                if v != 0 {
                    send_wheel(MOUSEEVENTF_WHEEL, v);
                }
                if h != 0 {
                    send_wheel(MOUSEEVENTF_HWHEEL, h);
                }
            });
        });
    if let Err(e) = emitter {
        STARTED.store(false, Ordering::Release);
        return Err(format!("Failed to spawn mouse-emitter thread: {e}"));
    }
    let _ = EMIT_TX.set(wtx);

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let spawned = std::thread::Builder::new()
        .name("mouse-hook".into())
        .spawn(move || unsafe {
            let hook = SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(hook_proc),
                GetModuleHandleW(std::ptr::null()),
                0,
            );
            if hook.is_null() {
                let _ = tx.send(Err("Couldn't install the mouse hook.".into()));
                return;
            }
            let _ = tx.send(Ok(()));
            // The hook only fires while this thread pumps messages.
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {}
        });
    let result = match spawned {
        Err(e) => Err(format!("Failed to spawn mouse-hook thread: {e}")),
        Ok(_) => rx
            .recv_timeout(Duration::from_secs(5))
            .unwrap_or_else(|_| Err("mouse-hook: thread did not report back".into())),
    };
    if result.is_err() {
        STARTED.store(false, Ordering::Release);
    }
    result
}
