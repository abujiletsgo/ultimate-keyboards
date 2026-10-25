# Ultimate Keyboards

A macOS app for people who build and tune split keyboards. It edits your ZMK or
QMK config files directly: keymaps, combos, behaviors, trackpads and
trackballs, then builds and flashes the firmware through your own GitHub
Actions. The native remapping preview runs MacBook key remaps, home-row mods,
layers and combos through a bundled keyboard service. Karabiner-Elements JSON
export remains available for existing setups.

MIT licensed. See [what is supported](docs/user/supported.md) and the
[changelog](CHANGELOG.md).

## Install

The current **0.3 standalone MacBook remapping build is a development preview**
for Apple silicon (M1 or newer) on **macOS 13 or later**. It is not yet a
notarized public customer release. The published
[v0.2.0 release](https://github.com/abujiletsgo/ultimate-keyboards/releases/tag/v0.2.0)
remains available as the historical app-only editor; it does not contain the
current native remapping product.

For a complete 0.3 development installer supplied by the maintainer:

1. Save your work and quit Ultimate Keyboards. Open its DMG and double-click
   **Install Ultimate Keyboards.pkg**. Follow the administrator and app-close
   prompts; this one installer installs the app, helper and standalone driver.
2. Open **This Mac › MacBook Keys › Remapping**. Follow **Activate keyboard
   driver** and **Input Monitoring**, approving **Ultimate Keyboards Remapper**,
   then choose **Check status**.
3. Edit and save the keymap, then explicitly choose **Apply and enable** in
   **Remapping**. Local editing and Save do not start remapping. Use **Stop
   remapping** to release capture.

MacBook remapping does **not** require the Karabiner-Elements application or
customer-installed development tools. The standalone pqrs virtual keyboard
components are bundled; their original publisher remains visible in macOS
approval. Stop overlapping Karabiner mappings before a trial, and keep your
existing setup until physical testing is complete.

Native updates use the complete installer so the app and privileged helper stay
together; the old app-only updater is not used for native releases. Public
release still requires Developer ID certificates, notarization, clean-machine
installation and physical remapping/recovery acceptance. See
[native setup and acceptance](docs/user/native-remapping.md) and the
[standalone release contract](docs/release/standalone-macos.md).

### Permissions it asks for

| Permission | Why |
|---|---|
| Documents folder | Your config repos usually live there. Other folders are only read after you pick them. |
| Accessibility | Only for the scroll engine under **This Mac › Scroll & Mouse**. |
| Input Monitoring and administrator authorization | Native MacBook remapping uses a privileged keyboard service. The complete native build bundles its setup; approve the service and virtual-keyboard driver before enabling it. |

External keyboard firmware builds are a separate workflow: they currently require
GitHub CLI (`gh`) authentication and git operations on your config repository.
Those tools are not required for native MacBook remapping. The app does not
provide an arbitrary shell-command input.

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
| **This Mac › MacBook Keys** | Native remaps, combos, layers and homerow mods, with explicit apply/stop controls. Optional Karabiner-Elements compatibility export. |
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

Source development requires Bun, Rust and Xcode’s C++23 toolchain. The normal
development app can edit/export profiles; `bun run build` alone does not produce
the complete native installer. Native builds require a helper compiled for the
actual signing Team ID, its repair package embedded in the app, and a combined
app/helper/driver package. See [native build instructions](docs/user/native-remapping.md#build-locally)
for the signing sequence and the live verification boundary.

```sh
bun install --frozen-lockfile
bun run dev          # web dev build — fs bridge lets the browser read/write the keymap files
bun run tauri:dev    # desktop app (auto-loads keymaps natively)
bun run build        # app-only build; not the complete native installer
bun run typecheck    # tsc -b
bun test
bun run scripts/gen-supported-doc.ts   # after editing src/lib/supported.ts
```

### Releasing

The native product uses `scripts/build-commercial-release.py`. Start with
`--preflight`; the [release guide](docs/release/standalone-macos.md) documents
Developer ID Application/Installer identities, notarization credentials, isolated
outputs and customer acceptance. `--build` creates and verifies a candidate; it
does not install, enable remapping, tag or publish it.

The **Legacy app-only release** workflow preserves the historical pre-0.3 path
and fails before dependency setup for version 0.3 or later. Pushing a new native
version tag is not a supported release process. Updater-key setup applies only
to that legacy path and does not replace Apple distribution signing.

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
tests/                     # frontend tests, real keymap fixtures and visual checks
src-tauri/                 # Tauri shell, native-service client, tray and OS integration
native/                    # remapping engine/service, pinned vendor code, packaging and tests
scripts/                   # catalogue tools, release/preflight builders and maintainer checks
docs/                      # user setup, release contract, research and task evidence
archive/                   # historical material retained during repository cleanup
```

## Invariants (do not break)

- `zmkParser` serializers are **minimal-diff**: saving without changes must be
  byte-identical; comments must never be stripped from untouched nodes.
- The tauri-web-shims vite alias is gated on `TAURI_ENV_PLATFORM` — removing the
  gate gives the packaged desktop app throwing fs stubs.
- `bun test` must stay green on CI; fixtures under `tests/fixtures` are real keymaps.
  Tests read only in-repo fixtures, never files under `~` (CI was red for five phases
  because of that).
- Nothing personal is compiled in: no absolute paths in `src/` (the legacy seed
  resolves `~` at runtime and only fires when the files exist).
