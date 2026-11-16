# Windows remapper service

`ultimate-keyboards-remapper-win` is the Windows counterpart of `native/service`: a per-user
background process that remaps the keyboard with the shared `native/engine` crate (no fork).
Windows 10 22H2 and Windows 11, x64 and ARM64. No driver and no administrator rights.

```
physical key -> WH_KEYBOARD_LL (own thread) -> engine -> SendInput (tagged) -> apps
                      ^ app <-> named pipe \\.\pipe\ultimatekeyboards-remapper (JSON)
```

## What is shared and what is Windows-only

Everything except `src/win/` is platform-neutral and unit-tested on macOS and Windows alike:
`proto` (IPC contract), `keymap` (HID usage <-> scan code), `guard` (watchdog arithmetic),
`state` (saved profile), `service` (enable/disable, lease, engine feed, every fail-open path).
`src/win/` holds the Win32 calls behind `cfg(windows)`: `hook` (the hook thread and `SendInput`),
`pipe`, `events` (lock, sleep, shutdown) and `mod` (threads and watchdog).

## IPC

Same contract as `native/service/README.md`: one newline-terminated JSON request
(`status`, `apply`, `disable`, `restart`; `apply` carries the complete profile and an explicit
`enable`), one newline-terminated response `{ok, status, error?}`, 1 MiB maximum, 2 s I/O budget,
16 clients. Status fields are unchanged and camelCase.

- Endpoint `\\.\pipe\ultimatekeyboards-remapper`. Created with `FILE_FLAG_FIRST_PIPE_INSTANCE` (a second
  service fails loudly), `PIPE_REJECT_REMOTE_CLIENTS`, and a DACL that grants access to the current user only.
  Every connection is checked again: the client's token SID must equal the service's. Others get
  read-only `status`. One consequence: with fast user switching a second signed-in user cannot start their own service while the first is running.
- The app's `status` heartbeat (every 3 s) refreshes a 15 s lease. Lease lost: remapping turns off.
- `restart` turns remapping off, saves, answers, and exits after 300 ms; the app relaunches the process.
- A saved profile lives in `%LOCALAPPDATA%\com.ultimatekeyboards.app\Native\state\profile.json`
  (written atomically). A profile saved as enabled resumes only after an authenticated heartbeat.
- Status mapping: `driverReady` = hook installed; `inputMonitoringGranted` is always `true` (Windows has
  no such permission); `capturedDevices` is 1 while running. Failures use `driver_unavailable` (hook did not
  start, Windows older than 22H2) and `error` (stall, hook removed, output refused).

## All keyboards, not just the built-in one

`WH_KEYBOARD_LL` events carry no device identity, so Windows cannot tell the laptop keyboard from a USB or
Bluetooth one (this is different from macOS, which remaps only `Built-In=true` devices). While remapping is on,
every keyboard is remapped, a CrossCorne or split keyboard included. The status message says "all keyboards"
and the app should say so too. Telling devices apart needs Raw Input; the hook cannot be correlated with it
reliably, so it is deliberately not attempted. Because everything shares one engine, a key held on one keyboard and pressed on another is one stream.

## Keys and output

The engine speaks USB HID page-7 usages; `keymap.rs` converts to and from Windows set-1 scan codes plus the
extended bit. Output uses `KEYEVENTF_SCANCODE` (Pause uses its virtual key), so the active layout and IME decide
what a key types. Keys the engine does not model (media keys, Hangul/Hanja, the fake shift Windows adds around the
numpad, AltGr's fake Ctrl) pass through untouched. Win/Alt/Ctrl map to the engine's `command`/`option`/`control`
(`left_gui` / `left_alt` work as names too).

- Every injected event carries `dwExtraInfo = 0x554B0001` and is skipped on re-entry. Input injected by other
  programs (other remappers, remote sessions, on-screen keyboards) is passed through, never remapped.
- Windows only repeats keys it sees pressed, so a held remapped key is repeated by the service: each physical
  repeat re-sends the key the press produced (modifiers do not repeat). A dual-role key that resolved late
  (tap-hold decided after another key) does not repeat; this is a known gap.
- A key released after remapping started but pressed before it is let through, so nothing sticks.

## Fail-open

Every path below resets the engine, sends key-up for every injected key still down, removes the hook, saves
"disabled", and reports why. Remapping then stays off until the app turns it on again (same as macOS).

| Trigger | Where |
| --- | --- |
| Hook thread silent 1 s (stalled callback or message loop) | watchdog (`guard.rs`) |
| Hook silently removed by Windows | watchdog: after 2 s without key traffic it injects a key-up of the unassigned VK 0xE8 tagged `0x554B0002`; the hook swallows it, and 0.5 s without seeing it means the hook is gone |
| Lock, logoff, user switch, RDP connect/disconnect | `WM_WTSSESSION_CHANGE` |
| Sleep, and resume (Modern Standby may skip the suspend message) | `WM_POWERBROADCAST` |
| Shutdown, logoff, Ctrl+C, console close | `WM_ENDSESSION`, `SetConsoleCtrlHandler` |
| Output refused by `SendInput`, lease expired, `disable`, `apply`, process exit | service core |
| A panic anywhere | panic hook: unhook and key-up for all keys |
| Service lock unreachable for 1 s | emergency path: unhook and key-up for all keys without the lock |

If the process is killed hard, Windows removes the hook, but a key we injected and still held (for example a
home-row Ctrl) stays down until it is pressed and released physically.

## Build and test

```sh
cargo test --manifest-path native/service-win/Cargo.toml            # any OS
cargo check --manifest-path native/service-win/Cargo.toml --target x86_64-pc-windows-msvc
cargo check --manifest-path native/service-win/Cargo.toml --target aarch64-pc-windows-msvc
```

Run on Windows: `ultimate-keyboards-remapper-win` (production), `--check` (Windows build, state folder, pipe name;
touches nothing), `--test-pipe <suffix>` (a throwaway pipe and a service that never hooks or saves, for IPC checks).

## Not yet verified (needs a Windows machine)

The Win32 layer compiles for both targets but has not run. Still to check on the ZenBook and the ARM VM: pipe ACL and
SID check from the Tauri app, hook install and SendInput round trip, repeat feel, Modern Standby sleep/wake,
lock screen, the 1.5 s hook-stall keystroke accounting, AltGr layouts, and the Korean IME keys.
