# Changelog

All notable changes are listed here. Versions follow [Semantic Versioning](https://semver.org).
The release workflow uses the section for a version as that release's notes.

## [0.3.0] — Native remapping preview (unreleased)

### Added

- Searchable MacBook symbol choices, including **+ · plus**, that save the required US ANSI keycode and Shift modifier and display the symbol on the keymap.
- Native keyboard service and deterministic engine for built-in-keyboard remaps, combos, layers, and home-row mods. Karabiner-Elements export remains optional.
- Bundled setup for the standalone signed virtual-HID driver and our signed helper, with compatible-driver reuse, explicit activation and permission steps, apply/stop controls, and background lease recovery.
- A combined application/helper/driver installer, with signed-app validation, an app-close requirement, and a separate in-app repair package.
- Native profile export, bounded authenticated service IPC, driver/readiness diagnostics, and engine/service/packaging checks.
- Native layer timing controls: immediate momentary layers, balanced tap/hold, fast chords, and timer-only compatibility behavior.
- MacBook Keymap now shares the keyboard Keymap's board, layer strip, legend and card layout, with contextual layer edits, Base fallback indicators and compact native controls.
- MacBook and split keyboards use the same binding editor, searchable picker, semantic key styles, toolbar and layer controls. MacBook profiles support real Save/Revert, retained drafts, layer management and bounded Undo/Redo; native activation is separate in Remapping.

### Fixed

- Native helper updates wait for launchd to remove the stopped job before starting it, then verify the new running job and listening endpoint. This fixes an installer race that left the app copied but the remapper unavailable.
- Choosing an existing keyboard's config folder now grants recursive access to nested keymap and pointing files.
- MacBook key previews keep readable labels and bright combo colours, with shared-key colours and clear hover/focus outlines.
- Native setup preserves the standard installer component layout and checks actual PackageKit admission. Permission setup uses the helper's own app identity, with explicit service refresh after approval.
- Active keyboard processing wakes on input instead of adding a fixed sleep after each pass; layer chords can resolve before the hold fallback while home-row timing stays unchanged.
- Shared binding popups focus correctly after placement and handle nested picker Escape/Tab without closing or trapping the wrong dialog.

### Verification boundary
- Native remapping needs macOS 13+, admin installation, driver approval and Input Monitoring. Fn/media are pass-through only; Fn remapping is not supported.
- Live capture, secure input, sleep/wake and driver-loss acceptance must be verified on an approved installation. Development artifacts are not notarized public releases.

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
