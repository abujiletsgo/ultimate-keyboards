//! Windows remapper service. Everything except `win` is platform-neutral and unit-tested
//! on any OS; `win` (hook, `SendInput`, named pipe, session and power events) builds on Windows only.
pub mod guard;
pub mod keymap;
pub mod proto;
pub mod service;
pub mod state;
#[cfg(windows)]
pub mod win;
