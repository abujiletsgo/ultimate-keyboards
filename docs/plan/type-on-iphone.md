# Type on iPhone and iPad with the MacBook keyboard

Status: spec, 2026-11-15. Tom chose the **iOS keyboard app** route, wireless only, no bridge hardware and no cable.

## What the person gets

1. Install the Ultimate Keyboards iPhone/iPad app, turn on its keyboard (Settings › Keyboards › Add, then **Allow Full Access**).
2. Pair once: the Mac shows a QR code, the phone scans it. Both remember each other.
3. On the Mac, press the hotkey (default: tap both ⌘ keys; changeable) or pick the device in the menu bar. The MacBook keyboard now types on the phone; the Mac shows a small "Typing on Tom's iPhone" pill. Press the hotkey again (or Esc-hold) to come back.
4. On the phone, any text field with our keyboard showing receives the typing. Home-row mods, layers and combos work, because the Mac's engine runs first.

Tom's purpose: MacBook users type on their iPhone/iPad without a cable, the same "flow" feel as Unisinc on Android.

## Hard limits (state them in the app and on the site)

| Limit | Why | What the app shows |
|---|---|---|
| Password and passcode fields | iOS swaps third-party keyboards for the system keyboard in secure fields | Pill on Mac: "This field needs the iPhone keyboard" (the extension sees it is not active) |
| Apps that block third-party keyboards (some banking, phone dialer) | App's choice | Same message |
| No ⌘Tab, Spotlight, Home, mouse pointer | Only a hardware keyboard or Apple features can do these | Not offered; site says "typing and editing" |
| Our keyboard must be the selected keyboard | iOS rule | Phone keyboard view says "Typing from Tom's MacBook"; globe key switches away |
| Full Access must be on | Networking from a keyboard needs it | Setup screen checks and deep-links to Settings (preflight, never a dead toggle) |

## Architecture

```
MacBook keys ─▶ native service (already seizes the built-in keyboard)
                 └─ engine (home-row mods, layers, combos)
                     ├─ Mac mode: virtual HID (today)
                     └─ Phone mode: OutputEvents ─▶ Mac sender ─(encrypted, Wi-Fi/peer-to-peer)─▶ iOS keyboard extension
                                                                                                    └─ layout + IME ─▶ textDocumentProxy
```

- **Mac side:** a "route" switch in the native service: when phone mode is on, engine output goes to the sender instead of the virtual keyboard, so nothing reaches Mac apps meanwhile. Hotkey detection lives in the service (it already sees every key first). The sender is a small Swift component in the app/helper (reuse Unisinc's Swift connection code by copying the vetted design, not by linking the repo).
- **Wire:** Network.framework, Bonjour service `_ukeys._tcp`, `includePeerToPeer = true` so it works over AWDL when there is no shared Wi-Fi. Messages are HID usages + modifier state + a sequence number (key-level, not text), so the phone side can do editing keys and Korean composition.
- **Security:** keystrokes are sensitive. Pair with Unisinc's v2 pattern: QR with Mac fingerprint + one-use 2-minute token, P-256 identity keys, ECDH + HKDF session secret, AES-GCM frames, trusted-peer list with revoke on both sides. No unpaired peer ever receives a keystroke.
- **iOS side:** app (pairing, setup checks, settings) + keyboard extension (connection, translation, insertion), sharing keys through an App Group keychain. Bundle `world.hyly.keyboards` / `world.hyly.keyboards.keyboard`, team `D4H83LGM8K` (macOS app id stays `com.ultimatekeyboards.app`).
- **Translation on the phone:** US layout to characters; Backspace = `deleteBackward`; arrows = `adjustTextPosition`; Return = `\n`; ⌘C/⌘V/⌘X/⌘A/⌘Z via the proxy where iOS allows (paste from the phone's clipboard needs Full Access; undo/select-all may not be reachable, so spike it). Korean 2-set (두벌식) composition with `setMarkedText`, following the Mac's current input source sent with each key.

## Situations to design for (from purpose)

- Several phones/iPads per person: menu lists paired devices; the hotkey goes to the last-used one.
- Phone locked or keyboard not showing: Mac pill says "Open a text field on Tom's iPhone"; keys stay on the Mac, never silently dropped into nowhere.
- Connection drops mid-typing: auto-return to Mac typing after 1 s with a notice; no stuck modifiers (send all-up on reconnect, as the engine's `reset()` does).
- Different Wi-Fi or none: peer-to-peer link; if both fail, the pill says why.
- Old app on the phone, new on the Mac: versioned hello; a mismatch is named, not a hang.
- Reinstall: phone identity lost, so the Mac shows the old entry as revoked when the new one pairs (one device, one peer).
- Latency budget: key-to-glyph under 30 ms on the same Wi-Fi; measured, not assumed.

## Phases

| # | Deliverable | Done when |
|---|---|---|
| 0 | **Spike**: bare keyboard extension in the iOS Simulator connects to a Mac test sender over Bonjour/NWConnection and inserts typed text | Simulator shows text typed on the Mac; answers recorded: does the extension get Local Network access, does it need the containing app, what is the latency |
| 1 | iOS app + extension skeleton, App Group, Full Access/enable preflight screens (Studio design) | Renders on iPhone and iPad sizes in light/dark; setup checks are live |
| 2 | Pairing + encrypted link (port the DBC1/v2 design to Swift on both ends, shared test vectors) | Cross-side vector tests pass; unpaired peer refused |
| 3 | Mac phone-mode route in the native service + hotkey + menu-bar pill | Engine tests: route switch sends nothing to virtual HID; all-up on switch |
| 4 | Translation: US layout, editing keys, Korean 2-set | Unit tests on composition; live typing on the test iPhone |
| 5 | Site + App Store listing (honest limits), TestFlight | Gate-passed build; listing reviewed |

## Open questions

- Phase 0 decides whether the extension can hold the connection itself. If iOS blocks local-network discovery inside keyboard extensions, fall back to the app keeping a short-lived background session or to a relay over the person's NetBird/iCloud path; that changes Phase 2.
- Free or paid: likely part of the paid tier (freemium); Tom decides with the price split.
