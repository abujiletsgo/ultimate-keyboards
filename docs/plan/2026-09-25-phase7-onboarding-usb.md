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
