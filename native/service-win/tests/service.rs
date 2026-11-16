//! The service core against a fake host: no Windows needed.
use std::sync::{Arc, Mutex};
use uk_remapper_win::proto::{parse_request, Response};
use uk_remapper_win::service::{check_windows_build, Host, KeyAction, Service, LEASE_MS};

#[derive(Default)]
struct Log {
    sent: Vec<(u16, bool)>,
    hooked: bool,
    installs: u32,
    refuse_send: bool,
    refuse_hook: Option<String>,
    refuse_preflight: Option<String>,
}
#[derive(Clone, Default)]
struct Fake(Arc<Mutex<Log>>);
impl Host for Fake {
    fn preflight(&mut self) -> Result<(), String> {
        self.0.lock().unwrap().refuse_preflight.clone().map_or(Ok(()), Err)
    }
    fn install_hook(&mut self) -> Result<(), String> {
        let mut l = self.0.lock().unwrap();
        if let Some(e) = l.refuse_hook.clone() {
            return Err(e);
        }
        l.hooked = true;
        l.installs += 1;
        Ok(())
    }
    fn remove_hook(&mut self) {
        self.0.lock().unwrap().hooked = false;
    }
    fn send(&mut self, usage: u16, down: bool) -> bool {
        let mut l = self.0.lock().unwrap();
        l.sent.push((usage, down));
        !l.refuse_send
    }
}
impl Fake {
    fn sent(&self) -> Vec<(u16, bool)> {
        std::mem::take(&mut self.0.lock().unwrap().sent)
    }
    fn hooked(&self) -> bool {
        self.0.lock().unwrap().hooked
    }
}

const CAPS: u16 = 57;
const ESC: u16 = 41;
const A: u16 = 4;
const LCTRL: u16 = 224;
const PROFILE: &str = r#"{"version":1,"title":"Laptop","rules":[
  {"type":"simple","fromKey":"caps_lock","toKey":"escape"},
  {"type":"homerow_mod","fromKey":"a","tapKey":"a","modKey":"left_control"}]}"#;

fn req(command: &str, enable: Option<bool>, profile: bool) -> String {
    let mut parts = vec![format!(r#""version":1,"command":"{command}""#)];
    if let Some(e) = enable {
        parts.push(format!(r#""enable":{e}"#));
    }
    if profile {
        parts.push(format!(r#""profile":{PROFILE}"#));
    }
    format!("{{{}}}\n", parts.join(","))
}
fn call(s: &mut Service<Fake>, line: &str, authorized: bool, now: u64) -> Response {
    s.handle(parse_request(line.as_bytes()), authorized, now)
}
fn running() -> (Service<Fake>, Fake) {
    let host = Fake::default();
    let mut s = Service::new(host.clone(), None, false);
    let r = call(&mut s, &req("apply", Some(true), true), true, 0);
    assert!(r.ok, "{:?}", r.error);
    (s, host)
}

#[test]
fn apply_without_enable_validates_and_stays_off() {
    let host = Fake::default();
    let mut s = Service::new(host.clone(), None, false);
    let r = call(&mut s, &req("apply", None, true), true, 0);
    assert!(r.ok && !r.status.enabled && r.status.profile_title.as_deref() == Some("Laptop"));
    assert!(!host.hooked());
    let bad = r#"{"version":1,"command":"apply","profile":{"version":1,"rules":[{"type":"simple","fromKey":"fn","toKey":"a"}]}}"#;
    let r = call(&mut s, &format!("{bad}\n"), true, 1);
    assert!(!r.ok);
    assert_eq!(r.status.profile_title.as_deref(), Some("Laptop"), "bad snapshot keeps the old one");
}

#[test]
fn only_the_same_user_app_may_change_things_or_refresh_the_lease() {
    let host = Fake::default();
    let mut s = Service::new(host.clone(), None, false);
    assert!(call(&mut s, &req("status", None, false), false, 0).ok);
    for line in [req("apply", Some(true), true), req("disable", None, false), req("restart", None, false)] {
        let r = call(&mut s, &line, false, 1);
        assert!(!r.ok && r.error.unwrap().contains("Windows user"));
    }
    // an unauthenticated status did not start a lease, so enable still needs the app first
    assert!(!host.hooked());
}

#[test]
fn enabling_remaps_with_one_hook_reported_as_all_keyboards() {
    let (s, host) = running();
    let st = s.status();
    assert!(host.hooked() && st.enabled && st.state == "running" && st.captured_devices == 1);
    assert!(st.message.contains("all keyboards") && !st.message.to_lowercase().contains("karabiner"));
    assert!(st.input_monitoring_granted && st.helper_installed && st.protocol_version == 1);
}

#[test]
fn a_remapped_key_is_swallowed_and_its_output_sent_with_repeat() {
    let (mut s, host) = running();
    assert_eq!(s.key(CAPS, true, 10), KeyAction::Swallow);
    assert_eq!(host.sent(), [(ESC, true)]);
    assert_eq!(s.key(CAPS, true, 40), KeyAction::Swallow); // typematic repeat
    assert_eq!(host.sent(), [(ESC, true)]);
    assert_eq!(s.key(CAPS, false, 80), KeyAction::Swallow);
    assert_eq!(host.sent(), [(ESC, false)]);
    // a key up that began before remapping must reach Windows or the key sticks
    assert_eq!(s.key(30, false, 90), KeyAction::Pass);
    assert!(host.sent().is_empty());
}

#[test]
fn modifier_outputs_do_not_auto_repeat() {
    let (mut s, host) = running();
    s.key(A, true, 0);
    let due = s.tick(500);
    assert_eq!(due, None);
    assert_eq!(host.sent(), [(LCTRL, true)]);
    s.key(A, true, 600); // repeat of a held mod
    assert!(host.sent().is_empty());
    s.key(A, false, 700);
    assert_eq!(host.sent(), [(LCTRL, false)]);
}

#[test]
fn fail_open_releases_every_held_key_removes_the_hook_and_saves_disabled() {
    let dir = std::env::temp_dir().join(format!("uk-win-svc-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let host = Fake::default();
    let mut s = Service::new(host.clone(), Some(dir.clone()), false);
    assert!(call(&mut s, &req("apply", Some(true), true), true, 0).ok);
    s.key(CAPS, true, 5);
    host.sent();
    s.fail_open("stopped", "Your PC is going to sleep.");
    assert_eq!(host.sent(), [(ESC, false)]);
    assert!(!host.hooked());
    let st = s.status();
    assert!(!st.enabled && st.state == "stopped" && st.message.contains("sleep"));
    assert_eq!(s.key(CAPS, true, 6), KeyAction::Pass);
    let (path, bytes) = s.take_save().expect("fail-open saves");
    uk_remapper_win::state::write(&path, &bytes).unwrap();
    assert!(s.take_save().is_none());
    let mut again = Service::new(Fake::default(), Some(dir.clone()), false);
    again.load().unwrap();
    assert!(again.status().profile_title.is_some() && !again.status().enabled);
    // disabled on disk: a heartbeat must not resume it
    assert!(call(&mut again, &req("status", None, false), true, 0).status.state == "stopped");
    drop(s);
    drop(again);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn a_refused_send_turns_remapping_off() {
    let (mut s, host) = running();
    host.0.lock().unwrap().refuse_send = true;
    assert_eq!(s.key(CAPS, true, 5), KeyAction::Pass);
    let st = s.status();
    assert!(!st.enabled && st.state == "error" && !host.hooked());
}

#[test]
fn lease_expiry_fails_open() {
    let (mut s, host) = running();
    s.key(CAPS, true, 1);
    host.sent();
    assert_eq!(s.tick(LEASE_MS), None);
    assert!(s.status().enabled, "exactly at the limit is still fine");
    s.tick(LEASE_MS + 1);
    assert!(!s.status().enabled && !host.hooked());
    assert_eq!(host.sent(), [(ESC, false)]);
}

#[test]
fn heartbeats_keep_the_lease_alive() {
    let (mut s, _host) = running();
    for t in (3000..60_000).step_by(3000) {
        assert!(call(&mut s, &req("status", None, false), true, t).ok);
        s.tick(t);
        assert!(s.status().enabled, "t={t}");
    }
}

#[test]
fn restart_disables_then_waits_for_the_delay() {
    let (mut s, host) = running();
    assert!(call(&mut s, &req("restart", None, false), true, 1000).ok);
    assert!(!host.hooked() && !s.status().enabled);
    assert!(!s.restart_due(1299) && s.restart_due(1300));
    assert!(!call(&mut s, &req("disable", None, false), true, 1100).ok);
    assert!(call(&mut s, &req("status", None, false), true, 1100).ok);
}

#[test]
fn disable_releases_keys_and_keeps_the_profile() {
    let (mut s, host) = running();
    s.key(CAPS, true, 1);
    host.sent();
    assert!(call(&mut s, &req("disable", None, false), true, 2).ok);
    assert_eq!(host.sent(), [(ESC, false)]);
    assert!(!host.hooked() && s.status().profile_title.is_some());
}

#[test]
fn a_saved_enabled_profile_resumes_only_on_an_authenticated_heartbeat() {
    let dir = std::env::temp_dir().join(format!("uk-win-resume-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    {
        let mut s = Service::new(Fake::default(), Some(dir.clone()), false);
        assert!(call(&mut s, &req("apply", Some(true), true), true, 0).ok);
        std::mem::forget(s); // a crash: Drop never ran, so "enabled" stays on disk
    }
    let host = Fake::default();
    let mut s = Service::new(host.clone(), Some(dir.clone()), false);
    s.load().unwrap();
    assert!(!host.hooked());
    assert!(!call(&mut s, &req("status", None, false), false, 10).status.enabled);
    assert!(!host.hooked());
    let r = call(&mut s, &req("status", None, false), true, 20);
    assert!(r.ok && r.status.enabled && host.hooked());
    drop(s);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn hook_or_windows_version_problems_say_so_and_leave_the_keyboard_alone() {
    let host = Fake::default();
    host.0.lock().unwrap().refuse_hook = Some("Windows would not start the keyboard hook.".into());
    let mut s = Service::new(host.clone(), None, false);
    let r = call(&mut s, &req("apply", Some(true), true), true, 0);
    assert!(!r.ok && r.status.state == "driver_unavailable" && !r.status.enabled);
    host.0.lock().unwrap().refuse_hook = None;
    host.0.lock().unwrap().refuse_preflight = check_windows_build(19044).err();
    let r = call(&mut s, &req("apply", Some(true), true), true, 1);
    assert!(!r.ok && r.error.unwrap().contains("22H2") && host.0.lock().unwrap().installs == 0);
    assert!(check_windows_build(19045).is_ok() && check_windows_build(26100).is_ok());
}

#[test]
fn synthetic_mode_never_hooks() {
    let host = Fake::default();
    let mut s = Service::new(host.clone(), None, true);
    assert!(call(&mut s, &req("apply", None, true), true, 0).ok);
    assert!(!call(&mut s, &req("apply", Some(true), true), true, 1).ok);
    assert!(!host.hooked() && host.0.lock().unwrap().installs == 0);
}

#[test]
fn dropping_the_service_releases_the_hook() {
    let (s, host) = running();
    drop(s);
    assert!(!host.hooked());
}
