# Type on Android with the laptop keyboard

Status: spec, 2026-11-15 (KE-79, feeds KE-81). Ultimate Keyboards ships its **own Android keyboard (`InputMethodService`) app**, wireless over the same `_ukeys._tcp` wire and DBC1/DBS1 pairing as the iPhone keyboard ([type-on-iphone.md](./type-on-iphone.md), KE-50..54), driven from both **Windows** (`service-win`, Win10 22H2+ / Win11 x64 & ARM64) and **macOS** senders.

Non-goal (Tom, 2026-11-15): **not** Unisinc Flow and **not** a handoff to `world.hyly.unisinc`. Ultimate Keyboards never declares `AccessibilityService`, never uses USB Open Accessory or `adb`, and never injects pointer events.

## What the person gets

1. Install the free **hyly Keyboards** Android app (`world.hyly.keyboards`), turn on its keyboard in a two-step guided preflight (Step 1: enable in Android's keyboard list with a plain-words privacy note before Android's system dialog; Step 2: pick it in the native keyboard sheet).
2. Pair once: the Mac or Windows laptop shows a QR code; the phone scans it, verifies the laptop's fingerprint, and remembers it after approval on the laptop.
3. On the laptop, press the phone-typing hotkey (Mac default: tap both `⌘` keys; Windows default: tap both `Ctrl` keys; changeable in Settings) or pick the phone in the tray / menu bar. The laptop's remapping engine runs first—so **home-row mods, layers, and combos (`KL`=Enter, `IO`=Backspace, `WE`=Esc)** work identically when typing on the phone—while the laptop shows a small `"Typing on Tom's Fold"` pill. Press the hotkey again (or hold `Esc`) to return to laptop typing.
4. On the phone, a compact single-row Studio 4 bar sits at the bottom of the screen (`"Typing from Tom's ZenBook · EN"` with a one-tap **`Phone keyboard`** button that returns immediately to Samsung Keyboard or Gboard).

Ultimate Keyboards Pro ($24 one-time, launch $19) is checked on the Mac or Windows sender; the Android app itself has no paywall or account requirement.

## Hard limits and Android / One UI realities (state in the app and on the site)

| Area | Platform reality (verified) | What the app does and shows |
|---|---|---|
| **Standard password fields** (`TYPE_TEXT_VARIATION_PASSWORD`, `WEB_PASSWORD`, `VISIBLE_PASSWORD`, `NUMBER_VARIATION_PASSWORD`) | **Differs from iOS:** Android and Samsung One UI keep the user's selected `InputMethodService` active in ordinary app and web password boxes instead of swapping in the system keyboard. | Works over the encrypted link under strict password rules: bypass Hangul composition (`commitText` directly), show no text preview on the IME bar, store zero history/dictionary (`IME_FLAG_NO_PERSONALIZED_LEARNING` honored by construction). Paste (`⌘V`/`Ctrl+V`) works; Android blocks copy/cut out of masked fields. |
| **Banking, card, and security-keypad apps** | Many banking/payment apps (especially Korean apps using Raonsecure TouchEn mTranskey, Eversafe, or AhnLab keypads) draw a custom `View` keypad and open no editable `InputConnection` (`EditorInfo.inputType == TYPE_NULL` or no `onStartInput`). | IME reports `blockedReason = "custom-keypad"`. Laptop pill says `"This field uses its own keypad on <Phone>"`; keys stay on the laptop. |
| **Lock screen, Direct Boot, and biometric credential prompts** | Before first unlock after reboot (Direct Boot) and on system PIN/password lock screens or `ConfirmDeviceCredential`, Android uses the system keypad. Keys/trust must never live in Device Encrypted (DE) storage. | `android:directBootAware="false"`. Identity keys and trusted peers stay in Credential Encrypted (CE) storage + Android Keystore. Laptop pill says `"Unlock <Phone> to type there"`. |
| **Samsung Knox / Secure Folder / Work Profile** | On Galaxy Z Fold 8 (One UI / Android 17), Secure Folder and managed Work Profiles run under separate Android `UserHandle`s where Knox restricts third-party IMEs or defaults to Samsung Keyboard. | Personal-profile IME cannot cross into Secure Folder unless separately installed and permitted inside that profile; documented in setup help. |
| **Walking away from the laptop (global IME selection)** | Unlike iOS per-field fallback, Android keeps the chosen IME globally until switched. An invisible 0 px IME leaves the user with no keys when they pick up the phone. | IME always renders a compact single-row Studio 4 bar (`onEvaluateInputViewShown() = true`, `onEvaluateFullscreenMode() = false`). When the laptop is idle or out of reach, the bar shows `"Not typing from <Laptop>"` with a primary **`Use phone keyboard`** button calling `switchToPreviousInputMethod()` (one tap back to Samsung Keyboard/Gboard, long-press for `showInputMethodPicker()`). |
| **Samsung Keyboard & Fold 8 cover ↔ inner screen** | Folding/unfolding Galaxy Z Fold 8 changes `smallestScreenWidthDp`, `screenLayout`, `screenSize`, and `density` live while an editor stays focused. One UI also shows a nav-bar keyboard switcher icon when supported. | Declare `supportsSwitchingToNextInputMethod="true"` in `res/xml/uk_keyboard.xml` and handle all display/fold `configChanges` in place on both `MainActivity` and the IME service. Connection + Hangul state live outside the input `View`, so folding/unfolding mid-word drops zero keys. |
| **No `⌘Tab` / `Alt+Tab`, Home, notifications, or mouse pointer** | `InputMethodService` speaks only to the focused editor's `InputConnection` (plus `requestHideSelf(0)`). | Not offered; site and setup state `"typing and text editing"`. |
| **No Apple AWDL peer-to-peer** | Mac↔iPhone `_ukeys._tcp` can fall back to Apple's proprietary AWDL (`includePeerToPeer = true`) without Wi-Fi; Android and Windows cannot join AWDL. | Require shared Wi-Fi (including phone hotspot or offline travel router) or a paired **NetBird** peer (`100.64.0.0/10`, never Tailscale). |

## Architecture

```
Laptop keys ─▶ native remapper service
  (Mac: IOHID seize          └─ Rust Engine (home-row mods, layers, combos)
   Win: WH_KEYBOARD_LL)           ├─ Laptop mode: Mac virtual HID / Win SendInput
                                  └─ Phone mode: OutputEvents + lang + sender_os
                                        │
                                  shared Rust `native/wire` (DBC1 auth + DBS1 AES-256-GCM)
                                  ├─ Mac advertise: Bonjour `_ukeys._tcp`
                                  └─ Win advertise: Win32 `DnsServiceRegister` (`windns.h`)
                                        │  encrypted TCP (`TCP_NODELAY`) over LAN Wi-Fi or NetBird
                                        ▼
                            Android app (`world.hyly.keyboards`, minSdk 29 .. Android 17)
                            ├─ Setup / QR / Peers UI: Expo RN (`@sawayai/studio-native`, Studio 4)
                            └─ `UltimateKeyboardService` (`InputMethodService`, pure Kotlin + native View)
                                 └─ sender-aware key & Hangul 2-set translator ─▶ `InputConnection`
```

### 1. Shared wire and pairing (`native/wire`, shared with KE-52/53 and KE-78)

Per `tasks/uk-windows/intent.md` ("Share code first: engine, wire, UI"), Mac and Windows senders share one pure-Rust crate (`native/wire`) implementing the exact byte-level protocol used by both the iOS keyboard extension and the Android IME:

- **QR onboarding payload (`v=2`):**
  `ukeys://pair?v=2&fp=<64 lowercase hex>&token=<64 lowercase hex>&net=<1..4 ipv4/prefix>&addr=<ipv4>:<port>`
  - `fp`: lowercase SHA-256 hex of the laptop's P-256 SEC1 uncompressed (65-byte) identity public key.
  - `token`: 32-byte one-use CSPRNG secret (valid 120 s, atomically consumed; never sent in cleartext on the wire).
  - `net`: laptop's active IPv4 CIDR(s) so the phone checks `"Same Wi-Fi"` before dialling without requesting `ACCESS_FINE_LOCATION` (which Android 10+ and macOS require to read Wi-Fi SSIDs).
  - `addr`: optional direct `<ipv4>:<port>` dial hint used during initial pairing if router client-multicast filtering or a Windows network profile blocks mDNS UDP 5353. Route hints never grant trust; DBC1 fingerprint verification decides.
- **DBC1 identity handshake (ported from Unisinc `connection/PROTOCOL.md` with shared test vectors):**
  - Phone is TCP client; laptop is TCP server (`10 s` socket handshake deadline; `120 s` only while awaiting interactive laptop pairing approval).
  - Phone hello (`200 B`): `"DBC1"` + `version` (`1` = trusted reconnect, `2` = QR pair) + `mode` (`1` = keyboard) + `proof` (`32 B` `HMAC-SHA256(qrToken, context)` on v2, `0x00 * 32` on v1) + `clientNonce` (`32 B`) + `clientIdentityPub` (`65 B`) + `clientEphemeralPub` (`65 B`).
  - Laptop response: `serverIdentityPub` (`65 B`) + `serverEphemeralPub` (`65 B`) + `serverNonce` (`32 B`) + `uint16be sigLen` + DER ECDSA-SHA256 signature over domain label + transcript. Phone verifies `SHA256(serverIdentityPub) == expectedFingerprint` **before** accepting the signature.
  - Phone proof: `uint16be sigLen` + DER ECDSA-SHA256 signature over client domain label + transcript.
  - Laptop explicit ack (`32 B`): `HMAC-SHA256(sessionSecret, accept_or_refusal_label || transcript)` (`accepted`, or refusal `declined` / `expired` / `failed` / `unknown-peer` / `paused`). Neither side persists trust until `accepted` completes.
  - `sessionSecret = HKDF-SHA256(ECDH(ephemeral), salt = SHA256(transcript), info, len = 32)`, immediately seeding **DBS1** length-prefixed **AES-256-GCM** frames (`4 B` big-endian length + `11 B` AAD header `[version=1, mode=1, dir, uint64be seq]` + ciphertext + `16 B` GCM tag).
- **One physical device, one peer:**
  - After DBS1 opens, the phone sends `hello-peer` with `deviceKey = HMAC-SHA256(SHA256("UltimateKeyboards/device-key/v1" || ANDROID_ID), laptopFingerprintBytes)` and user-visible `deviceName` (`<= 80` chars); the laptop replies with `senderOs` (`"macos"` | `"windows"`), `senderName`, `protocolVersion = 1`, and its own `deviceKey` (`IOPlatformUUID` on macOS, `MachineGuid` under `HKLM\SOFTWARE\Microsoft\Cryptography` on Windows). Reinstalling the Android app generates a new Keystore keypair with the same `deviceKey`, automatically superseding the stale entry on the laptop instead of leaving duplicate phones.
- **Session messages inside DBS1:**
  - `key` (laptop → phone): `{ seq: u64, usage: u16, down: bool, mods: u8, lang: "en" | "ko" }` — post-engine USB HID Page `0x07` usage (`4..=231`), active modifier bitmask (`Shift=1, Ctrl=2, Alt/Opt=4, Gui/Cmd=8, Caps=16`), and current laptop input source.
  - `phone-mode` (laptop → phone): `{ active: bool }` — entering/leaving phone typing. Leaving or switching devices always flushes `Engine::reset()` / `all-up` so no modifier ever sticks.
  - `editor-state` (phone → laptop): `{ active: bool, secure: bool, blockedReason: null | "no-field" | "custom-keypad" | "ime-not-selected" }` — sent immediately on connect and on every `onStartInput` / `onFinishInput` / `onDestroy`. While `active == false`, the laptop **never** swallows or queues keystrokes silently (`KE-53` rule): keys stay on the laptop and the laptop pill states the exact step on the phone.
  - `ping` / `pong` + `goodbye` (`reason`: `laptop-sleep`, `laptop-quit`, `forgotten`, `ime-switched`).

### 2. LAN discovery from Windows and Mac senders

- **Service type:** `_ukeys._tcp` (TXT `v=1`, `sid=<16-hex session nonce>`, `os=macos|windows`). Service instance name is a display hint only, never an identity.
- **macOS sender:** `NWListener` / `DNSServiceRegister` for `_ukeys._tcp` on an ephemeral IPv4/IPv6 TCP port (`TCP_NODELAY = true`), `includePeerToPeer = true` (serves iPhone over AWDL and Android over LAN mDNS simultaneously). Identity key + peer list stored in macOS Keychain.
- **Windows sender (`service-win` / `src-tauri`, Win10 22H2+ & Win11 x64/ARM64):**
  - Advertises `_ukeys._tcp.local` via native Win32 **`DnsServiceRegister`** (`windns.h`, linked against `dnsapi.dll`, built into Windows 10 1903+). Requires **zero** Apple Bonjour installer or extra background daemon, and Windows automatically deregisters the record if the process terminates; clean shutdown calls `DnsServiceDeRegister`.
  - **Windows Firewall & Public Wi-Fi preflight (verified blocker):** Windows Defender Firewall drops inbound mDNS (UDP 5353) and inbound TCP when the active Wi-Fi network is categorized as **Public** (Windows's default on many networks).
    1. The Windows installer (`KE-75`) adds a scoped inbound firewall rule for the signed Ultimate Keyboards sender executable on `Private` networks.
    2. Before displaying the pairing QR, Windows preflight checks `GetNetworkConnectivityLevel` / `INetwork::GetCategory` (`NLM_NETWORK_CATEGORY_PUBLIC` vs `PRIVATE`) and listener reachability: if `Public`, the pairing sheet shows an in-place warning (`"Windows set this Wi-Fi to Public, which blocks phone discovery"`) with a one-click button to open Windows Wi-Fi network properties, while still populating `&addr=<lan-ipv4>:<port>` in the QR so direct TCP works where allowed.
  - Identity private key and trusted peer store are encrypted at rest via **Windows DPAPI (`CryptProtectData`, user scope)**.
- **Android discovery & transport (`world.hyly.keyboards`):**
  - **Network binding (VPN-safe):** `ConnectivityManager.registerNetworkCallback` tracks `NetworkCapabilities.TRANSPORT_WIFI` with `removeCapability(NET_CAPABILITY_INTERNET)` (so offline routers and laptop personal hotspots count). Every LAN socket calls `wifiNetwork.bindSocket(socket)` so an active VPN never hijacks local traffic, and dual-stack results prefer IPv4 (`NsdServiceInfo.hostAddresses` on API 34+, `service.host` on API 29–33).
  - **Bounded mDNS browse:** Acquires `WifiManager.MulticastLock` (`CHANGE_WIFI_MULTICAST_STATE`) **only** during a bounded `15–45 s` `NsdManager.discoverServices("_ukeys._tcp.", PROTOCOL_DNS_SD, ...)` window triggered by events (QR scan, saved-route dial miss, `ACTION_SCREEN_ON` / `ACTION_USER_PRESENT`, Wi-Fi `onAvailable`)—never a periodic timer or continuous background scan.
  - **Route order (every candidate verified by DBC1 pinned fingerprint):**
    1. Saved `IPv4:port` when `PhoneWifi` matches the laptop's saved CIDR (`~10 ms` reconnect, zero mDNS wait).
    2. QR `&addr=<ipv4>:<port>` hint (initial v2 pairing only).
    3. Fresh `NsdManager` `_ukeys._tcp` resolved candidate on Wi-Fi.
    4. Optional user-configured **NetBird** hostname/IP (`100.64.0.0/10`) over the system default network when laptop and phone are on isolated guest Wi-Fi or cellular.
  - **Latency & battery:** Socket sets `TCP_NODELAY = true`. While `onStartInputView` is visible and `phone-mode` is active, the IME acquires `WifiManager.WIFI_MODE_FULL_LOW_LATENCY` (API 29+) so 802.11 power-save sleep never adds 50–100 ms spikes, releasing it immediately on `onFinishInputView`, `phone-mode = false`, or `ACTION_SCREEN_OFF`. When the phone screen turns off, the IME closes the socket cleanly (`goodbye`) and sleeps with **zero** wake locks, **zero** foreground-service notification, and **no** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.

### 3. Android app & IME process boundary

- **Package & signing (`~/.claude/refs/developer-accounts.md`):** `world.hyly.keyboards` (`minSdk = 29` Android 10 for 2020+ devices, `targetSdk = 35`, verified through Android 17 One UI on Fold 8). Upload key `~/.config/hyly/keys/keyboards-upload.jks` (`keyboards-upload`, Play App Signing; Play submission is outside the `uk-windows` run per `intent.md`).
- **Strict UI / IME boundary:**
  - **Main app (`MainActivity`):** Expo / React Native on `@sawayai/studio-native` (Studio 4 wallpaper glass, light & dark themes), sharing setup/QR/peer-management screens with the iOS app (`KE-51`) where practical.
  - **`UltimateKeyboardService` (`InputMethodService`):** 100% Kotlin + lightweight native Android `View` strip styled with generated Studio tokens (same pattern as AlarmMe's native ring screens and Unisinc's `SessionUiBoundaryTest`). **Never initialize React Native or the JS runtime from `InputMethodService`:** the IME must cold-bind in `<16 ms`, stay under a few MB of RAM, and hit `8.3 ms` frames at `120 Hz` with its resting state in frame 1 (no entrance fade).
- **Android 14+ (`targetSdk >= 34`) preflight APIs (verified AOSP restriction):**
  - **Never** read `Settings.Secure.ENABLED_INPUT_METHODS` (throws `SecurityException` when `targetSdk >= 34`).
  - **Enabled check:** `context.getSystemService(InputMethodManager::class.java)?.enabledInputMethodList?.any { it.id == ownImeId } == true` (own package is always visible to itself under Android 11+ package visibility).
  - **Selected check:**
    - When `UltimateKeyboardService.instance != null`: true by live binding.
    - Otherwise on API 34+ (Android 14–17): `imm.currentInputMethodInfo?.id == ownImeId`.
    - Otherwise on API 29–33 (Android 10–13, e.g. Galaxy A90 on Android 12): `Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD) == ownImeId`.
  - **Setup actions:** Step 1 opens `Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)`; Step 2 calls `imm.showInputMethodPicker()`; live `onWindowFocusChanged` + `ContentObserver` advances the step automatically as soon as the user flips it.

### 4. Key translation, modifier semantics, and Korean 2-set composition

Grounded in measured Fold 8 (`SM-F971N`, Android 17, One UI) `EditText` behavior from memory `android-modifier-semantics` (`2026-09-23`):
- Android `EditText` interprets **`Ctrl+Backspace` as delete-word**, **`Alt+Backspace` as delete-line**, **`Ctrl+Left/Right` as word move**, **`Alt+Left/Right` as line start/end**, and **`Meta (GUI/Search) + Backspace` as a no-op**.
- Because Mac users press `⌘`/`⌥` chords while Windows users press `Ctrl`/`Home`/`End` chords, the Android IME normalizes shortcuts using the session's `senderOs` (`"macos"` vs `"windows"`), always finishing any active Hangul composition before running an editing or navigation command:

| Intent | MacBook sender (`senderOs = "macos"`) | Windows sender (`senderOs = "windows"`) | Android `InputConnection` execution |
|---|---|---|---|
| Printable ASCII / Shift symbols (`lang = "en"`) | US QWERTY HID `4..=56` (+ `Shift`) | US QWERTY HID `4..=56` (+ `Shift`) | `commitText(char, 1)` |
| Copy / Cut / Paste / Select All | `⌘C` / `⌘X` / `⌘V` / `⌘A` | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+A` | `performContextMenuAction(android.R.id.copy / cut / paste / selectAll)` |
| Undo / Redo | `⌘Z` / `⇧⌘Z` | `Ctrl+Z` / `Ctrl+Y` or `Ctrl+⇧+Z` | `sendKeyEvent(KEYCODE_Z, META_CTRL_ON)` (`\| META_SHIFT_ON` for Redo; no universal context-menu ID across OEMs) |
| Backspace | `Backspace` (`42`, or `I+O` combo) | `Backspace` (`42`, or `I+O` combo) | If composing Hangul: step back one jamo (`한 → 하 → ㅎ → ""`); else `sendKeyEvent(KEYCODE_DEL, 0)` |
| Forward Delete | `Delete` (`76`, `Fn+⌫`) | `Delete` (`76`) | `sendKeyEvent(KEYCODE_FORWARD_DEL, 0)` |
| Delete previous word | `⌥Backspace` | `Ctrl+Backspace` | `sendKeyEvent(KEYCODE_DEL, META_CTRL_ON)` *(verified Fold 8 Android 17)* |
| Delete to line start | `⌘Backspace` | `Ctrl+Shift+Backspace` | `sendKeyEvent(KEYCODE_DEL, META_ALT_ON)` *(verified Fold 8 Android 17)* |
| Move / select by word | `⌥←` / `⌥→` (+ `⇧`) | `Ctrl+←` / `Ctrl+→` (+ `⇧`) | `sendKeyEvent(KEYCODE_DPAD_LEFT/RIGHT, META_CTRL_ON [\| META_SHIFT_ON])` |
| Move / select to line start/end | `⌘←` / `⌘→` (+ `⇧`) | `Home` (`74`) / `End` (`77`) (+ `⇧`) | `sendKeyEvent(KEYCODE_DPAD_LEFT/RIGHT, META_ALT_ON [\| META_SHIFT_ON])` (or `KEYCODE_MOVE_HOME/END` with `META_SHIFT_ON`) |
| Move / select up/down | `↑` / `↓` (+ `⇧`) | `↑` / `↓` (+ `⇧`) | `sendKeyEvent(KEYCODE_DPAD_UP/DOWN, [META_SHIFT_ON])` |
| Enter / Return | `Return` (`40`, or `K+L` combo) | `Enter` (`40`, or `K+L` combo) | Single-line field with `IME_ACTION_{SEARCH,GO,DONE,NEXT,SEND}` (`TYPE_TEXT_FLAG_MULTI_LINE` unset): `performEditorAction(action)`; else `sendKeyEvent(KEYCODE_ENTER, 0)`. (`⇧Enter` commits `"\n"` in multiline fields.) |
| Escape | `Esc` (`41`, or `W+E` combo) | `Esc` (`41`, or `W+E` combo) | If composing: finish composition; else `requestHideSelf(0)`. Hold `Esc` on laptop exits phone mode. |
| Switch `EN` ↔ `한` | Mac input source change (`lang` field) or `⌃Space` | Windows IME mode, `Right Alt` 한/영 (`230`), or `Shift+Space` | Updates active composition mode (`EN` / `한`) and badge on compact IME bar (also tappable on phone). |

- **Chat-app Enter note (from `android-modifier-semantics`):** In multiline chat composers, Enter-to-send is controlled by each chat app's own setting (KakaoTalk provides an in-app "Send with Enter" toggle; Facebook Messenger on Android does not, and `Shift+Enter` cannot force send without Accessibility node clicking, which Tom declined). We follow standard IME semantics (`performEditorAction` when declared on single-line fields, `KEYCODE_ENTER` on multiline composers) and never add Accessibility workarounds.
- **Korean 2-set (`두벌식`) composition:**
  - Pure Kotlin deterministic state machine sharing test vectors with iOS (`KE-54`): `초성/중성/종성`, compound vowels (`ㅘ/ㅙ/ㅚ/ㅝ/ㅞ/ㅟ/ㅢ`), compound finals (`ㄳ/ㄵ/ㄶ/ㄺ/ㄻ/ㄼ/ㄽ/ㄾ/ㄿ/ㅀ/ㅄ`), syllable split on next vowel (`각 + ㅏ → 가가`), and jamo-level Backspace rollback.
  - **Chrome omnibox / autocomplete guard:** While composing, call `ic.setComposingText(syllable, 1)`. When committing a finished syllable to start the next or before Space/Enter, wrap `ic.setComposingText(finalSyllable, 1)` + `ic.finishComposingText()` inside `beginBatchEdit()` / `endBatchEdit()` rather than overwriting a live composing span with `commitText` directly (autocompleting editors like Chrome's address bar drop or duplicate replacements otherwise).

## Situations to design for

- **Several phones/tablets per laptop & two laptops (Mac + Windows) per phone:** Trusted-peer list on both ends; laptop hotkey targets the most recently used phone, tray/menu-bar lists all paired phones; phone's compact bar names whichever laptop currently holds `phone-mode = active` (at most one active sender session at a time; a second laptop requesting `phone-mode` gets `device-busy` or switches cleanly after `all-up`).
- **Phone locked, screen off, or no text field focused:** `editor-state.active == false`; laptop pill says `"Open a text field on Tom's Fold"` (or `"Unlock Tom's Fold"`) and leaves keys on the laptop—never buffered or lost.
- **Connection drops mid-typing:** Laptop auto-returns to local typing within `1 s` with a clear pill notice, running `Engine::reset()` locally; phone flushes `finishComposingText()` and resets held modifiers on EOF/timeout.
- **Phone picked up away from the desk:** Compact bar immediately shows `"Not typing from <Laptop> · Use phone keyboard"` so one tap restores Samsung Keyboard/Gboard.
- **Version drift:** `hello-peer` carries `protocolVersion`; unknown optional JSON keys are ignored and incompatible major versions show `"Update hyly Keyboards on <Phone>"` instead of hanging.
- **Latency budget:** Key-press on laptop (MacBook or ZenBook) to visible glyph on phone under `30 ms` p95 on the same Wi-Fi, measured with `WIFI_MODE_FULL_LOW_LATENCY` + `TCP_NODELAY`.

## Implementation plan for KE-81 (and storage / device gates)

| Step | Scope | Done check |
|---|---|---|
| 1. Shared `native/wire` crate | Extract/align Rust DBC1 v1/v2 + DBS1 AES-256-GCM + `ukeys://pair` + key/state frames so macOS (`KE-52/53`) and Windows (`service-win`, `KE-78/81`) share one crate and deterministic vectors | `cargo test` passes shared Rust↔Kotlin↔Swift vector suite; unpaired / wrong-fingerprint / replayed proof rejected |
| 2. Windows & Mac LAN advertisement | Mac Bonjour `_ukeys._tcp`; Windows `DnsServiceRegister` (`windns.h`) + Public-network preflight check + `&addr=` QR hint + DPAPI peer store | ZenBook and Mac both advertise `_ukeys._tcp` and complete DBC1/DBS1 with a test client |
| 3. Android IME & app (`world.hyly.keyboards`) | Kotlin `UltimateKeyboardService` (`InputMethodService`), compact Studio 4 native bar (`120 Hz`, frame-1 resting state, Fold 8 `configChanges`), Keystore `ProtectedConnectionStore`, VPN-safe `NsdManager` + `PhoneWifi`, sender-aware modifier & Hangul 2-set translator, setup preflight (`API 29..36`) | Gradle unit tests (`Hangul`, `ModifierTranslator` Mac+Win, `Dbc1`/`Dbs1`, `TrustInvariant`, `ImePreflight`); APK builds with Gradle output symlinked under `/Volumes/Work/caches/uk-android-build` (never on `/`) |
| 4. Live device acceptance (under single-agent lease) | Install test APK on **Galaxy Tab S9** (Android 16) and **Galaxy A90** (`RFCM803EL7W`, Android 12, 60 Hz)—never emulators, obeying `device-safe-commands` (no `am force-stop`, `am start -S`, power/lock keyevents, or `cmd device_state`). Type from both Mac and ZenBook (`KL`=Enter, `IO`=Backspace, home-row mods, Mac `⌘/⌥` + Win `Ctrl` word/line edits, Korean 2-set, password field, one-tap switch back to Samsung Keyboard). **Galaxy Z Fold 8** receives gate-passed builds only (`af verify gate --build <hash>`). | Live receipts recorded in `verify/`; `<30 ms` same-Wi-Fi latency; Fold 8 cover ↔ inner fold switch keeps session only after gate pass |

## Sources

- Project contracts: [type-on-iphone.md](./type-on-iphone.md), `tasks/uk-windows/intent.md`, memory `android-modifier-semantics` (measured 2026-09-23 on Galaxy Z Fold 8 `SM-F971N`, Android 17, One UI), `~/.claude/refs/developer-accounts.md`, `~/.claude/refs/studio-design-language.md`, `/Volumes/Work/STORAGE.md`.
- Vetted local reference implementations (copied by design, never linked): Unisinc `connection/PROTOCOL.md` (DBC1/v2, one-device-one-peer), `MirrorSecureSession.kt` (DBS1 AES-256-GCM), `NearbyDiscovery.kt` & `NetworkCheck.kt` (VPN-safe Wi-Fi socket binding, IPv4 preference, CIDR same-Wi-Fi check without Location), `AndroMacKeyboard.kt` (Chrome-safe `setComposingText` + `finishComposingText`).
- Android Developers & AOSP:
  - [`InputMethodService`](https://developer.android.com/reference/android/inputmethodservice/InputMethodService) (`switchToPreviousInputMethod`, `onEvaluateFullscreenMode`, `onStartInput`, `requestHideSelf`) and [`Create an input method`](https://developer.android.com/develop/ui/views/touch-and-input/creating-input-method).
  - [`InputMethodManager`](https://developer.android.com/reference/android/view/inputmethod/InputMethodManager) (`getEnabledInputMethodList`, `getCurrentInputMethodInfo` added in API 34, `showInputMethodPicker`) and Android 14 `Settings.Secure` `@Readable(maxTargetSdk = 33)` restriction on `ENABLED_INPUT_METHODS`.
  - [`Direct Boot`](https://developer.android.com/training/articles/direct-boot) (Credential Encrypted vs Device Encrypted storage) and [`Android Keystore`](https://developer.android.com/privacy-and-security/keystore).
  - [`NsdManager`](https://developer.android.com/reference/android/net/nsd/NsdManager) and [`WifiManager.WIFI_MODE_FULL_LOW_LATENCY`](https://developer.android.com/reference/android/net/wifi/WifiManager#WIFI_MODE_FULL_LOW_LATENCY) (API 29+ foreground low-latency Wi-Fi lock).
- Microsoft Learn (Win32 DNS-SD): [`DnsServiceRegister`](https://learn.microsoft.com/en-us/windows/win32/api/windns/nf-windns-dnsserviceregister) and [`DnsServiceDeRegister`](https://learn.microsoft.com/en-us/windows/win32/api/windns/nf-windns-dnsservicederegister) (`windns.h` / `dnsapi.dll`, Windows 10+).
