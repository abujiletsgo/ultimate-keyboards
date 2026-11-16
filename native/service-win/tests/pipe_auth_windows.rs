//! Windows only (B-7): a client running as the same user must be authorized to change remapping.
//! The service once checked identity before reading the request, which Windows refuses
//! (ERROR_CANNOT_IMPERSONATE), so every change, the app's included, was turned away.
//! This drives the real binary over a real named pipe; CI runs it on windows-latest and windows-11-arm.
#![cfg(windows)]

use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[test]
fn same_user_client_is_authorized_over_the_real_pipe() {
    let suffix = format!("auth-{}", std::process::id());
    let mut child = Command::new(env!("CARGO_BIN_EXE_ultimate-keyboards-remapper-win"))
        .args(["--test-pipe", &suffix])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("start the service");
    let path = format!(r"\\.\pipe\ultimatekeyboards-remapper-test-{suffix}");

    let deadline = Instant::now() + Duration::from_secs(10);
    let mut pipe = loop {
        match OpenOptions::new().read(true).write(true).open(&path) {
            Ok(p) => break p,
            Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => {
                let _ = child.kill();
                panic!("pipe never opened: {e}");
            }
        }
    };
    // `disable` is a change: it needs authorization but works in the synthetic test service.
    pipe.write_all(b"{\"version\":1,\"command\":\"disable\"}\n").expect("send");
    let mut line = String::new();
    BufReader::new(&pipe).read_line(&mut line).expect("reply");
    drop(pipe);
    let _ = child.kill();

    let reply: serde_json::Value = serde_json::from_str(&line).expect("JSON reply");
    assert_eq!(reply["ok"], true, "same-user change refused: {line}");
}
