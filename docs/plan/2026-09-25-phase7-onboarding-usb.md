# Phase 7 — New-owner onboarding: find your keyboard, or read it over USB (draft for Tom's gate)

Trigger (Tom, 2026-09-25): "Add keyboard" should show every option in tabs; bundle popular public
layouts with their keymaps for people who just bought a split keyboard; warn when something may not
work; best path = read the layout already installed on the keyboard over USB; recognise the keyboard,
its settings, trackpad/trackball and RGB when plugged in.

## Directive scrutiny

| claim | holds? | evidence |
|---|---|---|
| The app can read the installed keymap over USB | **Only for ZMK built with Studio, QMK with Vial, or QMK with VIA** | ZMK without Studio has no read-back at all (defaults VID 0x1D50/PID 0x615E, product string = keyboard name). Studio is off by default on every board; Tom's corne_tp build does not enable it. |
| It can detect trackpad/trackball when plugged in | **No protocol exposes it** | Studio protos have no pointing/RGB/battery; Vial/VIA have none for pointing. Only heuristics: a mouse collection in the HID report descriptor (also present with mouse keys) and catalogue metadata. Shown as "probably has a pointing device", never as fact. |
| It can detect and configure RGB | **Vial and VIA: yes. ZMK: no** | VialRGB; VIA lighting channels 1–5. |
| A new owner already has a config repo | **Usually not (ZMK)** | They need a zmk-config repo on their GitHub before anything can be built, so "pick your keyboard" must be able to create one from the official template. |
| Popular layouts with keymaps can be bundled | **ZMK yes, QMK fetch at runtime** | ZMK shields + default keymaps are MIT (35 splits, 14 Studio-ready). QMK data is GPL-2 and the Configurator default keymaps have no licence, so they are fetched from keyboards.qmk.fm at runtime and cached, not bundled. VIA definitions (GPL-3) likewise fetched. |

## Add keyboard — one screen, four tabs

| tab | who it is for | what it does |
|---|---|---|
| **Plugged in** (first when a device is found) | anyone with the keyboard on a USB cable | Lists connected keyboards: name, firmware, and what the app can do with it (read keymap / live edit / RGB), with a plain reason when it cannot ("This ZMK keyboard was built without Studio, so its keymap cannot be read. Pick it from the catalogue instead, or rebuild with Studio"). |
| **Find my keyboard** | new owners | Search + filters (split, key count, trackball, trackpad, RGB, OLED, encoder, Studio-ready, firmware). Each card shows the layout picture and a reliability badge: *Tested here*, *Official default*, *Community*, *Untested*. Choosing one previews the default keymap on the real layout. |
| **Config folder** | people who already have a zmk-config / QMK folder | today's flow |
| **Single file** | a lone .keymap / VIA JSON | today's flow |

After "Find my keyboard" on ZMK: **Create my config** makes a repo from `zmkfirmware/unified-zmk-config-template` on the user's GitHub through their `gh` login, writes build.yaml for the chosen shield (optionally with the Studio snippet so the keyboard can be read and edited live later), clones it into ~/Documents, and opens the keymap.

## Work items

| # | item | acceptance |
|---|---|---|
| 7.1 | Add-keyboard hub with the four tabs; onboarding points to it | every path reachable in ≤2 clicks; keyboard nav |
| 7.2 | ZMK catalogue generator: shields + boards → layout, default keymap, siblings, features, Studio flag (MIT, bundled) | 35 split shields parse; default keymap renders on its layout |
| 7.3 | QMK catalogue: runtime fetch of keyboard_list / info.json / configurator default, cached in app data; offline message | Corne (crkbd), Lily58, Sofle, Kyria, Charybdis load |
| 7.4 | Create-config flow (gh repo create from template, build.yaml, clone) | a new repo builds green on Actions for one shield |
| 7.5 | USB detection (Rust: serialport + hidapi `macos-shared-device`): ZMK (VID/PID + name, Studio probe), Vial (serial magic), VIA (vpid), QMK (usb.json) | plugging each kind shows the right card; no Input Monitoring prompt (must test) |
| 7.6 | ZMK Studio client (own Rust impl of framing + protobuf from zmk-studio-messages, MIT): read layouts + keymap, live set/save; unlock prompt | read Tom's Corne after a Studio build |
| 7.7 | Vial / VIA client: read definition + keymap, live keymap edits, RGB panel | needs a Vial or VIA keyboard to test — Tom has none today (Procyon is QMK without VIA) |

## Risks

- **Hardware for testing:** only ZMK boards (and a QMK Procyon without VIA) are available here. Vial/VIA paths (7.7) can be unit-tested against recorded packets only, and would ship labelled untested.
- **Input Monitoring prompt** when enumerating HID keyboards on macOS; must be proven absent or explained.
- **Licensing:** implement protocols ourselves (Vial GUI is GPL-2); never bundle QMK/VIA data files.
- **Live edit vs files:** Studio/Vial/VIA write to the keyboard, not to a repo; the UI must say which one is being edited.

## Gate (Tom, 2026-09-25)
Scope: **everything, incl. Vial/VIA** (untested parts labelled). New ZMK configs: **user's GitHub + local copy**.

## Critique resolution (one OpenAI planning pass, resolved once by the lead)

| # | finding | decision |
|---|---|---|
| 1 | repo keymap and device keymap are separate sources of truth; Studio/VIA saved state masks later file changes | **Accept.** Separate workspaces, no auto-sync; snapshot the whole device keymap before the first write; read back every write. |
| 2 | do not ship untested writes | **Partly.** Tom chose to include Vial/VIA; their writes and RGB are behind an explicit Experimental switch until validated on hardware. Studio writes stay on (Studio has its own save/discard) with read-back. |
| 3 | 0xFF60 is a usage page; match usage 0x61 and handshake; VIA ≠ Vial | **Accept.** |
| 4 | macOS permissions / sandbox | **Accept default:** direct distribution, not App Store; Documents TCC prompt documented; Input Monitoring only if a signed build proves it is needed. |
| 5 | a shield alone is not buildable; create `.conf` too | **Accept.** Controller choice + `config/<id>.conf` written. |
| 6 | Studio needs an unlock key | **Accept.** 27 of 31 Studio-ready default keymaps have none → build adds `CONFIG_ZMK_STUDIO_LOCKING=n` and the UI says what that means. |
| 7 | USB identity is heuristic | **Accept.** Candidates until a handshake; "Pointer reports detected", never trackball/trackpad from USB. |
| 8 | runtime fetch is not a licence | **Noted.** Nothing QMK/VIA is bundled; provenance shown in the UI; Configurator defaults (derived from GPL keymaps, repo unlicensed) flagged for Tom's licence review before a public release. |
| 9 | online catalogue can dead-end | **Partly.** ZMK part is offline; QMK errors explain the network cause. Last-known-good cache deferred. |
| 10 | repo creation must be resumable | **Accept.** An existing remote from a failed attempt is reused; nothing is auto-deleted. |

## Verification (2026-09-25, packaged build)

| check | result |
|---|---|
| tsc -b / bun test / cargo test --lib | clean / 123 pass (catalogue, QMK mapping, device framing + VIA/Vial codecs) / 12 pass |
| catalogue | 72 ZMK keyboards (38 split) bundled; 40 QMK splits by name. In the app: search, filters, ZMK Corne detail with 3 layers, QMK Aurora Corne detail downloaded live (layout + 4 layers + Split/RGB/Display tags) through the new CSP |
| 7.4 create-config | files generated by the app's code for the Corne (nice!nano, Studio on, lock off) pushed to a private test repo `abujiletsgo/uk-test-zmk-config-corne`: GitHub Actions run 36196831800 **success** for corne_left (Studio), corne_right, settings_reset. The in-app button itself was NOT clicked (it would create another repo). |
| Plugged in | USB enumeration runs in the packaged app with no keyboard attached: shows the empty-state guidance; no Input Monitoring prompt appeared |
| NOT verified on hardware | Studio read (no Studio-enabled keyboard; Tom's corne_tp build has no Studio), VIA and Vial read, lighting writes (experimental switch), a ZMK keyboard without Studio showing its "cannot be read" card |
| QA note | the rebuilt app raised macOS's Documents-access prompt again; left for Tom (security setting). While it is open, typing into the app is blocked. |
