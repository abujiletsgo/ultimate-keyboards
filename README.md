# Ultimate Keyboards

Personal keyboard control center — a Tauri desktop / web app that fully replaces
[nickcoutsos/keymap-editor](https://nickcoutsos.github.io/keymap-editor/) by editing
local ZMK config checkouts directly.

## What it does

| Section | Purpose |
|---|---|
| **ZMK / QMK** | Visual keymap editor for the Corne (trackpad) and Crosses (trackball). Separate Keymap and Combos views. Numbered layers with create / rename / reference-safe delete. Combo CRUD with per-layer filters. Full binding editor (all ZMK behaviors incl. `&out`, `&bootloader`, custom/raw keycodes, modifier wraps like `LG(LS(N4))`). QMK tab edits a VIA layout JSON. |
| **MacBook Keys** | Karabiner-Elements complex-modification builder: remaps, combos, layers, homerow mods. Rules persist locally; export/copy JSON. |
| **Pointing** | Trackpad/trackball tuning written straight into the shield overlays: cursor speed (`zip_xy_scaler`), scroll direction, tap gestures, CPI, axis flips, snipe mode, trackball scroll-on-layer. |
| **Settings** | Registered keyboard paths + built-in-keyboard disable (desktop only, via `hidutil`). |

## Data flow

Keymaps are **files on disk**, edited in place with a minimal-diff serializer
(no-op save = byte-identical; a one-key edit = one changed line; comments preserved):

- Corne: `~/Documents/cross_keyboard/config/corne_tp.keymap` (git branch `corne`)
- Crosses: `~/Documents/cross_keyboard-crosses/config/crosses.keymap` (worktree, branch `crosses`)
- Pointing overlays: `config/boards/shields/*/…_right.overlay` in the same checkouts

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
  App.tsx                  # section router + error boundary
  components/
    ZMKEditor/             # keymap + combos editor (SplitKeyboard, BindingEditor, ComboEditor…)
    KarabinerEditor/       # MacBook key remapping suite
    Pointing/              # trackpad/trackball tuning UI
    Settings.tsx
    ScaledBoard.tsx        # responsive scaling wrapper for fixed-px key grids
  lib/
    zmkParser.ts           # ZMK keymap parse + minimal-diff serialize (layers, combos, layer mgmt)
    pointingParser.ts      # devicetree overlay prop editing (minimal-diff)
    pointingConfig.ts      # per-keyboard pointing descriptors
    keyboards.ts           # keyboard registry (paths, persisted selection)
    crossesLayout.ts       # 42-key split board geometry
    tauri-web-shims/       # browser impls of Tauri fs/dialog (FS Access API + dev bridge)
  stores/                  # zustand: zmkStore, qmkStore, karabinerStore (persisted)
  styles/globals.css       # aurora-teal glassmorphism design system (tokens + utilities)
src-tauri/                 # Tauri 2 shell: tray, hidutil built-in-keyboard toggle
```

## Invariants (do not break)

- `zmkParser` serializers are **minimal-diff**: saving without changes must be
  byte-identical; comments must never be stripped from untouched nodes.
- The tauri-web-shims vite alias is gated on `TAURI_ENV_PLATFORM` — removing the
  gate gives the packaged desktop app throwing fs stubs.
- Test harnesses (bun): `roundtrip-test.ts`, `byte-preserve-test.ts`,
  `pointing-test.ts` — run against the real keymaps read-only.
