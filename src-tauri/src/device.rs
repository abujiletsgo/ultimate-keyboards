//! USB keyboard detection and the two byte bridges the frontend protocol
//! clients (src/lib/device/) talk through:
//!
//! * **Serial** (ZMK Studio): USB CDC-ACM, `/dev/cu.usbmodem*` on macOS. The
//!   frames (SOF 0xAB / ESC 0xAC / EOF 0xAD, protobuf from
//!   zmkfirmware/zmk-studio-messages, MIT) are built and parsed in TS by
//!   `@zmkfirmware/zmk-studio-ts-client`; Rust only moves bytes. A reader
//!   thread emits `serial-data` {id, bytes} and `serial-closed` {id, error}.
//! * **Raw HID** (VIA / Vial): usage page 0xFF60, usage 0x61, 32-byte reports
//!   (qmk_firmware quantum/via.h). `hid_transact` writes one report and reads
//!   one back.
//!
//! macOS privacy: enumerating HID devices through hidapi does not call
//! `IOHIDManagerOpen`, so it does not trigger the Input Monitoring prompt;
//! `IOHIDDeviceOpen` on a keyboard/keypad collection would. We therefore only
//! ever open an interface whose usage page is 0xFF60 and which does not also
//! expose a keyboard or keypad usage (see [`validate_hid_path`]). hidapi is
//! built with `macos-shared-device` so the open is non-exclusive (the default
//! exclusive open fails on a keyboard the system already holds).

use std::collections::HashMap;
use std::ffi::CString;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use tauri::Emitter;

/// Default ZMK USB ids (zmk app/Kconfig: ZMK_USB_VID / ZMK_USB_PID).
pub const ZMK_VID: u16 = 0x1D50;
pub const ZMK_PID: u16 = 0x615E;
/// VIA / Vial raw HID interface (qmk_firmware quantum/via.h, RAW_USAGE_*).
pub const RAW_USAGE_PAGE: u16 = 0xFF60;
pub const RAW_USAGE_ID: u16 = 0x61;
/// Vial keyboards put this magic in their USB serial number (vial-qmk).
pub const VIAL_SERIAL_MAGIC: &str = "vial:f64c2b3c";
/// One raw HID report.
pub const REPORT_LEN: usize = 32;
/// Compressed vial.json must be smaller than this.
pub const VIAL_DEF_MAX: usize = 1_000_000;
/// Decompressed vial.json must be smaller than this.
pub const VIAL_JSON_MAX: usize = 8_000_000;
/// At most this many bridges of each kind open at once.
pub const MAX_OPEN: usize = 8;

const HID_USAGE_PAGE_DESKTOP: u16 = 0x01;
const HID_USAGE_MOUSE: u16 = 0x02;
const HID_USAGE_KEYBOARD: u16 = 0x06;
const HID_USAGE_KEYPAD: u16 = 0x07;

// ── Id bookkeeping ──────────────────────────────────────────────────────────

/// Small handle table: ids start at 1, are never 0, and are not reused while
/// the old holder is still open.
pub struct Registry<T> {
    next: u32,
    items: HashMap<u32, Arc<T>>,
    cap: usize,
}

impl<T> Registry<T> {
    pub fn new(cap: usize) -> Self {
        Self { next: 1, items: HashMap::new(), cap }
    }

    pub fn insert(&mut self, item: T) -> Result<u32, String> {
        if self.items.len() >= self.cap {
            return Err(format!("too many open connections (limit {})", self.cap));
        }
        loop {
            let id = self.next;
            self.next = self.next.wrapping_add(1);
            if self.next == 0 {
                self.next = 1;
            }
            if id != 0 && !self.items.contains_key(&id) {
                self.items.insert(id, Arc::new(item));
                return Ok(id);
            }
        }
    }

    pub fn get(&self, id: u32) -> Option<Arc<T>> {
        self.items.get(&id).cloned()
    }

    pub fn remove(&mut self, id: u32) -> Option<Arc<T>> {
        self.items.remove(&id)
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn values(&self) -> impl Iterator<Item = &Arc<T>> {
        self.items.values()
    }
}

// ── Path validation ─────────────────────────────────────────────────────────

/// A serial path is accepted only if it is a macOS call-out device
/// (`/dev/cu.*`), has no traversal or odd characters, and is one of the ports
/// `serialport::available_ports()` reports right now.
pub fn validate_serial_path(path: &str, known: &[String]) -> Result<(), String> {
    if !path.starts_with("/dev/cu.") {
        return Err("serial path must start with /dev/cu.".into());
    }
    if path.contains("..") || path[5..].contains('/') || path.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("invalid serial path".into());
    }
    if !known.iter().any(|k| k == path) {
        return Err(format!("{path} is not a connected serial port"));
    }
    Ok(())
}

/// One enumerated HID interface: (path, usage_page, usage).
pub type HidUsage = (String, u16, u16);

/// A HID path is accepted only if some enumerated collection with that path is
/// the VIA/Vial raw interface (0xFF60 / 0x61) and no collection with that path
/// is a keyboard or keypad (opening those triggers macOS Input Monitoring).
pub fn validate_hid_path(path: &str, entries: &[HidUsage]) -> Result<(), String> {
    let same: Vec<&HidUsage> = entries.iter().filter(|(p, _, _)| p == path).collect();
    if same.is_empty() {
        return Err("that HID device is not connected".into());
    }
    if !same.iter().any(|(_, page, usage)| *page == RAW_USAGE_PAGE && *usage == RAW_USAGE_ID) {
        return Err("only the VIA/Vial raw HID interface (usage page 0xFF60) can be opened".into());
    }
    if same
        .iter()
        .any(|(_, page, usage)| *page == HID_USAGE_PAGE_DESKTOP && (*usage == HID_USAGE_KEYBOARD || *usage == HID_USAGE_KEYPAD))
    {
        return Err("refusing to open an interface that is also a keyboard (would need Input Monitoring)".into());
    }
    Ok(())
}

// ── Detection ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsbKeyboard {
    pub vid: u16,
    pub pid: u16,
    pub product: Option<String>,
    pub manufacturer: Option<String>,
    pub serial: Option<String>,
    /// `/dev/cu.usbmodem…` when the device exposes a CDC-ACM port (ZMK Studio).
    pub serial_port: Option<String>,
    /// hidapi path of the 0xFF60 raw interface (VIA / Vial).
    pub raw_hid_path: Option<String>,
    pub is_zmk: bool,
    pub is_vial: bool,
    /// Has a HID keyboard collection (not opened, only enumerated).
    pub has_keyboard_interface: bool,
    /// "Pointer reports detected": a HID mouse collection is present. Mouse keys
    /// create one too, so this never means a trackball or trackpad is fitted.
    pub pointer_reports: bool,
}

/// Serial-port side of one device, from `serialport::available_ports()`.
#[derive(Debug, Clone)]
pub struct SerialSeen {
    pub path: String,
    pub vid: u16,
    pub pid: u16,
    pub serial: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

/// HID side of one collection, from hidapi's device list (USB bus only).
#[derive(Debug, Clone)]
pub struct HidSeen {
    pub path: String,
    pub vid: u16,
    pub pid: u16,
    pub serial: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub usage_page: u16,
    pub usage: u16,
}

fn non_empty(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// Merge serial ports and HID collections into one entry per physical device,
/// keyed by (vid, pid, serial) — or (vid, pid, product) when there is no
/// serial number. Only devices that look like keyboards are kept: ZMK ids, a
/// raw HID interface, or a keyboard collection. Apple's own devices are skipped.
pub fn merge_devices(serial: &[SerialSeen], hid: &[HidSeen]) -> Vec<UsbKeyboard> {
    fn key(vid: u16, pid: u16, serial: &Option<String>, product: &Option<String>) -> String {
        match serial {
            Some(s) => format!("{vid:04x}:{pid:04x}:s:{s}"),
            None => format!("{vid:04x}:{pid:04x}:p:{}", product.clone().unwrap_or_default()),
        }
    }
    let mut order: Vec<String> = Vec::new();
    let mut map: HashMap<String, UsbKeyboard> = HashMap::new();
    fn entry(map: &mut HashMap<String, UsbKeyboard>, order: &mut Vec<String>, k: String, vid: u16, pid: u16) -> String {
        if !map.contains_key(&k) {
            order.push(k.clone());
            map.insert(
                k.clone(),
                UsbKeyboard {
                    vid,
                    pid,
                    product: None,
                    manufacturer: None,
                    serial: None,
                    serial_port: None,
                    raw_hid_path: None,
                    is_zmk: false,
                    is_vial: false,
                    has_keyboard_interface: false,
                    pointer_reports: false,
                },
            );
        }
        k
    }
    let mut touched: Vec<(String, Option<String>, Option<String>, Option<String>)> = Vec::new();
    for s in serial {
        let k = entry(&mut map, &mut order, key(s.vid, s.pid, &s.serial, &s.product), s.vid, s.pid);
        touched.push((k.clone(), s.serial.clone(), s.manufacturer.clone(), s.product.clone()));
        let d = map.get_mut(&k).unwrap();
        // macOS lists each CDC port twice (tty. and cu.); keep the cu. one.
        if s.path.starts_with("/dev/cu.") && d.serial_port.is_none() {
            d.serial_port = Some(s.path.clone());
        }
    }
    for h in hid {
        let k = entry(&mut map, &mut order, key(h.vid, h.pid, &h.serial, &h.product), h.vid, h.pid);
        touched.push((k.clone(), h.serial.clone(), h.manufacturer.clone(), h.product.clone()));
        let d = map.get_mut(&k).unwrap();
        if h.usage_page == RAW_USAGE_PAGE && h.usage == RAW_USAGE_ID && d.raw_hid_path.is_none() {
            d.raw_hid_path = Some(h.path.clone());
        }
        if h.usage_page == HID_USAGE_PAGE_DESKTOP && (h.usage == HID_USAGE_KEYBOARD || h.usage == HID_USAGE_KEYPAD) {
            d.has_keyboard_interface = true;
        }
        if h.usage_page == HID_USAGE_PAGE_DESKTOP && h.usage == HID_USAGE_MOUSE {
            d.pointer_reports = true;
        }
    }
    for (k, ser, man, prod) in touched {
        let d = map.get_mut(&k).unwrap();
        if d.serial.is_none() {
            d.serial = ser;
        }
        if d.manufacturer.is_none() {
            d.manufacturer = man;
        }
        if d.product.is_none() {
            d.product = prod;
        }
    }
    order
        .into_iter()
        .filter_map(|k| map.remove(&k))
        .map(|mut d| {
            d.is_zmk = (d.vid == ZMK_VID && d.pid == ZMK_PID)
                || d.manufacturer.as_deref().map(|m| m.eq_ignore_ascii_case("ZMK Project")).unwrap_or(false);
            d.is_vial = d.serial.as_deref().map(|s| s.contains(VIAL_SERIAL_MAGIC)).unwrap_or(false);
            d
        })
        .filter(|d| d.vid != 0x05AC)
        .filter(|d| d.is_zmk || d.raw_hid_path.is_some() || d.has_keyboard_interface)
        .collect()
}

fn scan_serial() -> Vec<SerialSeen> {
    let Ok(ports) = serialport::available_ports() else { return Vec::new() };
    ports
        .into_iter()
        .filter_map(|p| match p.port_type {
            serialport::SerialPortType::UsbPort(u) => Some(SerialSeen {
                path: p.port_name,
                vid: u.vid,
                pid: u.pid,
                serial: non_empty(u.serial_number),
                manufacturer: non_empty(u.manufacturer),
                product: non_empty(u.product),
            }),
            _ => None,
        })
        .collect()
}

fn scan_hid() -> Result<Vec<HidSeen>, String> {
    let api = hidapi::HidApi::new().map_err(|e| format!("HID enumeration failed: {e}"))?;
    Ok(api
        .device_list()
        .filter(|d| matches!(d.bus_type(), hidapi::BusType::Usb))
        .map(|d| HidSeen {
            path: d.path().to_string_lossy().into_owned(),
            vid: d.vendor_id(),
            pid: d.product_id(),
            serial: non_empty(d.serial_number().map(str::to_string)),
            manufacturer: non_empty(d.manufacturer_string().map(str::to_string)),
            product: non_empty(d.product_string().map(str::to_string)),
            usage_page: d.usage_page(),
            usage: d.usage(),
        })
        .collect())
}

/// Every USB keyboard currently connected, one entry per physical device.
/// Enumeration only: nothing is opened.
#[tauri::command(async)]
pub fn list_usb_keyboards() -> Result<Vec<UsbKeyboard>, String> {
    let serial = scan_serial();
    let hid = scan_hid()?;
    Ok(merge_devices(&serial, &hid))
}

// ── Serial bridge (ZMK Studio) ──────────────────────────────────────────────

struct SerialConn {
    path: String,
    writer: Mutex<Box<dyn serialport::SerialPort>>,
    stop: Arc<AtomicBool>,
}

static SERIAL: LazyLock<Mutex<Registry<SerialConn>>> = LazyLock::new(|| Mutex::new(Registry::new(MAX_OPEN)));

#[derive(Clone, serde::Serialize)]
struct SerialData {
    id: u32,
    bytes: Vec<u8>,
}

#[derive(Clone, serde::Serialize)]
struct SerialClosed {
    id: u32,
    error: Option<String>,
}

/// Open a ZMK Studio serial port. Returns a bridge id; incoming bytes arrive
/// as `serial-data` events until `serial-closed`.
#[tauri::command(async)]
pub fn serial_open(app: tauri::AppHandle, path: String) -> Result<u32, String> {
    let known: Vec<String> = scan_serial().into_iter().map(|s| s.path).collect();
    validate_serial_path(&path, &known)?;
    if SERIAL.lock().unwrap().values().any(|c| c.path == path) {
        return Err(format!("{path} is already open"));
    }
    let mut port = serialport::new(path.as_str(), 115_200)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| format!("cannot open {path}: {e}"))?;
    // CDC-ACM ignores the baud rate; some device stacks only send once DTR is up.
    let _ = port.write_data_terminal_ready(true);
    let mut reader = port.try_clone().map_err(|e| format!("cannot open {path}: {e}"))?;
    let stop = Arc::new(AtomicBool::new(false));
    let id = SERIAL.lock().unwrap().insert(SerialConn {
        path: path.clone(),
        writer: Mutex::new(port),
        stop: stop.clone(),
    })?;

    std::thread::Builder::new()
        .name(format!("serial-reader-{id}"))
        .spawn(move || {
            let mut buf = [0u8; 1024];
            let error = loop {
                if stop.load(Ordering::SeqCst) {
                    break None;
                }
                match reader.read(&mut buf) {
                    Ok(0) => continue,
                    Ok(n) => {
                        let _ = app.emit("serial-data", SerialData { id, bytes: buf[..n].to_vec() });
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(e) => break Some(format!("serial port closed: {e}")),
                }
            };
            SERIAL.lock().unwrap().remove(id);
            let _ = app.emit("serial-closed", SerialClosed { id, error });
        })
        .map_err(|e| {
            SERIAL.lock().unwrap().remove(id);
            format!("cannot start serial reader: {e}")
        })?;
    Ok(id)
}

#[tauri::command(async)]
pub fn serial_write(id: u32, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.len() > 65_536 {
        return Err("serial write too large".into());
    }
    let conn = SERIAL.lock().unwrap().get(id).ok_or("serial port is not open")?;
    let mut w = conn.writer.lock().unwrap();
    w.write_all(&bytes).map_err(|e| format!("serial write failed: {e}"))?;
    w.flush().map_err(|e| format!("serial write failed: {e}"))
}

/// Stop the reader; it removes the bridge and emits `serial-closed` {error: null}.
#[tauri::command]
pub fn serial_close(id: u32) -> Result<(), String> {
    let conn = SERIAL.lock().unwrap().get(id).ok_or("serial port is not open")?;
    conn.stop.store(true, Ordering::SeqCst);
    Ok(())
}

// ── Raw HID bridge (VIA / Vial) ─────────────────────────────────────────────

struct HidConn {
    dev: Mutex<hidapi::HidDevice>,
}

static HID: LazyLock<Mutex<Registry<HidConn>>> = LazyLock::new(|| Mutex::new(Registry::new(MAX_OPEN)));

#[tauri::command(async)]
pub fn hid_open(path: String) -> Result<u32, String> {
    let api = hidapi::HidApi::new().map_err(|e| format!("HID enumeration failed: {e}"))?;
    let entries: Vec<HidUsage> = api
        .device_list()
        .map(|d| (d.path().to_string_lossy().into_owned(), d.usage_page(), d.usage()))
        .collect();
    validate_hid_path(&path, &entries)?;
    let c = CString::new(path.clone()).map_err(|_| "invalid HID path".to_string())?;
    let dev = api.open_path(&c).map_err(|e| format!("cannot open the keyboard's raw HID interface: {e}"))?;
    HID.lock().unwrap().insert(HidConn { dev: Mutex::new(dev) })
}

/// Pad a payload to one 32-byte report and prefix report id 0 for hidapi.
pub fn frame_report(report: &[u8]) -> Result<[u8; REPORT_LEN + 1], String> {
    if report.len() > REPORT_LEN {
        return Err(format!("HID report longer than {REPORT_LEN} bytes"));
    }
    let mut out = [0u8; REPORT_LEN + 1];
    out[1..1 + report.len()].copy_from_slice(report);
    Ok(out)
}

fn transact(dev: &hidapi::HidDevice, report: &[u8], timeout_ms: i32) -> Result<Vec<u8>, String> {
    let framed = frame_report(report)?;
    // Drop stale input so the reply we read belongs to this request.
    let mut scratch = [0u8; REPORT_LEN];
    for _ in 0..16 {
        match dev.read_timeout(&mut scratch, 0) {
            Ok(n) if n > 0 => continue,
            _ => break,
        }
    }
    dev.write(&framed).map_err(|e| format!("HID write failed: {e}"))?;
    let mut buf = [0u8; REPORT_LEN];
    let n = dev
        .read_timeout(&mut buf, timeout_ms.clamp(1, 5000))
        .map_err(|e| format!("HID read failed: {e}"))?;
    if n == 0 {
        return Err("No response from the keyboard (timed out)".into());
    }
    Ok(buf[..n].to_vec())
}

/// Send one report (≤32 bytes, zero-padded) and return the reply.
#[tauri::command(async)]
pub fn hid_transact(id: u32, report: Vec<u8>, timeout_ms: Option<i32>) -> Result<Vec<u8>, String> {
    let conn = HID.lock().unwrap().get(id).ok_or("HID device is not open")?;
    let dev = conn.dev.lock().unwrap();
    transact(&dev, &report, timeout_ms.unwrap_or(500))
}

#[tauri::command]
pub fn hid_close(id: u32) -> Result<(), String> {
    HID.lock().unwrap().remove(id).map(|_| ()).ok_or_else(|| "HID device is not open".to_string())
}

// ── Vial definition ─────────────────────────────────────────────────────────

/// Vial commands (vial-qmk quantum/vial.h): prefix 0xFE, then
/// 0x01 get_size → u32 LE; 0x02 get_def(block u32 LE) → 32 bytes.
pub const VIAL_PREFIX: u8 = 0xFE;
pub const VIAL_GET_SIZE: u8 = 0x01;
pub const VIAL_GET_DEF: u8 = 0x02;

/// Writer that fails once more than `limit` bytes are written (zip-bomb guard).
struct Capped {
    buf: Vec<u8>,
    limit: usize,
}

impl Write for Capped {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        if self.buf.len() + data.len() > self.limit {
            return Err(std::io::Error::other("definition too large"));
        }
        self.buf.extend_from_slice(data);
        Ok(data.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Decompress Vial's definition blob (xz, or legacy lzma-alone) to JSON text.
pub fn decompress_vial(blob: &[u8]) -> Result<String, String> {
    let mut out = Capped { buf: Vec::new(), limit: VIAL_JSON_MAX };
    if lzma_rs::xz_decompress(&mut std::io::BufReader::new(blob), &mut out).is_err() {
        out.buf.clear();
        lzma_rs::lzma_decompress(&mut std::io::BufReader::new(blob), &mut out)
            .map_err(|e| format!("cannot decompress the Vial definition: {e}"))?;
    }
    let text = String::from_utf8(out.buf).map_err(|_| "Vial definition is not UTF-8".to_string())?;
    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("Vial definition is not JSON: {e}"))?;
    Ok(text)
}

/// Pull the compressed definition through `send` (one report in, one out),
/// following vial-gui's loop: get_size, then 32-byte blocks until done.
pub fn fetch_vial_definition(send: &mut dyn FnMut(&[u8]) -> Result<Vec<u8>, String>) -> Result<String, String> {
    let r = send(&[VIAL_PREFIX, VIAL_GET_SIZE])?;
    if r.len() < 4 {
        return Err("short reply to Vial get_size".into());
    }
    let size = u32::from_le_bytes([r[0], r[1], r[2], r[3]]) as usize;
    if size == 0 || size == u32::MAX as usize {
        return Err("This keyboard did not return a Vial definition".into());
    }
    if size > VIAL_DEF_MAX {
        return Err(format!("Vial definition is too large ({size} bytes)"));
    }
    let mut blob = Vec::with_capacity(size);
    let mut block: u32 = 0;
    while blob.len() < size {
        let b = block.to_le_bytes();
        let data = send(&[VIAL_PREFIX, VIAL_GET_DEF, b[0], b[1], b[2], b[3]])?;
        if data.is_empty() {
            return Err("empty reply to Vial get_def".into());
        }
        let take = (size - blob.len()).min(data.len()).min(REPORT_LEN);
        blob.extend_from_slice(&data[..take]);
        block += 1;
    }
    decompress_vial(&blob)
}

/// Read and decompress vial.json from an open raw HID bridge.
#[tauri::command(async)]
pub fn vial_definition(id: u32) -> Result<String, String> {
    let conn = HID.lock().unwrap().get(id).ok_or("HID device is not open")?;
    let dev = conn.dev.lock().unwrap();
    let mut send = |r: &[u8]| transact(&dev, r, 1000);
    fetch_vial_definition(&mut send)
}

// ── Metadata fetch (QMK usb.json, VIA definitions) ──────────────────────────

/// Only these public, read-only data sources can be fetched. The webview CSP
/// has no network access, so the TS side comes through here.
pub const FETCH_ALLOWED: &[&str] = &[
    "https://keyboards.qmk.fm/v1/",
    "https://usevia.app/definitions/",
    "https://raw.githubusercontent.com/the-via/keyboards/",
];

pub fn validate_fetch_url(url: &str) -> Result<(), String> {
    if url.len() > 512
        || url.contains("..")
        || url.contains('@')
        || url.contains('\\')
        || url.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err("URL not allowed".into());
    }
    if !FETCH_ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err("URL not allowed".into());
    }
    Ok(())
}

/// Fetch a small JSON document from an allow-listed host (via /usr/bin/curl,
/// https only, 20 s, 16 MB). Returns the body; HTTP errors → Err("HTTP 404").
#[tauri::command(async)]
pub fn fetch_device_metadata(url: String) -> Result<String, String> {
    validate_fetch_url(&url)?;
    let out = std::process::Command::new("/usr/bin/curl")
        .args([
            "--silent",
            "--show-error",
            "--location",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--max-time",
            "20",
            "--max-filesize",
            "16000000",
            "--write-out",
            "\n%{http_code}",
            "--",
            &url,
        ])
        .output()
        .map_err(|e| format!("cannot run curl: {e}"))?;
    if !out.status.success() {
        return Err(format!("network error: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let text = String::from_utf8(out.stdout).map_err(|_| "response is not UTF-8".to_string())?;
    let (body, code) = text.rsplit_once('\n').unwrap_or(("", text.as_str()));
    if code.trim() != "200" {
        return Err(format!("HTTP {}", code.trim()));
    }
    Ok(body.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_ids_start_at_one_and_are_unique() {
        let mut r: Registry<&str> = Registry::new(3);
        let a = r.insert("a").unwrap();
        let b = r.insert("b").unwrap();
        assert_eq!(a, 1);
        assert_eq!(b, 2);
        assert_eq!(*r.get(a).unwrap().as_ref(), "a");
        assert!(r.remove(a).is_some());
        assert!(r.get(a).is_none());
        assert!(r.remove(a).is_none());
        let c = r.insert("c").unwrap();
        assert_ne!(c, b);
        assert_ne!(c, 0);
    }

    #[test]
    fn registry_enforces_cap() {
        let mut r: Registry<u8> = Registry::new(2);
        r.insert(1).unwrap();
        let id = r.insert(2).unwrap();
        assert!(r.insert(3).is_err());
        r.remove(id);
        assert!(r.insert(3).is_ok());
        assert_eq!(r.len(), 2);
    }

    #[test]
    fn registry_skips_zero_and_live_ids_on_wrap() {
        let mut r: Registry<u8> = Registry::new(4);
        r.next = u32::MAX;
        let a = r.insert(1).unwrap();
        assert_eq!(a, u32::MAX);
        let b = r.insert(2).unwrap();
        assert_eq!(b, 1);
        r.next = u32::MAX; // collide with a live id
        let c = r.insert(3).unwrap();
        assert_eq!(c, 2);
    }

    #[test]
    fn serial_path_validation() {
        let known = vec!["/dev/cu.usbmodem1101".to_string(), "/dev/tty.usbmodem1101".to_string()];
        assert!(validate_serial_path("/dev/cu.usbmodem1101", &known).is_ok());
        assert!(validate_serial_path("/dev/tty.usbmodem1101", &known).is_err());
        assert!(validate_serial_path("/dev/cu.usbmodem9999", &known).is_err());
        assert!(validate_serial_path("/dev/cu.../disk0", &known).is_err());
        assert!(validate_serial_path("/dev/cu.x/y", &["/dev/cu.x/y".into()]).is_err());
        assert!(validate_serial_path("/etc/passwd", &known).is_err());
        assert!(validate_serial_path("/dev/cu.usb modem", &["/dev/cu.usb modem".into()]).is_err());
    }

    #[test]
    fn hid_path_validation() {
        let e: Vec<HidUsage> = vec![
            ("A".into(), 0x01, 0x06),
            ("A".into(), 0x0C, 0x01),
            ("B".into(), 0xFF60, 0x61),
            ("C".into(), 0xFF60, 0x61),
            ("C".into(), 0x01, 0x06),
            ("D".into(), 0xFF60, 0x62),
        ];
        assert!(validate_hid_path("B", &e).is_ok());
        assert!(validate_hid_path("A", &e).is_err(), "keyboard interface");
        assert!(validate_hid_path("C", &e).is_err(), "raw interface shared with keyboard");
        assert!(validate_hid_path("D", &e).is_err(), "wrong usage");
        assert!(validate_hid_path("Z", &e).is_err(), "not connected");
    }

    #[test]
    fn report_framing_pads_and_prefixes() {
        let f = frame_report(&[0x01]).unwrap();
        assert_eq!(f.len(), 33);
        assert_eq!(f[0], 0);
        assert_eq!(f[1], 1);
        assert!(f[2..].iter().all(|b| *b == 0));
        assert!(frame_report(&[0u8; 33]).is_err());
    }

    fn hid(path: &str, usage_page: u16, usage: u16, serial: Option<&str>) -> HidSeen {
        HidSeen {
            path: path.into(),
            vid: 0x4653,
            pid: 0x0001,
            serial: serial.map(str::to_string),
            manufacturer: Some("foostan".into()),
            product: Some("Corne".into()),
            usage_page,
            usage,
        }
    }

    #[test]
    fn merge_one_entry_per_device() {
        let serial = vec![
            SerialSeen { path: "/dev/tty.usbmodem1".into(), vid: ZMK_VID, pid: ZMK_PID, serial: Some("ABC".into()), manufacturer: Some("ZMK Project".into()), product: Some("Corne".into()) },
            SerialSeen { path: "/dev/cu.usbmodem1".into(), vid: ZMK_VID, pid: ZMK_PID, serial: Some("ABC".into()), manufacturer: Some("ZMK Project".into()), product: Some("Corne".into()) },
        ];
        let hids = vec![
            HidSeen { path: "z1".into(), vid: ZMK_VID, pid: ZMK_PID, serial: Some("ABC".into()), manufacturer: Some("ZMK Project".into()), product: Some("Corne".into()), usage_page: 1, usage: 6 },
            hid("v1", 1, 6, Some("vial:f64c2b3c")),
            hid("v2", 0xFF60, 0x61, Some("vial:f64c2b3c")),
            hid("v3", 1, 2, Some("vial:f64c2b3c")),
            HidSeen { path: "apple".into(), vid: 0x05AC, pid: 1, serial: None, manufacturer: None, product: Some("Magic".into()), usage_page: 1, usage: 6 },
            HidSeen { path: "mouse".into(), vid: 0x046D, pid: 2, serial: None, manufacturer: None, product: Some("Mouse".into()), usage_page: 1, usage: 2 },
        ];
        let out = merge_devices(&serial, &hids);
        assert_eq!(out.len(), 2);
        let zmk = &out[0];
        assert!(zmk.is_zmk && !zmk.is_vial);
        assert_eq!(zmk.serial_port.as_deref(), Some("/dev/cu.usbmodem1"));
        assert!(zmk.has_keyboard_interface);
        let vial = &out[1];
        assert!(vial.is_vial && !vial.is_zmk);
        assert_eq!(vial.raw_hid_path.as_deref(), Some("v2"));
        assert!(vial.pointer_reports);
        assert_eq!(vial.product.as_deref(), Some("Corne"));
    }

    fn xz(data: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        lzma_rs::xz_compress(&mut std::io::BufReader::new(data), &mut out).unwrap();
        out
    }

    #[test]
    fn vial_definition_chunked_fetch() {
        let json = br#"{"name":"Test","matrix":{"rows":1,"cols":2},"layouts":{"keymap":[["0,0","0,1"]]}}"#;
        let blob = xz(json);
        let mut calls = 0;
        let mut send = |r: &[u8]| -> Result<Vec<u8>, String> {
            calls += 1;
            assert_eq!(r[0], VIAL_PREFIX);
            if r[1] == VIAL_GET_SIZE {
                let mut out = (blob.len() as u32).to_le_bytes().to_vec();
                out.resize(32, 0);
                return Ok(out);
            }
            assert_eq!(r[1], VIAL_GET_DEF);
            let block = u32::from_le_bytes([r[2], r[3], r[4], r[5]]) as usize;
            let mut out: Vec<u8> = blob.iter().skip(block * 32).take(32).copied().collect();
            out.resize(32, 0xEE); // padding past the end must be ignored
            Ok(out)
        };
        let text = fetch_vial_definition(&mut send).unwrap();
        assert_eq!(text.as_bytes(), json);
        assert_eq!(calls, 1 + blob.len().div_ceil(32));
    }

    #[test]
    fn vial_definition_rejects_oversize_and_garbage() {
        let mut big = |_: &[u8]| -> Result<Vec<u8>, String> { Ok(vec![0xFF, 0xFF, 0xFF, 0x0F]) };
        assert!(fetch_vial_definition(&mut big).unwrap_err().contains("too large"));
        assert!(decompress_vial(b"not xz").is_err());
    }

    #[test]
    fn fetch_url_allowlist() {
        assert!(validate_fetch_url("https://keyboards.qmk.fm/v1/usb.json").is_ok());
        assert!(validate_fetch_url("https://usevia.app/definitions/v3/1234.json").is_ok());
        assert!(validate_fetch_url("http://keyboards.qmk.fm/v1/usb.json").is_err());
        assert!(validate_fetch_url("https://keyboards.qmk.fm.evil.com/v1/").is_err());
        assert!(validate_fetch_url("https://keyboards.qmk.fm/v1/../x").is_err());
        assert!(validate_fetch_url("https://usevia.app/definitions/@evil").is_err());
        assert!(validate_fetch_url("https://example.com/").is_err());
    }
}
