# What Ultimate Keyboards supports

<!-- generated from src/lib/supported.ts by scripts/gen-supported-doc.ts; do not edit by hand -->

## Firmware

| Feature | Supported | Notes |
|---|---|---|
| ZMK keymap (.keymap) | Yes | Layers, bindings, combos, layer add/rename/delete. Saves change only the edited lines; comments are kept. |
| ZMK behaviors | Yes | Hold-tap, mod-morph, tap-dance, macro, sticky-key and any other `zmk,behavior-*` node: edit properties, add, remove. |
| ZMK #if / #ifdef inside the keymap block | Partly | The keymap opens read-only so the editor never rewrites what it cannot reproduce. |
| QMK VIA layout JSON | Yes | Key bindings on the physical layout; combos from keymap.c when present. |
| QMK keymap.c key editing | No | Edit keys through a VIA layout export instead. |
| Vial / VIA live (USB) editing | No | The app edits files; it does not talk to the keyboard over USB. |

## Physical layouts

| Feature | Supported | Notes |
|---|---|---|
| ZMK `zmk,physical-layout` (dtsi) | Yes | Detected from the shield folder. |
| keymap-editor / QMK info.json, keyboard.json | Yes | Detected or imported. |
| keyboard-layout-editor (KLE) JSON | Yes | Import file in Settings. |
| Matrix transform grid | Yes | Fallback when no geometry is available. |
| Bundled catalogue | Yes | 39 layouts from ZMK's shared layouts. |
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
| GitHub Actions firmware builds | Yes | Run list and artifact download through your own `gh` login. |
| Flash a UF2 to a half in bootloader | Yes | Waits for the drive and copies the file. |
| git commit / push from the app | No | Commit in your usual git tool; the Build tab shows uncommitted changes. |

## This Mac

| Feature | Supported | Notes |
|---|---|---|
| Karabiner-Elements rules | Yes | Remaps, combos, layers, homerow mods for the built-in keyboard. Needs Karabiner-Elements installed. |
| Scroll engine for wheel mice | Yes | Reverse direction and speed. Needs Accessibility permission. |
| Turn off the built-in keyboard | Yes | Restored automatically if the app crashes. |

## Platform

| Feature | Supported | Notes |
|---|---|---|
| macOS 12+ (Apple silicon) | Yes | Builds are not signed yet: macOS asks again for Documents and Accessibility access after each update. |
| Automatic updates | Partly | Settings › Updates checks GitHub Releases and verifies each download with the release signing key. Works once signed releases are published. |
| Windows / Linux / web | No | Not in version 1. |
