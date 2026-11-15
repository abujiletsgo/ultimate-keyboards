# Ultimate Keyboards facts (last checked 2026-11-15)

Every page, listing, post and schema block quotes from here. Unknowns stay `[NEED FACT]`; never fill them by inference.

## Identity
- Name: Ultimate Keyboards (two words, both capitalised)
- Misspellings and variants people will type: "ultimate keyboard", "ultimatekeyboard", "ultimate keyboards mac", "ultimatekeyboards app". The page should say "Ultimate Keyboards" in full in its first paragraph so the singular form still matches.
- Maker: hyly (https://hyly.world/), developer Tom Kwon. `[NEED FACT: maker name as it will appear on the Developer ID / notarization certificate]`
- Canonical URL: https://hyly.world/keyboards/
- Source: https://github.com/abujiletsgo/ultimate-keyboards (MIT)
- Category phrase (buyer's words): **home row mods and layers on a MacBook's built-in keyboard**
- Second category phrase (keyboard builders): **visual ZMK and QMK keymap editor for Mac**
- One-sentence answer: Ultimate Keyboards is a macOS app that gives a MacBook's built-in keyboard split-keyboard tricks (home-row mods, layers and combos), set up in a visual editor, and also edits ZMK and QMK keyboard configs.

## Who it is for / not for
- For: MacBook users who want home-row mods, layers or combos without buying a split keyboard; split-keyboard owners on ZMK or QMK who want a visual editor on their Mac.
- Not for (honest): Intel Macs; macOS 12 or older; Windows or Linux; keyboards that run VIA/Vial only (writes are experimental, see memory `no-via-vial-test-board`).

## Platforms and requirements
| Platform | Minimum | Download | Source, date |
|---|---|---|---|
| macOS, Apple silicon (M1 or newer) | macOS 13 | Waitlist only; notarized 0.3 build not released | README.md, site content.ts, 2026-11-15 |
| External keyboards | ZMK (keys, combos, layers), QMK (keys, combos) | — | site content.ts, 2026-11-15 |

## Price
| Plan | Price | Source, date |
|---|---|---|
| App | `[NEED FACT: launch price. The site FAQ (WIP) says "we'll say on launch day"; the live JSON-LD says price 0 and the live llms.txt says "Free". Tom decides; then make all three match]` | 2026-11-15 |
| Source code | MIT licensed | LICENSE |

## What it does (each provable)
| Capability | Proof | Source, date |
|---|---|---|
| Home-row mods on the MacBook keyboard (default A=Control, S=Option, D=Shift, F=Command) | Default profile commit f76a777; site Try-it demo | 2026-11-15 |
| Combos (defaults K+L = Enter, I+O = Backspace, W+E = Escape) | f76a777 | 2026-11-15 |
| Layers (hold Space → H J K L arrows) | site demo | 2026-11-15 |
| Saving never changes the keyboard; only Apply does; Stop Remapping restores it | README Install §3 | 2026-11-15 |
| Edits ZMK and QMK configs in place; builds firmware with the user's own GitHub Actions | README | 2026-11-15 |
| Needs two System Settings approvals (driver, Input Monitoring) and an admin password at install | site FAQ | 2026-11-15 |
| Typing accuracy at speed (no misfires) | `[NEED FACT: measured misfire rate or typing test on a named MacBook]` | — |

## Limits and known gaps
- No notarized public build yet (waitlist).
- Apple silicon only; macOS 13+.
- Changes only the MacBook's built-in keyboard; other keyboards are left alone unless edited as ZMK/QMK firmware.
- VIA/Vial writes are experimental.

## Competitors and alternatives (check before any comparison page)
| Product | Where they are stronger | Where we differ | Checked |
|---|---|---|---|
| Karabiner-Elements | Mature, free, huge rule library | Visual editor for home-row mods/layers/combos; no JSON rules. (Never named in site copy per Tom; fine in comparison pages only if Tom agrees) | `[NEED CHECK]` |
| Kanata / KMonad | Cross-platform, powerful config | No config language; visual | `[NEED CHECK]` |
| ZMK Studio / nickcoutsos keymap-editor | Live keymap edit on the device (ZMK Studio) | Mac app; also remaps the built-in keyboard | `[NEED CHECK]` |
| QMK Configurator / VIA / Vial | Established for QMK | One app for ZMK and QMK plus MacBook | `[NEED CHECK]` |

## Official profiles (Organization `sameAs`)
- Website: https://hyly.world/keyboards/
- GitHub: https://github.com/abujiletsgo/ultimate-keyboards
- `[NEED FACT: YouTube, X, Reddit user, Product Hunt, AlternativeTo, LinkedIn]`

## Change log
- 2026-11-15: first version (SEO/AEO/GEO workflow run).
