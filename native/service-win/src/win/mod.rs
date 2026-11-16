//! Windows runtime: hook thread, named pipe, watchdog, timer worker and the event window,
//! all around one `Service` behind one mutex.
mod events;
mod hook;
mod pipe;

use crate::guard::{now_ms, Beats, Guard, Verdict};
use crate::service::Service;
use crate::state;
use hook::{send_all_up, send_probe, HookCtl, WinHost};
use std::sync::atomic::{AtomicBool, Ordering::SeqCst};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

pub struct Shared {
    pub svc: Mutex<Service<WinHost>>,
    pub beats: Arc<Beats>,
    ctl: Arc<HookCtl>,
    wake: (Mutex<bool>, Condvar),
    /// Set when the service lock could not be taken to release keys; the worker finishes the job.
    unreleased: AtomicBool,
}

impl Shared {
    pub fn wake(&self) {
        *self.wake.0.lock().unwrap_or_else(|e| e.into_inner()) = true;
        self.wake.1.notify_one();
    }
}

static SHARED: OnceLock<Arc<Shared>> = OnceLock::new();

pub fn shared() -> Option<&'static Arc<Shared>> {
    SHARED.get()
}

fn lock(sh: &Shared) -> MutexGuard<'_, Service<WinHost>> {
    sh.svc.lock().unwrap_or_else(|e| e.into_inner())
}

fn flush(save: Option<(std::path::PathBuf, Vec<u8>)>) {
    if let Some((dir, bytes)) = save {
        let _ = state::write(&dir, &bytes);
    }
}

/// Release every key and remove the hook, from any thread, for any reason. If the service lock
/// stays out of reach for a second the hook thread is stuck holding it: go around it.
pub fn fail_open_all(state: &str, message: &str) {
    let Some(sh) = shared() else { return };
    let give_up = Instant::now() + Duration::from_secs(1);
    loop {
        match sh.svc.try_lock() {
            Ok(mut svc) => {
                svc.fail_open(state, message);
                let save = svc.take_save();
                drop(svc);
                return flush(save);
            }
            Err(std::sync::TryLockError::Poisoned(p)) => {
                p.into_inner().fail_open(state, message);
                return;
            }
            Err(_) if Instant::now() < give_up => std::thread::sleep(Duration::from_millis(5)),
            Err(_) => break,
        }
    }
    emergency_release(sh);
}

fn emergency_release(sh: &Shared) {
    sh.ctl.remove();
    send_all_up();
    sh.unreleased.store(true, SeqCst);
    sh.wake();
}

fn watchdog(sh: Arc<Shared>) {
    let mut guard = Guard::default();
    loop {
        std::thread::sleep(Duration::from_millis(100));
        match guard.check(&sh.beats, now_ms()) {
            Verdict::Healthy => {}
            Verdict::SendProbe => send_probe(),
            Verdict::HookThreadStalled => fail_open_all("error", "The keyboard hook stopped responding, so remapping turned off. Your keyboard works as normal."),
            Verdict::HookRemoved => fail_open_all("error", "Windows removed the keyboard hook, so remapping turned off. Your keyboard works as normal."),
        }
    }
}

/// Engine timers (hold and combo deadlines), lease expiry, and the delayed exit after `restart`.
fn worker(sh: Arc<Shared>) {
    loop {
        let now = now_ms();
        let (next, save) = {
            let mut svc = lock(&sh);
            if sh.unreleased.swap(false, SeqCst) {
                svc.fail_open("error", "The keyboard service was stuck, so remapping turned off. Your keyboard works as normal.");
            }
            if svc.restart_due(now) {
                drop(svc);
                std::process::exit(0);
            }
            (svc.tick(now), svc.take_save())
        };
        flush(save);
        let wait = next.map_or(250, |d| d.saturating_sub(now_ms())).clamp(1, 250);
        let flag = sh.wake.0.lock().unwrap_or_else(|e| e.into_inner());
        let mut flag = sh.wake.1.wait_timeout_while(flag, Duration::from_millis(wait), |w| !*w).unwrap_or_else(|e| e.into_inner()).0;
        *flag = false;
    }
}

pub fn run(args: Vec<String>) -> i32 {
    match args.first().map(String::as_str) {
        Some("--check") => {
            let build = hook::build_number();
            let dir = state::state_dir(std::env::var_os("LOCALAPPDATA"));
            println!("{}", serde_json::json!({
                "windowsBuild": build,
                "supported": crate::service::check_windows_build(build).is_ok(),
                "stateDir": dir,
                "pipe": pipe::PIPE_NAME,
                "scope": "all keyboards",
            }));
            0
        }
        Some("--test-pipe") if args.len() == 2 => start(Some(args[1].as_str())),
        None => start(None),
        _ => {
            eprintln!("usage: ultimate-keyboards-remapper-win [--check | --test-pipe <suffix>]");
            2
        }
    }
}

/// `test_suffix` selects a throwaway pipe name and a synthetic service that never hooks keys or saves.
fn start(test_suffix: Option<&str>) -> i32 {
    let beats = Arc::new(Beats::default());
    let ctl = match HookCtl::spawn(beats.clone()) {
        Ok(c) => c,
        Err(e) => return fail(&e),
    };
    let synthetic = test_suffix.is_some();
    let dir = if synthetic { None } else { state::state_dir(std::env::var_os("LOCALAPPDATA")) };
    if dir.is_none() && !synthetic {
        return fail("LOCALAPPDATA is not set, so there is nowhere to keep your settings.");
    }
    let mut svc = Service::new(WinHost(ctl.clone()), dir, synthetic);
    if let Err(e) = svc.load() {
        eprintln!("ignoring saved settings: {e}");
    }
    let sh = Arc::new(Shared {
        svc: Mutex::new(svc),
        beats,
        ctl,
        wake: (Mutex::new(false), Condvar::new()),
        unreleased: AtomicBool::new(false),
    });
    let _ = SHARED.set(sh.clone());
    // A crash must not leave an injected modifier held down.
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(sh) = shared() {
            emergency_release(sh);
        }
        previous(info);
    }));
    let name = match test_suffix {
        Some(s) => format!("{}-test-{s}", pipe::PIPE_NAME),
        None => pipe::PIPE_NAME.to_string(),
    };
    if let Err(e) = pipe::start(&name) {
        return fail(&e);
    }
    let (w, g) = (sh.clone(), sh.clone());
    std::thread::spawn(move || worker(w));
    std::thread::spawn(move || watchdog(g));
    match events::run_loop() {
        Ok(()) => {
            fail_open_all("stopped", "The keyboard service stopped.");
            0
        }
        Err(e) => {
            fail_open_all("stopped", "The keyboard service stopped.");
            fail(&e)
        }
    }
}

fn fail(message: &str) -> i32 {
    eprintln!("{message}");
    1
}
