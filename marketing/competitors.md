# Competitor research: Ultimate Keyboards

Access date for every source: 2026-11-15. "unknown" means not found in a primary source I could fetch.

## Limits of this research (read first)

- Reddit is blocked for both search and fetch in this environment. I could not read r/ErgoMechKeyboards, r/olkb, r/zmk or r/macapps. The "complaints" and "query phrasings" below come from GitHub issues, forums, blogs and listicles, not Reddit. No Reddit thread titles are quoted because none were seen. Re-run the Reddit part with a browser (af-browse) before using it in public copy.
- Several fetches returned summaries from a small model, not raw page text (for example the KeyPath, Homerow and BetterTouchTool pages). Numbers that matter for public copy should be re-checked by eye.
- Most listicles found are low-authority (gitnux, worldmetrics, zipdo); treat as weak signals.

## Biggest finding: a direct competitor exists

**KeyPath** (malpern.github.io/KeyPath): a native Mac GUI app, free, MIT, built on Kanata, with a ready-made "Home Row Mods" pack, layers, chords, tap-hold, tap-dance, leader keys, macros, Caps Word. It runs on the MacBook built-in keyboard. Status: v1.0.1, pre-release, released 2026-07-30. Requires macOS 15+ and (per search snippet) Apple Silicon. Our macOS 13+ floor is wider. It does NOT edit ZMK/QMK, so part (b) of our product is uncontested by it. Sources: https://malpern.github.io/KeyPath/ , https://api.github.com/repos/malpern/KeyPath/releases/latest

## Comparison table

| Tool | Price / licence | Platforms | Setup | Home-row mods on MacBook built-in | Layers / combos | macOS permission / driver | Edits ZMK/QMK | Last release / activity |
|---|---|---|---|---|---|---|---|---|
| Karabiner-Elements | Free, open source; optional $10 PayPal / GitHub Sponsors donation. Licence name not stated on the pricing page | macOS only | GUI + JSON rules (generators: Goku, karabiner.ts) | No native feature. DIY via to_if_alone / simultaneous; documented misfires | Layers via variables; "combos" via simultaneous | Driver extension approval + Input Monitoring | No | v16.3.0, 2026-09-06 |
| Kanata | Open source (licence not confirmed here) | macOS, Linux, Windows | Text config (Lisp-like), CLI | Yes; many tap-hold variants incl. opposite-hand | Layers yes; chords: not confirmed in text read | Input Monitoring; Accessibility for mouse; README reportedly needs Karabiner VirtualHIDDevice driver on macOS 11+ (secondary source) | No | v1.12.0, 2026-07-05 |
| KMonad | MIT | macOS, Linux, Windows | Text config | Yes (tap-hold, `tap-hold-next-release`) | Layers, multi-tap | unknown (install doc not read) | No | 0.4.5, 2026-05-03 |
| KeyPath | Free, MIT, pre-release | macOS 15+ (Apple Silicon + Intel per site) | Native GUI + optional text config | Yes, prebuilt pack | Layers, chords, tap-dance, leader, macros | States Accessibility only, no driver (conflicts with Kanata README; unverified) | No | v1.0.1, 2026-07-30 |
| BetterTouchTool | Paid; site shows Standard $15 / Lifetime $25, "depends on country & taxes"; 45-day trial | macOS | GUI | No home-row-mod/tap-hold-by-neighbour feature found; has short/long press, Hyper key | Triggers/shortcuts, not ZMK-style layers/combos | unknown | No | "Ready for macOS 27"; exact release date unknown |
| Keyboard Maestro | $36 one-time (v11) | macOS | GUI macros | Not a remapper; automation | n/a | unknown | No | unknown |
| Homerow (homerow.app) | One-time, listed as "$4999" (likely $49.99), free trial, macOS 13+ | macOS | GUI | NOT home-row mods: it is mouse-free UI clicking. Name collision, SEO risk | n/a | unknown | No | unknown |
| ZMK Studio | Free, open source | Web (Chrome/Edge) + native Win/Linux/macOS | GUI, live over USB/BLE | n/a (firmware) | Combos not yet supported ("planned") | USB access; Linux group perms | ZMK only, live | studio app v0.3.1 2025-01-20; ZMK v0.3.0 2025-08-01 |
| nickcoutsos keymap-editor | MIT, 2,103 stars | Web (Chromium for file mode) | GUI, GitHub repo commit-back | n/a | Combos, conditional layers, macros, behaviours: yes | GitHub OAuth-style access to zmk-config repo | ZMK only; does not build (user's own CI) | Repo pushed 2026-10-29; README says source updates no longer published in repo |
| QMK Configurator | Free | Web | GUI | n/a | Layers yes; combos not in this research | none | QMK, JSON keymaps only, build via QMK userspace + GitHub Actions | unknown (qmk_firmware release lookup failed) |
| VIA | Free, GPL-3.0 (repo the-via/app) | Web/desktop (docs inconsistent) | GUI live | n/a | Layers, macros; combos/tap dance unclear | WebHID (Chrome/Edge) | QMK keyboards VIA supports (1400+) | repo pushed 2026-09-22; no GitHub releases |
| Vial | GPL-2.0 (vial-gui) | Win/Linux/Mac + Vial Web | GUI live, needs Vial firmware | n/a | Layers, tap dance, combos, macros | WebHID in browser | Vial-QMK fork only | vial-gui v0.7.5, 2025-08-02; repo pushed 2026-05-25 |
| MoErgo Layout Editor | Free web app, account required | Web | GUI -> .uf2 | n/a | Combos yes | account | ZMK for MoErgo boards | unknown |

## Per-tool notes with sources

### Karabiner-Elements
- Free, open source; $10 PayPal "effectively a donation" or GitHub Sponsors: https://karabiner-elements.pqrs.org/docs/pricing/
- Latest v16.3.0 on 2026-09-06: https://api.github.com/repos/pqrs-org/Karabiner-Elements/releases/latest
- Permissions: allow driver extension for the virtual keyboard; Input Monitoring: https://karabiner-elements.pqrs.org/docs/getting-started/installation/
- Home-row mods: issue "how to simulate QMK home row mods in karabiner?" (#3559) closed "not planned" 2026-02-14 after stale bot. Reports: to_if_alone misfires ("fa" from "fast"), disables key repeat; ~100-120 ms reduced misfires; several commenters moved to KMonad/Kanata: https://github.com/pqrs-org/Karabiner-Elements/issues/3559
- Community recipe: karabiner.ts-greg-mods: https://unpkg.com/karabiner.ts-greg-mods@0.7.0/README.md
- Where it is stronger: 10+ years of use, big community rule library, per-device rules, profiles, pointing-device rules (KeyPath admits these gaps: https://malpern.github.io/KeyPath/migration/karabiner-users/).
- Complaints: no tap-hold timing sophistication; JSON config; driver approval prompts ("Driver alert keeps showing up" is a troubleshooting-index title: https://karabiner-elements.pqrs.org/docs/help/troubleshooting/).

### Kanata
- Cross-platform, Linux/macOS/Windows: https://www.github.com/jtroo/kanata ; v1.12.0 2026-07-05: https://api.github.com/repos/jtroo/kanata/releases/latest
- Tap-hold variants include tap-hold-press, -release, -release-keys, -opposite-hand, -opposite-hand-release, -order, -except-keys: https://raw.githubusercontent.com/jtroo/kanata/refs/heads/main/docs/config.adoc
- macOS: Input Monitoring; Accessibility for mouse events (issue #1574): https://github.com/jtroo/kanata/blob/main/docs/platform-known-issues.adoc
- Open macOS issue: PR #2070 adds a repeat engine because tap-hold delays let OS autorepeat duplicate keys (via search result, https://github.com/jtroo/kanata/pull/2070 mirror).
- Complaints (XDA, Chandraveer Mathur, 2025-11-12): "Kanata has a learning curve", Lisp-like parentheses, not a GUI, needs command line: https://www.xda-developers.com/kanata-advanced-cross-platform-keyboard-remap-qmk-ahk-replacement/
- Stronger than us: far deeper tap-hold algorithms, free, cross-platform, huge config sample library (e.g. https://github.com/KensukeM39/kanata-homerow-hyper-keymap).

### KMonad
- MIT, macOS/Linux/Windows, tap-hold, layers: https://github.com/kmonad/kmonad ; 0.4.5 on 2026-05-03: https://api.github.com/repos/kmonad/kmonad/releases/latest
- Precondition guide recommends `tap-hold-next-release` for rolls and notes KMonad macOS uses `iokit-name` input and `kext` output: https://precondition.github.io/home-row-mods
- Slower release cadence than Kanata; text config only.

### KeyPath (see "Biggest finding")
- https://malpern.github.io/KeyPath/ ; migration page: https://malpern.github.io/KeyPath/migration/karabiner-users/
- Admits: no community rule library, no per-device UI, no profile switching, newer track record; cannot run alongside Karabiner.
- Our edge vs it: macOS 13+ (it needs 15+), own driver/helper plus ZMK/QMK editing and firmware builds. Its edge: free, MIT, shipping, Kanata's mature tap-hold engine.

### BetterTouchTool
- Site shows Standard $15, Lifetime $25 (taxes/country vary), 45-day trial, Hyper key, short/long press, left/right modifier distinction: https://folivora.ai/buy , https://folivora.ai/
- No home-row-mod feature found. Do not claim BTT lacks it without testing. The boastr.net page is an abandoned legacy site, do not cite it for pricing.
- Most-named paid Karabiner alternative in listicles (AlternativeTo, TextExpander).

### Other Mac tools (shown by roundups)
- Keyboard Maestro: $36 one-time, v11: https://www.keyboardmaestro.com/main/
- HyperKey (Caps Lock to Hyper only), Hammerspoon (Lua), hidutil (built in), Raycast, Espanso: https://textexpander.com/blog/karabiner-elements-alternatives
- Homerow (homerow.app): UI click-by-keyboard, ~$49.99 one-time, macOS 13+: https://www.homerow.app . Different category but name overlaps "home row" queries; do not compare as a mod tool.

### ZMK Studio
- Live edit over USB/BLE; native Win/Linux/macOS + web (Chrome/Edge); needs `&studio_unlock`; Studio-managed keymap ignores later .keymap edits until "Restore Stock Settings"; combos, conditional layers, macros/tap dance properties "planned"; alpha; much more RAM: https://zmk.dev/docs/features/studio
- Apps release v0.3.1 2025-01-20: https://api.github.com/repos/zmkfirmware/zmk-studio/releases/latest ; ZMK v0.3.0 2025-08-01: https://api.github.com/repos/zmkfirmware/zmk/releases/latest
- Complaint (community spreadsheet): "ZMK Studio is very limited in many respects, and development is extremely slow!": https://docs.google.com/spreadsheets/d/1oOSf841CpxbtyEvO1WS_WcBE-owXdGDzm-MO4GpkaFc
- Stronger than us: official, no reflash, live. Weaker: no combos.

### nickcoutsos keymap-editor
- Web GUI for ZMK keymaps, GitHub/clipboard/file system; combos, conditional layers, macros, behaviours; does not build firmware: https://github.com/nickcoutsos/keymap-editor
- Limitations page: solo WIP, no runtime updates, no physical-layout/RGB edits, can't edit keymaps inside a ZMK clone, ignores forks/beta behaviours: https://github.com/nickcoutsos/keymap-editor/wiki/Limitations-of-the-Keymap-Editor
- 2,103 stars, MIT, pushed 2026-10-29: https://api.github.com/repos/nickcoutsos/keymap-editor
- Closest functional rival to our part (b). Our differentiator would be integrated GitHub Actions build + native app + the same editor for MacBook layer. Hosted free web tool; our price must justify itself against it.
- ZMK project blog endorsement: https://zmk.dev/blog/2023/11/09/keymap-editor

### QMK Configurator
- Web GUI; the Configurator JSON cannot be converted to keymap.c; docs have a GitHub-Actions userspace build flow: https://docs.qmk.fm/newbs_building_firmware_workflow
- Version/date: unknown (release lookup 404).

### VIA / Vial
- VIA: "Compatible with 1400+ keyboards": https://www.caniusevia.com/ ; repo GPL-3.0, pushed 2026-09-22, 1,665 stars: https://api.github.com/repos/the-via/app
- Vial: open source, Win/Linux/Mac + Vial Web, manual lists layers, macros, tap dance, combos: https://get.vial.today/ ; vial-gui v0.7.5 2025-08-02: https://api.github.com/repos/vial-kb/vial-gui/releases/latest ; GPL-2.0, pushed 2026-05-25: https://api.github.com/repos/vial-kb/vial-gui
- Vial needs Vial-specific firmware (secondary: https://www.github.com/winslet/vial-doc). Both are live-edit, no build step.
- Jens Getreu's cross-firmware HRM article (QMK+ZMK+Vial+Kanata): https://blog.getreu.net/20250826-muscle-memory-friendly-home-row-mods/

### MoErgo Layout Editor (extra)
- Account-based web editor, outputs .uf2, combos supported: https://docs.moergo.com/layout-editor-guide/combos/ , https://docs.moergo.com/go60-user-guide/customizing-key-layout/ . Not a ZMK-general tool.

### Home-row-mod timing/misfire reference (for honest copy)
- ZMK hold-tap: flavors hold-preferred, balanced, tap-preferred, tap-unless-interrupted; tapping-term-ms default 200; require-prior-idle-ms; quick-tap-ms; hold-trigger-key-positions for positional HRM: https://zmk.dev/docs/keymaps/behaviors/hold-tap
- QMK-world guidance: tapping term 150-220 ms; avoid Hold-On-Other-Key-Press for HRM; combo term under 100 ms: https://precondition.github.io/home-row-mods
- Our product should state which of these it implements; I have not seen its own timing spec.

## Top 10 query phrasings seen (non-Reddit; no Reddit access)

Search-result titles and phrasings, not verified as autocomplete:
1. "how to simulate QMK home row mods in karabiner?" (https://github.com/pqrs-org/Karabiner-Elements/issues/3559)
2. "Kaleidoscope-like functionality on built-in Mac keyboard?" (https://community.keyboard.io/t/kaleidoscope-like-functionality-on-built-in-mac-keyboard/5374)
3. "home row mods macbook built-in keyboard" (my query; results above)
4. "Best Karabiner-Elements alternatives for Mac and Windows" (TextExpander)
5. "Karabiner Elements Alternatives" (AlternativeTo)
6. "Home row mods for Framework 16 with keyboard.frame.work" (https://community.frame.work/t/solved-home-row-mods-for-framework-16-with-keyboard-frame-work/73911)
7. "Muscle memory friendly home row mods (QMK+ZMK+Vial+Kanata)" (Getreu)
8. "Limitations of the Keymap Editor" (nickcoutsos wiki)
9. "Using ZMK Studio" (https://guides-mechboards.gitbook.io/guides/other-guides/using-zmk-studio)
10. "Hyper Key switch back to Karabiner Elements" (https://talk.macpowerusers.com/t/hyper-key-switch-back-to-karabiner-elements/40251)
Also: "Home row computing on Macs" (https://engineered.at/articles/home-row-computing-on-macs), "This weird keyboard technique has improved the way I type" (https://blog.dreamsofcode.io/this-weird-keyboard-technique-has-improved-the-way-i-type).
TODO: replace with real Reddit titles.

## Roundup / listicle outreach targets

| URL | Author | Date | Tools listed |
|---|---|---|---|
| https://textexpander.com/blog/karabiner-elements-alternatives | Josh Centers (TextExpander vendor blog) | pub 2026-04-20, updated 2026-10-21 | Karabiner-Elements, HyperKey, Keyboard Maestro, BetterTouchTool, hidutil, Hammerspoon, AutoHotkey, PowerToys, SharpKeys, TextExpander; mentions Espanso, Raycast |
| https://alternativeto.net/software/karabiner-elements/?platform=mac | AlternativeTo (user-submitted) | ongoing | BetterTouchTool, Keyboard Maestro, Hammerspoon, Kanata, Remap Keyboard, others. Users can add and like an entry: good low-effort target |
| https://alternativeto.net/software/kanata/ | AlternativeTo | ongoing | Kanata alternatives (add KeyPath-like apps) |
| https://www.xda-developers.com/kanata-advanced-cross-platform-keyboard-remap-qmk-ahk-replacement/ | Chandraveer Mathur | 2025-11-12 | Kanata (single-tool piece); pitch the GUI angle |
| https://textexpander.com/blog/top-keyboard-shortcut-apps | TextExpander | date unknown | shortcut apps, unknown list |
| https://hotkeyclash.pages.dev/compare/best-shortcut-tools/ | unknown | 2026 | unknown |
| https://www.itechguides.com/best/keyboard-and-mouse-customization-software/ | itechguides | 2026 | unknown |
| https://gitnux.org/best/keyboard-mapping-software/ , https://zipdo.co/best/keyboard-mapping-software/ , https://worldmetrics.org/best/keyboard-remapping-software/ | auto-generated, no named author | 2026 | Karabiner-Elements near top; low authority |
| https://www.producthunt.com/products/karabiner/alternatives | Product Hunt | ongoing | Karabiner alternatives; listing our product is possible at launch |
| https://zmk.dev/blog/2023/11/09/keymap-editor | ZMK project | 2023-11-09 | keymap-editor endorsement (not a roundup) |
| https://sites.google.com/view/keyboards/layout/gui-behaviors-vs-custom | community guide | unknown | GUI ZMK behaviours vs custom |
| https://tech-insider.org/qmk-vs-via-vs-zmk-keyboard-firmware-2026/ | unknown | 2026 | QMK, VIA, ZMK; low authority |

No credible 2026 head-to-head review of KeyPath vs Karabiner vs Kanata was found.

## Positioning implications (facts only)

- Part (a) is not empty: free KeyPath already offers a Mac GUI for home-row mods on Kanata. Free Kanata/KMonad/Karabiner cover the same function with config files.
- Part (b) overlaps free keymap-editor and ZMK Studio (no combos), plus Vial/VIA for live QMK editing. Nobody found combines a MacBook-keyboard remapper with ZMK/QMK editing and builds.
- Karabiner HRM issue closed "not planned": maintainers are not adding it.
- "Homerow" is a different product; avoid confusion in copy and SEO.
- Unverified and worth testing: whether Kanata/KeyPath on macOS 26 needs the Karabiner VirtualHIDDevice driver (sources conflict).
