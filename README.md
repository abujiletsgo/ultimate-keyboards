# Ultimate Keyboards

A macOS app for people who build and tune split keyboards. It edits your ZMK or
QMK config files directly: keymaps, combos, behaviors, trackpads and
trackballs, then builds and flashes the firmware through your own GitHub
Actions. It also remaps the MacBook's built-in keyboard through
Karabiner-Elements.

MIT licensed. See [what is supported](docs/user/supported.md) and the
[changelog](CHANGELOG.md).

## Install

1. Download `Ultimate Keyboards_<version>_aarch64.dmg` from
   [Releases](https://github.com/abujiletsgo/ultimate-keyboards/releases) and drag the app to Applications.
2. The app is not signed by Apple yet. On first launch, right-click it, choose **Open**,
   then **Open** again.
3. Click **Add keyboard…** and pick your config repo folder (for ZMK, the folder
   that holds `config/` and `build.yaml`). The keymap, physical layout and any
   trackpad or trackball are detected.

Updates arrive in **Settings › Updates**. Each download is checked against the
release signing key before it is installed.

### Permissions it asks for

| Permission | Why |
|---|---|
| Documents folder | Your config repos usually live there. Other folders are only read after you pick them. |
| Accessibility | Only for the scroll engine under **This Mac › Scroll & Mouse**. |
| Karabiner-Elements | Only for **This Mac › MacBook Keys**; install it separately. |

The app never runs shell commands you type, never uploads your files, and talks
to GitHub only through your own `gh` login when you open the Build tab.

## What it does

Each keyboard you register is a top-level object with **Keymap**, **Combos**,
**Behaviors** (ZMK), **Pointing** and **Build** tabs. Host-level tools live under
**This Mac**.

| Section | Purpose |
|---|---|
| **Keyboard › Keymap / Combos** | Visual editor for a ZMK `.keymap` (layers, bindings, combos, layer create/rename/delete) or a QMK VIA layout JSON + `keymap.c` combos. Keys are drawn on the keyboard's real physical layout. |
| **Keyboard › Behaviors** | ZMK hold-taps, mod-morphs, tap-dances, macros: edit, add, remove. |
| **Keyboard › Pointing** | Tune a trackpad/trackball in the shield overlay (speed, scroll, gestures, CPI, axis flips, snipe, scroll layer), or add one from a tested template with a diff preview. QMK: pointing flags in `rules.mk` / `config.h`. |
| **Keyboard › Build** | GitHub Actions runs, artifact download, UF2 flash. |
| **This Mac › MacBook Keys** | Karabiner-Elements complex-modification builder: remaps, combos, layers, homerow mods. |
| **This Mac › Scroll & Mouse** | Native scroll engine (reverse direction, speed) for discrete-wheel mice. |
| **Settings** | Add, rename, re-point or remove keyboards; built-in-keyboard mute; updates; what is supported. |

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

## Develop

```sh
bun install
bun run dev          # web dev build — fs bridge lets the browser read/write the keymap files
bun run tauri:dev    # desktop app (auto-loads keymaps natively)
bun run build        # package the desktop app
bun run typecheck    # tsc -b
bun test
bun run scripts/gen-supported-doc.ts   # after editing src/lib/supported.ts
```

### Releasing

1. Once per machine: `bash scripts/setup-updater-key.sh` (creates the updater
   signing key, stores the GitHub secrets, writes the public key into
   `tauri.conf.json`).
2. Bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
   `package.json`; add a `## [x.y.z]` section to `CHANGELOG.md`.
3. Tag and push: `git tag vx.y.z && git push origin vx.y.z`. The Release workflow
   builds, signs the update, and publishes the release with `latest.json`.

Local `bun run build` does not sign or produce update archives; only the
Release workflow does (it passes `createUpdaterArtifacts` and the key secrets).

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
