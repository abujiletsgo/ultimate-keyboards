//! Platform-neutral service core: validated snapshot, enable/disable, heartbeat lease,
//! the engine feed and every fail-open path. The Windows pieces (hook, `SendInput`) arrive
//! through `Host`, so all of this runs under `cargo test` on any OS.
use crate::keymap::is_modifier;
use crate::proto::{NativeStatus, Request, Response};
use crate::state::{self, Saved};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use ultimate_keyboards_engine::{Engine, KeyEvent, OutputEvent, Profile};

pub const LEASE_MS: u64 = 15_000;
/// Delay between answering `restart` and the process exiting for the app to relaunch.
pub const RESTART_DELAY_MS: u64 = 300;

pub trait Host {
    /// Windows 10 22H2 is the floor; older builds get a message instead of a hook.
    fn preflight(&mut self) -> Result<(), String>;
    /// Starts delivering physical key events to `Service::key`.
    fn install_hook(&mut self) -> Result<(), String>;
    fn remove_hook(&mut self);
    /// One tagged injected key transition. `false` means Windows refused it.
    fn send(&mut self, usage: u16, down: bool) -> bool;
}

#[derive(Debug, PartialEq, Eq)]
pub enum KeyAction {
    /// The key is not ours: let Windows deliver it unchanged.
    Pass,
    /// The engine owns this event; drop the original.
    Swallow,
}

pub struct Service<H: Host> {
    host: H,
    synthetic: bool,
    state_dir: Option<PathBuf>,
    profile: Option<Profile>,
    engine: Option<Engine>,
    /// Physical keys whose down we saw while remapping (their up must be swallowed too).
    phys: BTreeSet<u16>,
    /// Output keys currently held down in Windows.
    held: BTreeSet<u16>,
    /// Physical key -> the output its auto-repeat should re-send. Injected keys do not repeat by themselves.
    repeat: BTreeMap<u16, u16>,
    state: String,
    message: String,
    enabled: bool,
    lease: Option<u64>,
    armed_resume: bool,
    restart_at: Option<u64>,
    active_layers: Vec<String>,
    state_seq: u64,
    save: bool,
}

impl<H: Host> Service<H> {
    /// `state_dir: None` keeps the profile in memory only. `synthetic` services never hook.
    pub fn new(host: H, state_dir: Option<PathBuf>, synthetic: bool) -> Self {
        Self {
            host,
            synthetic,
            state_dir,
            profile: None,
            engine: None,
            phys: BTreeSet::new(),
            held: BTreeSet::new(),
            repeat: BTreeMap::new(),
            state: "stopped".into(),
            message: "Remapping is off. Your keyboard works as normal.".into(),
            enabled: false,
            lease: None,
            armed_resume: false,
            restart_at: None,
            active_layers: Vec::new(),
            state_seq: 1,
            save: false,
        }
    }

    fn bump_seq(&mut self) {
        self.state_seq = self.state_seq.wrapping_add(1).max(1);
    }

    fn sync_layers(&mut self) {
        let next = self
            .engine
            .as_ref()
            .filter(|_| self.enabled)
            .map(|e| e.active_layers().to_vec())
            .unwrap_or_default();
        if next != self.active_layers {
            self.active_layers = next;
            self.bump_seq();
        }
    }

    pub fn state_seq(&self) -> u64 {
        self.state_seq
    }

    pub fn load(&mut self) -> Result<(), String> {
        let Some(dir) = self.state_dir.clone() else {
            return Ok(());
        };
        let Some(saved) = state::load(&dir)? else {
            return Ok(());
        };
        Engine::new(saved.profile.clone()).map_err(|e| e.to_string())?;
        self.profile = Some(saved.profile);
        self.armed_resume = saved.enabled;
        if saved.enabled {
            self.message = "Waiting for the app to say hello before remapping starts again.".into();
        }
        Ok(())
    }

    pub fn status(&self) -> NativeStatus {
        NativeStatus {
            state: self.state.clone(),
            message: self.message.clone(),
            driver_ready: self.enabled,
            // Windows has no input-monitoring permission to ask for.
            input_monitoring_granted: true,
            helper_installed: true,
            enabled: self.enabled,
            // One low-level hook covers every keyboard, so it reports as a single source.
            captured_devices: usize::from(self.enabled),
            profile_title: self.profile.as_ref().map(|p| p.title.clone()),
            active_layers: self.active_layers.clone(),
            state_seq: self.state_seq,
            protocol_version: 1,
        }
    }

    /// True once a `restart` was answered and the delay passed; the process should exit.
    pub fn restart_due(&self, now: u64) -> bool {
        self.restart_at.is_some_and(|t| now >= t)
    }

    pub fn handle(&mut self, request: Result<Request, String>, authorized: bool, now: u64) -> Response {
        let result = request.and_then(|r| self.request(r, authorized, now));
        Response { ok: result.is_ok(), status: self.status(), error: result.err() }
    }

    fn request(&mut self, r: Request, authorized: bool, now: u64) -> Result<(), String> {
        if !matches!(r.command.as_str(), "status" | "watch") && !authorized {
            return Err("Changes need the Ultimate Keyboards app running as this Windows user".into());
        }
        if authorized {
            self.lease = Some(now);
            if r.command == "status" && self.armed_resume {
                self.armed_resume = false;
                self.start(now)?;
            }
        }
        if self.restart_at.is_some() && !matches!(r.command.as_str(), "status" | "watch") {
            return Err("The keyboard service is restarting; wait for a fresh status.".into());
        }
        match r.command.as_str() {
            "status" | "watch" => Ok(()),
            "restart" => {
                self.release("stopped", "The keyboard service is restarting. Remapping stays off until you turn it on.");
                self.persist()?;
                self.restart_at = Some(now + RESTART_DELAY_MS);
                Ok(())
            }
            "disable" => {
                self.release("stopped", "Remapping is off. Your keyboard works as normal.");
                self.persist()
            }
            "apply" => {
                if self.synthetic && r.enable == Some(true) {
                    return Err("Test mode never remaps keys; enable=true is not allowed".into());
                }
                let profile = r.profile.ok_or("apply needs a complete profile")?;
                Engine::new(profile.clone()).map_err(|e| e.to_string())?;
                self.release("stopped", "Profile saved. Remapping is still off.");
                self.profile = Some(profile);
                self.bump_seq();
                if r.enable == Some(true) {
                    if let Err(e) = self.start(now) {
                        let _ = self.persist();
                        return Err(e);
                    }
                }
                if let Err(e) = self.persist() {
                    self.release("error", "Could not save your settings, so remapping was turned off.");
                    return Err(e);
                }
                Ok(())
            }
            _ => Err("Unknown command".into()),
        }
    }

    fn start(&mut self, now: u64) -> Result<(), String> {
        if self.synthetic {
            return Err("Test mode never remaps keys; enable=true is not allowed".into());
        }
        let profile = self.profile.clone().ok_or("Apply a profile before turning remapping on")?;
        if self.lease.is_none_or(|t| now.saturating_sub(t) > LEASE_MS) {
            return Err("The app must be connected before remapping can start".into());
        }
        if let Err(e) = self.host.preflight() {
            self.release("driver_unavailable", &e);
            return Err(e);
        }
        let engine = Engine::new(profile).map_err(|e| e.to_string())?;
        if let Err(e) = self.host.install_hook() {
            self.release("driver_unavailable", &e);
            return Err(e);
        }
        self.engine = Some(engine);
        self.enabled = true;
        self.state = "running".into();
        self.message = "Remapping is on for all keyboards. Windows can't tell your laptop keyboard from other keyboards, so any keyboard you plug in is remapped too.".into();
        self.bump_seq();
        Ok(())
    }

    /// Stops remapping and gives Windows back a keyboard with nothing held: engine reset,
    /// every injected key up, hook removed. Safe to call at any time, repeatedly.
    pub fn fail_open(&mut self, state: &str, message: &str) {
        let was_enabled = self.enabled || self.armed_resume;
        self.release(state, message);
        self.save = was_enabled;
    }

    fn release(&mut self, state: &str, message: &str) {
        if let Some(mut engine) = self.engine.take() {
            for e in engine.reset() {
                self.apply_output(e);
            }
        }
        for usage in std::mem::take(&mut self.held) {
            self.host.send(usage, false);
        }
        self.host.remove_hook();
        self.phys.clear();
        self.repeat.clear();
        self.active_layers.clear();
        self.enabled = false;
        self.armed_resume = false;
        self.state = state.into();
        self.message = message.into();
        self.bump_seq();
    }

    /// Mirrors one engine output into `held` and `SendInput`. Duplicate transitions are dropped.
    fn apply_output(&mut self, e: OutputEvent) -> bool {
        let changed = if e.down { self.held.insert(e.usage) } else { self.held.remove(&e.usage) };
        !changed || self.host.send(e.usage, e.down)
    }

    fn emit(&mut self, events: Vec<OutputEvent>) -> bool {
        for e in events {
            if !self.apply_output(e) {
                self.fail_open("error", "Windows refused a key press, so remapping was turned off. Your keyboard works as normal.");
                return false;
            }
        }
        true
    }

    /// A physical key transition from the hook. `usage` came from `keymap::usage_from_event`.
    pub fn key(&mut self, usage: u16, down: bool, now: u64) -> KeyAction {
        let Some(engine) = self.engine.as_mut() else {
            return KeyAction::Pass;
        };
        let events = if down {
            if !self.phys.insert(usage) {
                // Auto-repeat: Windows only repeats what it sees, so repeat the output ourselves.
                let held = self.repeat.get(&usage).copied().filter(|u| self.held.contains(u));
                if let Some(u) = held {
                    if !self.host.send(u, true) {
                        self.fail_open("error", "Windows refused a key press, so remapping was turned off. Your keyboard works as normal.");
                    }
                }
                return KeyAction::Swallow;
            }
            let events = engine.process(KeyEvent { usage, down, at_ms: now });
            if let Some(out) = events.iter().rev().find(|e| e.down && !is_modifier(e.usage)) {
                self.repeat.insert(usage, out.usage);
            }
            events
        } else {
            // An up for a key we never saw go down (it was pressed before remapping started):
            // swallowing it would leave that key stuck down in Windows.
            if !self.phys.remove(&usage) {
                return KeyAction::Pass;
            }
            self.repeat.remove(&usage);
            engine.process(KeyEvent { usage, down, at_ms: now })
        };
        if self.emit(events) {
            self.sync_layers();
            KeyAction::Swallow
        } else {
            KeyAction::Pass
        }
    }

    /// Timers: lease expiry and the engine's hold/combo deadlines. Returns the next
    /// absolute deadline (ms) the caller must come back for, if any.
    pub fn tick(&mut self, now: u64) -> Option<u64> {
        if self.enabled && self.lease.is_none_or(|t| now.saturating_sub(t) > LEASE_MS) {
            self.fail_open("stopped", "The app stopped answering, so remapping was turned off. Your keyboard works as normal.");
            return None;
        }
        let engine = self.engine.as_mut()?;
        let events = engine.tick(now);
        let next = engine.next_deadline_ms();
        if !self.emit(events) {
            return None;
        }
        self.sync_layers();
        next
    }

    /// Serialized profile to write outside the service lock after a fail-open.
    pub fn take_save(&mut self) -> Option<(PathBuf, Vec<u8>)> {
        if !std::mem::take(&mut self.save) {
            return None;
        }
        Some((self.state_dir.clone()?, self.snapshot()?))
    }

    fn snapshot(&self) -> Option<Vec<u8>> {
        let saved = Saved { version: 1, profile: self.profile.clone()?, enabled: self.enabled };
        serde_json::to_vec(&saved).ok()
    }

    fn persist(&self) -> Result<(), String> {
        match (&self.state_dir, self.snapshot()) {
            (Some(dir), Some(bytes)) if !self.synthetic => state::write(dir, &bytes),
            _ => Ok(()),
        }
    }
}

impl<H: Host> Drop for Service<H> {
    fn drop(&mut self) {
        self.release("stopped", "The keyboard service stopped.");
    }
}

/// Windows 10 22H2 is build 19045; every Windows 11 build is higher.
pub fn check_windows_build(build: u32) -> Result<(), String> {
    if build >= 19045 {
        Ok(())
    } else {
        Err("Remapping needs Windows 10 version 22H2 or newer. Update Windows, then turn it on again.".into())
    }
}
