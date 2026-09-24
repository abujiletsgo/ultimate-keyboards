# Ultimate Keyboards

Personal keyboard control center — a Tauri desktop / web app that fully replaces
[nickcoutsos/keymap-editor](https://nickcoutsos.github.io/keymap-editor/) by editing
local ZMK config checkouts directly.

## What it does

Each keyboard you register is a top-level object with **Keymap**, **Combos** and
(when it has a trackpad/trackball) **Pointing** tabs. Host-level tools live under
**This Mac**.

| Section | Purpose |
|---|---|
| **Keyboard › Keymap / Combos** | Visual editor for a ZMK `.keymap` (layers, bindings, combos, layer create/rename/delete) or a QMK VIA layout JSON + `keymap.c` combos. Keys are drawn on the keyboard's real physical layout. |
| **Keyboard › Pointing** | Trackpad/trackball tuning written straight into the shield overlay: cursor speed, scroll, gestures, CPI, axis flips, snipe, scroll-on-layer (Azoteq IQS5XX, Pixart PMW3610/3360, Cirque). |
| **This Mac › MacBook Keys** | Karabiner-Elements complex-modification builder: remaps, combos, layers, homerow mods. |
| **This Mac › Scroll & Mouse** | Native scroll engine (reverse direction, speed) for discrete-wheel mice. |
| **Settings** | Add keyboards from a config folder (firmware, keymap, physical layout and pointing sensors are detected) or a single `.keymap`; rename, change files or layout, remove. Built-in-keyboard mute. |

## Data flow

Keymaps are **files on disk**, edited in place with a minimal-diff serializer
(no-op save = byte-identical; a one-key edit = one changed line; comments preserved).
Every save is validated (re-parsed and compared) before it is written atomically,
with one `.bak` kept beside the file and a **Restore backup** button.

The keyboard registry lives in the app-data directory
(`~/Library/Application Support/com.ultimatekeyboards.app/registry.json`); file access is
limited to `~/Documents` plus folders you pick. Physical layouts come from the config repo
(`zmk,physical-layout` dtsi, keymap-editor / QMK `info.json`, or a matrix-transform grid) or
from the bundled catalogue of ZMK's shared layouts (`scripts/build-catalogue.ts`).

Edit → Save → `git commit && git push` in the config repo → GitHub Actions builds firmware.

## Run

```sh
bun install
bun run dev          # web dev build — fs bridge lets the browser read/write the keymap files
bun run tauri:dev    # desktop app (auto-loads keymaps natively)
bun run build        # package the desktop app
npx tsc -b           # typecheck
```

The vite dev server picks the first free port from 5173 (another local project often
holds 5173 — check the `➜ Local:` line).

## Structure

```
src/
  App.tsx                  # section router, navigation guard, error boundary
  lib/nav.ts               # Section model (keyboard | karabiner | mouse | settings)
  components/
    Sidebar.tsx            # keyboards list · This Mac · Settings
    Keyboard/              # KeyboardSection (tabs), ZmkKeymapEditor, QmkKeymapEditor
    board/PhysicalBoard.tsx# one renderer for any PhysicalLayout
    ZMKEditor/             # SplitKeyboard, QMKKeyboard, BindingEditor, combo editors
    Settings.tsx, Settings/AddKeyboard.tsx
    Onboarding.tsx, Pointing/, KarabinerEditor/, Mouse.tsx
  lib/
    registry/              # KeyboardDef model + config-folder detection
    layout/                # PhysicalLayout model, importers/exporters, catalogue
    zmkParser.ts           # ZMK keymap parse + minimal-diff serialize
    compat.ts              # constructs the editor can't round-trip → read-only
    io.ts                  # the only file writer: validate → .bak → tmp → rename
    dirty.ts               # app-wide unsaved-changes registry
    pointingParser.ts, karabinerGenerator.ts, keyLabel.ts, tauri-web-shims/
  stores/                  # zustand: registryStore, zmkStore, qmkStore, karabinerStore
tests/                     # bun test — parser, safety, layout, registry (real keymap fixtures)
src-tauri/                 # Tauri 2 shell: tray, hidutil toggle, scroll engine, quit guard
docs/                      # audits, research, phase plan
```

## Invariants (do not break)

- `zmkParser` serializers are **minimal-diff**: saving without changes must be
  byte-identical; comments must never be stripped from untouched nodes.
- The tauri-web-shims vite alias is gated on `TAURI_ENV_PLATFORM` — removing the
  gate gives the packaged desktop app throwing fs stubs.
- `bun test` must stay green; fixtures under `tests/fixtures` are real keymaps.
- Nothing personal is compiled in: no absolute paths in `src/` (the legacy seed
  resolves `~` at runtime and only fires when the files exist).
