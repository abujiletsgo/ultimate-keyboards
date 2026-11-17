# Ultimate Keyboards facts (last checked 2026-11-17)

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
| Ultimate Keyboards (free) | $0: home-row mods with misfire protection, layers, combos, Hyper on Caps Lock, layer overlay, health panel, ZMK/QMK editing and flashing | Tom, 2026-11-15 |
| **Ultimate Keyboards Pro** | **$24 one-time (launch price $19)**: type on iPhone/iPad from the MacBook keyboard, per-app layers, one layout for MacBook + ZMK/QMK board, iCloud sync and presets | Tom, 2026-11-15 |
| iPhone/iPad app | Free; Pro is checked on the Mac (the Mac sends the keys). App Store rule check pending before launch | Tom, 2026-11-15 |
| Sales | Direct, license key (Paddle or Lemon Squeezy); optional Setapp later. No subscription | plan, 2026-11-15 |
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

## Positioning (Tom, 2026-11-15)
- Pitch: the friendliest way to get split-keyboard powers on a MacBook; explained in plain words, set up by clicking, not config files.
- Differentiators: misfire-safe home-row mods; UI/UX (visual keyboard, plain language) vs Karabiner JSON / Kanata Lisp; one layout for MacBook and board; MacBook keyboard on iPhone/iPad.

## Limits and known gaps
- No notarized public build yet (waitlist).
- Apple silicon only; macOS 13+.
- Changes only the MacBook's built-in keyboard; other keyboards are left alone unless edited as ZMK/QMK firmware.
- VIA/Vial writes are experimental.

## Competitors and alternatives (full table with sources: `marketing/competitors.md`, 2026-11-15)
| Product | Where they are stronger | Where we differ |
|---|---|---|
| KeyPath (closest rival) | Free, MIT, ready-made home-row-mods pack on Kanata | We run on macOS 13+ (KeyPath needs 15+), and also edit ZMK/QMK |
| Karabiner-Elements | Mature, free, big rule library | Home-row mods built in (Karabiner's request closed "not planned" 2026-02-14); visual setup |
| Kanata / KMonad | Most tap-hold variants, cross-platform | No config language |
| nickcoutsos keymap-editor, ZMK Studio | Free; ZMK Studio edits live on the device | One Mac app that also builds firmware via the user's GitHub Actions; ZMK Studio lacks combos (planned) |
| VIA / Vial / QMK Configurator | Free, established for QMK | Same app as the MacBook remapper |
| Homerow (homerow.app) | n/a: different product (mouse-free clicking) | Name overlap only; avoid confusion |

## Official profiles (Organization `sameAs`)
- Website: https://hyly.world/keyboards/
- GitHub: https://github.com/abujiletsgo/ultimate-keyboards
- `[NEED FACT: YouTube, X, Reddit user, Product Hunt, AlternativeTo, LinkedIn]`

## Locale rows: names, category phrases and misspellings (added 2026-11-17)

Canonical locale routes (once `HW-L10N-07` / `HW-L10N-40` ships; `https://hyly.world/keyboards/` serves as `x-default` selector): `/en/keyboards/`, `/es/keyboards/`, `/pt/keyboards/`, `/ko/keyboards/`. Tone rules (`intent.md`): Spanish `tú` (neutral pan-Hispanic), Brazilian Portuguese `você` (with `pt-PT` lexical bridges where helpful), Korean `해요체` in UI/store/guides and `합니다체` in legal notices.

| Locale (`html lang` / `hreflang` / `og:locale`) | Display name on locale surfaces | Local category phrase 1 (MacBook buyer's words) | Local category phrase 2 (ZMK/QMK builder's words) | Local misspellings, transliterations & real query variants |
|---|---|---|---|---|
| **English (`en`)**<br>`lang="en"` · `hreflang="en"` (`+ x-default`) · `og:locale="en_US"` | `Ultimate Keyboards` | **home row mods and layers on a MacBook's built-in keyboard** | **visual ZMK and QMK keymap editor for Mac** | `"ultimate keyboard"`, `"ultimatekeyboard"`, `"ultimate keyboards mac"`, `"ultimatekeyboards app"` |
| **Spanish (`es`)**<br>`lang="es"` · `hreflang="es"` · `og:locale="es_LA"` (`+ es_ES`) | `Ultimate Keyboards` | **home row mods, capas y remapeo de teclas en el teclado integrado del MacBook** | **editor visual de keymaps ZMK y QMK para Mac** | `"ultimate keyboard mac"`, `"ultimatekeyboards"`, `"ultimate keyboards español"`, `"ultimate keyboards gratis"`, `"ultimate keyboards pago único"`, `"remapear teclado mac"`, `"poner la ñ teclado ingles macbook"` (unaccented mobile typing: `poner la n macbook`, `configurar teclado ingles mac`; never translate *home row mods* literally as *"modificaciones de fila de casa"*) |
| **Portuguese (`pt-BR` + `pt-PT`)**<br>`lang="pt-BR"` · `hreflang="pt"` (`+ pt-BR`) · `og:locale="pt_BR"` (`+ pt_PT`) | `Ultimate Keyboards` | **home row mods, camadas (layers) e remapeamento de teclas no teclado integrado do MacBook** | **editor visual de keymaps ZMK e QMK para Mac** | `"ultimate keyboard mac"`, `"ultimatekeyboards"`, `"ultimate keyboards portugues"`, `"ultimate keyboards gratis"` / `"grátis"`, `"ultimate keyboards e confiavel"` / `"é confiável"`, `"ultimate keyboards reclame aqui"`, `"remapear teclado macbook"`, `"configurar teclado macbook acentos"`, `"cedilha macbook teclado ingles"` |
| **Korean (`ko`)**<br>`lang="ko"` · `hreflang="ko"` · `og:locale="ko_KR"` | `Ultimate Keyboards (얼티밋 키보드)` *(pair English + Hangul in `<title>`, `<h1>` and lead paragraph)* | **맥북 내장 키보드 홈로우 모드·레이어·키 매핑 앱** | **맥용 비주얼 ZMK·QMK 키맵 에디터** | Hangul spellings & spacing variants: `"얼티밋 키보드"`, `"얼티밋키보드"`, `"얼티밋 키보즈"`, `"얼티밋키보즈"`, `"얼티메이트 키보드"`, `"얼티메이트키보드"`, `"울티메이트 키보드"`, `"Ultimate Keyboards 맥"`, `"홈로우 모드"` / `"홈 로우 모드"` / `"홈로우모드"`, `"키보드 매핑"` / `"키보드매핑"`, `"한영전환"` / `"한영 전환"`, `"키맵 에디터"` / `"키맵에디터"` |

### Companion phone/tablet keyboard app facts (added 2026-11-17 from `docs/plan/type-on-iphone.md` & `docs/plan/type-on-android.md`)
- Package / Bundle ID: `world.hyly.keyboards` (iOS keyboard extension `world.hyly.keyboards.keyboard`, Apple Team `D4H83LGM8K`; macOS app stays `com.ultimatekeyboards.app`).
- Status: **spec / pre-release** (`KE-50..54` for iPhone/iPad, `KE-79/81` for Android `minSdk 29` Android 10+ and Windows `service-win`). `[NEED FACT: Google Play Console and App Store Connect live listing status and public release dates]`.
- Store model: free download on Google Play (`en-US`, `es-419`, `es-ES`, `es-US`, `pt-BR`, `pt-PT`, `ko-KR`) and Apple App Store (`en-US`, `es-MX`, `es-ES`, `pt-BR`, `pt-PT`, `ko`), zero ads, zero account required; **Ultimate Keyboards Pro** ($24 one-time, launch $19) is checked on the desktop sender. The macOS remapper itself is distributed as a Developer ID direct installer on `hyly.world` because the Mac App Store's mandatory App Sandbox blocks global low-level HID keyboard interception.
- Provable hard limits to state in store copy (`docs/store/`): typing and text editing only (no mouse pointer, `⌘Tab`, or Home screen); iOS switches to the system keyboard on password/passcode fields and in apps blocking third-party keyboards; Android banking/security custom keypads use their own keypad; keys stay on the laptop whenever no text field is active on the phone, and a one-tap button switches back to the phone's regular keyboard.

## Change log
- 2026-11-15: first version (SEO/AEO/GEO workflow run).
- 2026-11-15: competitor research added (Reddit not reachable; re-check prices by eye before public copy).
- 2026-11-15: tiers and price locked (Tom): free core + Pro $24 one-time (launch $19).
- 2026-11-15: price model set to freemium (Tom); split and prices still open.
- 2026-11-17: added `es`, `pt-BR`/`pt-PT` and `ko` locale rows (local category phrases, Hangul spellings, spacing/accent variants) and companion mobile keyboard (`world.hyly.keyboards`) store-draft facts (`HW-SEO-15`).
