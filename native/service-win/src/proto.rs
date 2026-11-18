//! IPC contract shared with the macOS service (`native/service/README.md`):
//! one newline-terminated JSON request, one newline-terminated response, at most 1 MiB.
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use ultimate_keyboards_engine::Profile;

pub const MAX_MESSAGE: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub command: String,
    pub profile: Option<Profile>,
    pub enable: Option<bool>,
    pub since: Option<u64>,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStatus {
    pub state: String,
    pub message: String,
    pub driver_ready: bool,
    pub input_monitoring_granted: bool,
    pub helper_installed: bool,
    pub enabled: bool,
    pub captured_devices: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_title: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub active_layers: Vec<String>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub state_seq: u64,
    pub protocol_version: u32,
}

#[derive(Serialize)]
pub struct Response {
    pub ok: bool,
    pub status: NativeStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn parse_request(bytes: &[u8]) -> Result<Request, String> {
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
        "status" | "watch" | "apply" | "disable" | "restart"
    ) {
        return Err("Unknown command".into());
    }
    if request.command != "apply" && (request.profile.is_some() || request.enable.is_some()) {
        return Err("Only apply accepts profile/enable".into());
    }
    if request.command != "watch" && request.since.is_some() {
        return Err("Only watch accepts since".into());
    }
    Ok(request)
}

/// Reads one newline-terminated request; never buffers more than 1 MiB plus one byte.
pub fn read_request(reader: impl Read) -> Result<Request, String> {
    let mut line = Vec::new();
    BufReader::new(reader.take(MAX_MESSAGE as u64 + 1))
        .read_until(b'\n', &mut line)
        .map_err(|e| e.to_string())?;
    if line.len() > MAX_MESSAGE {
        return Err("IPC message exceeds 1 MiB".into());
    }
    if line.last() != Some(&b'\n') {
        return Err("Expected newline-terminated request".into());
    }
    parse_request(&line)
}

pub fn encode_response(response: &Response) -> Vec<u8> {
    let mut json = serde_json::to_vec(response).expect("response serializes");
    json.push(b'\n');
    json
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_malformed_oversized_and_unknown_fields() {
        for bad in [
            &b"{"[..],
            br#"{"version":2,"command":"status"}"#,
            br#"{"version":1,"command":"nope"}"#,
            br#"{"version":1,"command":"status","extra":1}"#,
            br#"{"version":1,"command":"disable","enable":true}"#,
            br#"{"version":1,"command":"status","profile":{"version":1,"rules":[]}}"#,
        ] {
            assert!(parse_request(bad).is_err(), "{}", String::from_utf8_lossy(bad));
        }
        assert!(parse_request(&vec![b' '; MAX_MESSAGE + 1]).is_err());
    }

    #[test]
    fn newline_frame_is_required_and_bounded() {
        assert!(read_request(&b"{\"version\":1,\"command\":\"status\"}"[..]).is_err());
        assert!(read_request(&b"{\"version\":1,\"command\":\"status\"}\n"[..]).is_ok());
        let mut big = vec![b' '; MAX_MESSAGE];
        big.push(b'\n');
        assert!(read_request(&big[..]).unwrap_err().contains("1 MiB"));
        // a message of exactly 1 MiB including the newline is accepted
        let mut exact = br#"{"version":1,"command":"status"}"#.to_vec();
        exact.resize(MAX_MESSAGE - 1, b' ');
        exact.push(b'\n');
        assert!(read_request(&exact[..]).is_ok());
    }

    #[test]
    fn apply_carries_a_profile_and_status_serializes_camel_case() {
        let r = parse_request(
            br#"{"version":1,"command":"apply","enable":true,"profile":{"version":1,"rules":[]}}"#,
        )
        .unwrap();
        assert_eq!(r.enable, Some(true));
        assert!(r.profile.is_some());
        let status = NativeStatus {
            state: "stopped".into(),
            message: "m".into(),
            driver_ready: false,
            input_monitoring_granted: true,
            helper_installed: true,
            enabled: false,
            captured_devices: 0,
            profile_title: None,
            active_layers: Vec::new(),
            state_seq: 0,
            protocol_version: 1,
        };
        let json = encode_response(&Response { ok: true, status, error: None });
        assert_eq!(json.last(), Some(&b'\n'));
        let text = String::from_utf8(json).unwrap();
        assert!(text.contains("\"driverReady\":false") && text.contains("\"protocolVersion\":1"));
        assert!(!text.contains("profileTitle") && !text.contains("error"));
    }
}
