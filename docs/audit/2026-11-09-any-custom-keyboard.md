# Any custom keyboard, not only splits: audit and plan

Date: 2026-11-09 · Branch `abujiletsgo/any-custom-keyboard` from `main` at 6a3e77d · Status: **Phases A and B built** (approved by Tom 2026-11-09; see Outcome)

Goal (Tom, 2026-11-09): Ultimate Keyboards should serve anyone with a custom keyboard
(single-board ZMK and QMK boards, VIA/Vial boards such as Keychron, GMMK and kits, wired
and wireless), not only split keyboards.

## What works today

| | Non-split ZMK (nice!60, BT60, Planck, Reviung41) | Non-split QMK (Planck, a 60 %) | VIA / Vial (Keychron, GMMK, kits) |
|---|---|---|---|
| **Find my keyboard** | Listed (34 of 72 ZMK entries) but **hidden by default**: the "Split only" filter is on | **Not listed**: the QMK list has only 40 split boards | Not listed unless it is one of the 40 QMK splits |
| **Create config** | Works (`newZmkConfig` handles boards and single shields); copy says "each half" | n/a (saves `keymap.json`) | n/a |
| **Config folder** | Works for `shield:` repos; repos that build a `board:` (Glove80, nice!60, BT60) get the folder name, no catalogue layout, no sleep setting | Only a folder with a `.json` at its root; `keymap.c` only at `<kb>/keymaps/default`; `qmk_userspace` and vendor folders (`keychron/q1/ansi`) not found | Same as QMK |
| **Plugged in** | ZMK Studio read works; copy says "plug in one half" | Plain QMK cannot be read over USB (by design) | **Reads** the keymap and backs it up (VIA definition fetched from usevia.app; Vial from the board); lighting is experimental |
| **Keymap / combos / behaviors** | Work; driven by the physical layout, not by halves | Keys edit in `keymap.json` / VIA JSON; `keymap.c` keys cannot be edited; combos from `keymap.c` | Edits a **file copy** in Documents; nothing goes back to the keyboard |
| **Build / Flash** | Works (GitHub Actions, UF2); copy says "half" | **Dead end**: GitHub + UF2 only; the tab tells QMK users to choose a config folder | **Dead end**: no way to write changes to the keyboard |
| **Settings (deep sleep)** | Works for shield builds; missing for detected `board:` repos | n/a | n/a |
| **Pointing** | Works; wizard says "the half wired to the sensor" | QMK flags work | n/a |

The editors are not split-specific. The split assumptions sit in how a keyboard is found
and added, in the copy, and in the fact that only ZMK + GitHub + UF2 can deliver firmware.

## Split-only assumptions, with evidence

1. `src/lib/catalogue/index.ts:95`: `EMPTY_FILTER.splitOnly = true`, so the 34 non-split ZMK keyboards are hidden on first open.
2. `src/lib/catalogue/qmk.ts:13-56`: the bundled QMK list is "Popular split keyboards" only; `src/lib/catalogue/index.ts:79` hard-codes `split: true` for every QMK item. `qmkKeyboardList()` (`qmk.ts:81`, ~3,800 boards) exists but nothing calls it.
3. Copy that assumes halves:
   - `src/components/Onboarding.tsx:11`: "the list of popular split keyboards"
   - `src/components/Settings/FindKeyboard.tsx:47`: search hint "corne, sofle, 42, charybdis…"
   - `src/components/Settings/FindKeyboard.tsx:244`: "Controller on each half"
   - `src/components/Settings/FindKeyboard.tsx:256-257`: "Adds Studio to the left half"
   - `src/components/Settings/PluggedIn.tsx:67`: "Plug in one half (usually the left)"
   - `src/components/Keyboard/BuildPanel.tsx:141,146`: "Double-tap reset on that half"
   - `src-tauri/src/build.rs:265`: "double-tap reset on the half you want to flash"
   - `src/components/Pointing/AddDeviceWizard.tsx:156`: "the half wired to the sensor"
   - `src/lib/supported.ts:66`: "Flash a UF2 to a half"
4. `src/lib/registry/detect.ts:108-114` reads only `shield:` lines from `build.yaml`, and `detect.ts:130` strips only `_left/_right/_dongle/_central/_peripheral` (not Glove80's `_lh/_rh`). A repo that builds `board: nice60` gets no shield, so `src/lib/zmkSleepFiles.ts:33-35` finds no parts and the sleep setting is missing.
5. `src/lib/registry/detect.ts:181`: QMK detection takes *any* root `.json` as the VIA layout. `detect.ts:185-197` looks only one directory deep and only at `keymaps/default/keymap.c`.
6. `src/components/Settings/AddKeyboard.tsx:84`: the key count (and so the catalogue suggestions and grid fallback) is computed for ZMK only, so a QMK folder without `info.json` has no layout to choose and cannot be added. `AddKeyboard.tsx:59`: "Single file" accepts `.keymap` only.
7. `src/components/Keyboard/BuildPanel.tsx:70`: a keyboard without `repoPath` (every QMK keyboard added from Find or Plugged in) is told to "choose its config folder", which cannot help. `src-tauri/src/build.rs:213,240,257`: download, list and flash are `.uf2` only.
8. VIA/Vial write-back: `src/components/Settings/PluggedIn.tsx:141-151` saves a file copy; "The keyboard itself is not changed." `src/lib/device/via.ts:231` `setKeycode`, `via.ts:168` `writeKeycodeVerified` and `src/lib/device/vial.ts:109` `setVialKeycode` exist, gated as experimental and never called from an editor. `src/lib/device/keycodes.ts:184` decodes keycodes to names but nothing encodes names to keycodes. `src/lib/registry/types.ts:42-59` has no link from a keyboard to its USB device. `src/lib/supported.ts:32` states "Vial / VIA live (USB) editing: No".
9. `src/components/Keyboard/BuildPanel.tsx:149`: the Bluetooth deep-sleep setting shows for every ZMK keyboard, including wired-only boards. Low impact.
10. Plugged in does not recognise a keyboard that is already in the list, so reading it again adds a duplicate. Low impact.

KMK and RMK: no detection, catalogue or demand signal in the code or docs. They stay out of scope.

## Ranked gaps

| # | Gap | Who it blocks | Size |
|---|---|---|---|
| 1 | VIA/Vial boards are read-only: edits never reach the keyboard (8) | Keychron, GMMK, most kits: the largest group of custom-keyboard owners | Medium; **needs a real VIA or Vial board** |
| 2 | Find hides single boards and lists no non-split QMK boards (1, 2) | Every first-time non-split owner | Small (filter); medium (search all QMK boards online) |
| 3 | QMK Build tab is a dead end with wrong advice (7) | Every QMK keyboard | Small (honest panel); large (local QMK compile + DFU flashing) |
| 4 | Copy assumes halves (3) | Everyone non-split; erodes trust | Small |
| 5 | `board:` ZMK repos are poorly detected (4) | Glove80, nice!60, BT60, Planck repo owners | Small |
| 6 | QMK folder and file detection is narrow (5, 6) | QMK users with `qmk_userspace` or vendor folders | Medium |
| 7 | Wired boards get the Bluetooth sleep setting (9); duplicates from Plugged in (10) | Minor | Small |

## Proposed build

**Phase A (no hardware needed).** Closes gaps 2-6 for the first-run path.

- A1 Find: "Split only" off by default and renamed "Split"; search hint without split names; QMK items take `split` from their details. When the query has two or more characters and the firmware filter allows QMK, also search the full QMK list (fetched once, cached, with an offline message), so any QMK board can be found.
- A2 Copy: one wording pass over every string in (3), keyed to how many parts the keyboard builds ("the keyboard" for one, "each half" for a split).
- A3 Detection: read `board:` entries when there is no `shield:`, strip `_lh/_rh`, match the catalogue by board id; for QMK, a depth-limited search for `keymap.json` / VIA JSON / `keymap.c` that understands `qmk_userspace` and vendor folders, and accepts only JSON that has `layers`. Key count for QMK JSON, so the catalogue and grid fallbacks work. "Single file" also accepts a QMK `keymap.json` or VIA `.json`.
- A4 Build tab for QMK: say what applies instead of the dead end. For a `keymap.json`, the exact `qmk compile` / `qmk flash` command and the QMK Configurator route; for RP2040 boards, "Flash a .uf2 file…". Local QMK compiling and DFU/avrdude flashing stay deferred.
- Tests: catalogue filter defaults, QMK search, `board:` detection (Glove80, nice!60 fixtures), QMK userspace/vendor detection fixtures, copy by part count; `supported.md` regenerated.
- Verification: Find, Add (folder, file), Plugged in and Build rendered at phone, tablet and desktop widths in Orca, at rest, hovered and focused.

**Phase B (needs a VIA or Vial board).** Closes gap 1.

- `KeyboardDef.device` (protocol, VID/PID, cached definition) set when a keyboard is added from Plugged in.
- A QMK keycode encoder (basic keys, modifiers, `MO/TG/TO/TT/OSL/LT/MT/OSM`) with round-trip tests against the existing decoder; unknown names are refused, never guessed.
- "Write to keyboard" on a device-backed keyboard: back up, re-read, write only the changed keys with `writeKeycodeVerified`, report every key written. No lighting or macro writes.
- Physical acceptance on the board is separate from synthetic tests; until it passes, the UI keeps the "experimental" label.

**Deferred:** local QMK compile and non-UF2 flashing, Vial combos and tap dance, KMK/RMK, the wired-board sleep setting, and recognising duplicates from Plugged in.

## Outcome (2026-11-09)

Built on this branch. Phase A: Find shows single boards by default ("Split" pill, off) and searches QMK's
full online list (offline message when it cannot load); Add reads `board:` repos (Glove80, nice!60),
QMK userspace / vendor folders, VIA exports and keymap.json (Single file accepts `.json`), downloads the
QMK layout when no info.json is present, and explains the `qmk c2json` step for keymap.c-only folders;
copy is keyed to one part vs halves; QMK keyboards get their own Build tab (exact `qmk compile` /
`qmk flash` commands, QMK Configurator route, flash any `.uf2`). Board-target deep-sleep chains follow
ZMK `app/boards/post_boards_shields.cmake`: `config/<board folder>.conf` then `config/<BOARD>.conf`
(Glove80's BOARD is `glove80_lh`), checked against zmkfirmware/zmk main.

Phase B: `KeyboardDef.device` is set when a VIA / Vial keyboard is saved from Plugged in; its Build tab
offers **Write to keyboard (experimental)**: check first (lists every key that differs), then backup,
write only changed keys with read-back, and re-read the whole keymap. Any name the encoder cannot map
exactly refuses the whole write; a keyboard changed between check and write is refused. Synthetic only
(fake VIA/Vial raw HID); the label stays until a real board passes.

Evidence: `bun test` 354 pass; `bunx tsc -b` clean; `tests/visual/any-keyboard.mjs` renders Find, Find
offline, Add (QMK userspace, downloaded layout, keymap.c error), QMK Build and VIA write at 390 / 820 /
1280 px, at rest, hovered and keyboard-focused, with no horizontal overflow; run it against
`TAURI_ENV_PLATFORM=darwin vite` (real Tauri plugins over mocked IPC).
