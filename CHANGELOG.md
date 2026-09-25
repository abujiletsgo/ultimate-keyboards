# Changelog

All notable changes are listed here. Versions follow [Semantic Versioning](https://semver.org).
The release workflow uses the section for a version as that release's notes.

## [0.2.0] — 2026-09-25

First public-ready release.

### Added
- **Any keyboard.** Add ZMK or QMK keyboards from a config folder or a single file; firmware, keymap, physical layout and pointing sensors are detected. Rename, change files or layout, and remove keyboards in Settings.
- **Physical layouts** from ZMK `zmk,physical-layout`, keymap-editor / QMK `info.json`, keyboard-layout-editor JSON, matrix transforms, and a bundled catalogue of ZMK's shared layouts.
- **Devicetree parser** (tree-sitter): edits touch only the changed bytes; comments and formatting are kept.
- **Behaviors tab** for hold-tap, mod-morph, tap-dance, macros and other ZMK behaviors.
- **Build tab**: GitHub Actions runs and artifact download through your own `gh` login, and UF2 flashing to a half in bootloader.
- **Add / remove pointing devices** from tested templates (PMW3610 trackball, Azoteq IQS5XX trackpad; Cirque marked untested), with a diff preview and exact removal. QMK pointing flags in `rules.mk` / `config.h`.
- **SVG export** of every layer, undo/redo, keyboard navigation of the key grid, in-app confirmations, app and menu-bar icons.
- **Automatic updates** (Settings › Updates) verified against the release signing key, and a **What is supported** page.
- **Add keyboard for new owners:** one screen with *Find my keyboard* (72 ZMK keyboards bundled with their default keymaps, popular QMK splits loaded from QMK), *Plugged in* (reads the keymap from a USB-connected ZMK Studio, Vial or VIA keyboard after saving a backup), *Config folder* and *Single file*.
- **Create my config:** makes a ZMK config repo on your own GitHub from ZMK's official template, with your controller and optional live editing (ZMK Studio); GitHub then builds the firmware.
- Simpler Settings and MacBook Keys (tabs, real MacBook keyboard shape), ZMK / QMK badges in the sidebar.

### Fixed
- The scroll engine switch now explains and requests the Accessibility permission instead of silently doing nothing.
- Flashing, downloads and git no longer freeze the app; failed saves are reported instead of looking successful; editing one combo no longer overwrites another.
- QMK keymaps load in the right key order for any keyboard (it was fixed to one keyboard's order).
- Corne Procyon drawn symmetrically, without the dummy outer thumb slots.

### Security
- Removed the arbitrary shell-command IPC; strict Content-Security-Policy; file access limited to `~/Documents` and folders you pick; the dev file bridge requires a per-run token.
- Every save is validated, backed up to `.bak`, and written atomically.

### Known limitations
- Builds are not signed by Apple yet. macOS asks again for Documents and Accessibility access after each update.
- macOS only (Apple silicon, macOS 12+).
- Reading and editing keyboards over USB (ZMK Studio, Vial, VIA) is new and not yet tested on real hardware; lighting changes are behind an Experimental switch.
- Automatic updates start with the next release.

## [0.1.0] — 2026-07-05

Personal build: ZMK keymap editor for two keyboards, trackpad tuning, Karabiner rule builder, scroll engine.
