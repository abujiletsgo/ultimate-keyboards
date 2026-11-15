# What Ultimate Keyboards supports

<!-- generated from src/lib/supported.ts by scripts/gen-supported-doc.ts; do not edit by hand -->

## Firmware

| Feature | Supported | Notes |
|---|---|---|
| ZMK keymap (.keymap) | Yes | Layers, bindings, combos, layer add/rename/delete. Saves change only the edited lines; comments are kept. |
| ZMK behaviors | Yes | Hold-tap, mod-morph, tap-dance, macro, sticky-key and any other `zmk,behavior-*` node: edit properties, add, remove. |
| ZMK #if / #ifdef inside the keymap block | Partly | The keymap opens read-only so the editor never rewrites what it cannot reproduce. |
| ZMK single boards and splits | Yes | Configs that build a shield or a board with the controller built in (Glove80, nice!60, BT60, Planck) are detected; one part or several. |
| QMK keymap.json and VIA export | Yes | Key bindings on the physical layout; found anywhere in a qmk_userspace or keymap folder; layout from info.json / keyboard.json or downloaded from QMK; combos from keymap.c when present. |
| QMK keymap.c key editing | No | Make a keymap.json with `qmk c2json` (the app shows the command) or use a VIA export. |
| VIA / Vial: read the keymap over USB | Yes | Plugged in reads every layer and saves a backup first. |
| VIA / Vial: write keys over USB | Partly | Experimental, not yet tested on a real VIA or Vial keyboard. Build › Write to keyboard backs up, writes only changed keys, reads each back and checks the whole keymap. No lighting, macro or Vial combo writes. |

## Physical layouts

| Feature | Supported | Notes |
|---|---|---|
| ZMK `zmk,physical-layout` (dtsi) | Yes | Detected from the shield folder. |
| keymap-editor / QMK info.json, keyboard.json | Yes | Detected or imported. |
| keyboard-layout-editor (KLE) JSON | Yes | Import file in Settings. |
| Matrix transform grid | Yes | Fallback when no geometry is available. |
| Bundled catalogue | Yes | 39 layouts from ZMK's shared layouts. |
| Find my keyboard | Yes | Bundled ZMK keyboards (single boards and splits) and popular QMK splits work offline; any other QMK keyboard is found by searching QMK's online list. |
| Drawing a layout by hand | No | Import a KLE file instead. |

## Pointing devices

| Feature | Supported | Notes |
|---|---|---|
| Tune Azoteq IQS5XX trackpad | Yes | Speed, scroll, natural scroll, taps, press-and-hold, axis flips, filtering, snipe, scroll layer. |
| Tune Pixart PMW3610 / PMW3360 trackball | Yes | Speed, CPI, invert, smart mode, snipe, scroll layer. |
| Tune Cirque Pinnacle trackpad | Yes | Speed, sensitivity, invert, snipe, scroll layer. |
| Add Trackball — Pixart PMW3610 (SPI) | Yes | Tested on nice!nano v2, zmkfirmware/zmk main (in-tree driver). Remove restores the files exactly. |
| Add Trackpad — Azoteq IQS5XX (I²C) | Yes | Tested on nice!nano v2, zmkfirmware/zmk main + AYM1607/zmk-driver-azoteq-iqs5xx main. Remove restores the files exactly. |
| Add Trackpad — Cirque Pinnacle (SPI) | Partly | Untested template: review every pin in the diff preview before applying. |
| QMK pointing flags | Yes | POINTING_DEVICE_ENABLE / DRIVER, rotation, invert, CPI in rules.mk and config.h. |

## Build & flash

| Feature | Supported | Notes |
|---|---|---|
| GitHub Actions firmware builds | Yes | Requires a separately installed GitHub CLI (`gh`) and your own GitHub login; this is not a self-contained local build tool. |
| Flash a UF2 to a keyboard or half in bootloader | Yes | Waits for the drive and copies the file. For QMK, any .uf2 built elsewhere (RP2040 boards). |
| QMK firmware builds | No | The Build tab shows the exact `qmk compile` / `qmk flash` commands and the QMK Configurator route; DFU and other non-UF2 flashing go through QMK Toolbox. |
| Build the config on screen | Yes | Build saves, commits and pushes only the keymap and pointing files, waits for that commit's GitHub build and downloads it; Flash only offers firmware built from the commit on screen. |

## This Mac

| Feature | Supported | Notes |
|---|---|---|
| Native MacBook remapping | Partly | Built-in keyboard remaps, combos, layers and homerow mods through the bundled driver and service; no other key app needed. macOS 13+ on Apple silicon, administrator/driver and Input Monitoring approvals required. Live hardware acceptance remains pending. |
| Scroll engine for wheel mice | Yes | Reverse direction and speed. Needs Accessibility permission. |
| Turn off the built-in keyboard | Yes | Restored when the app quits normally, or on its next launch after a crash. |

## Platform

| Feature | Supported | Notes |
|---|---|---|
| macOS 13+ (Apple silicon native product) | Yes | Development previews are not commercial notarized releases. Public distribution requires a Developer ID-signed and notarized complete installer. |
| Complete-installer updates | Partly | Native releases open the release page for the complete installer, updating app and keyboard service together. Requires a published release; app-only in-app updates are disabled for native versions. |
| Windows / Linux / web | No | Not in version 1. |
