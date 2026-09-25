# Ultimate Keyboards — flagship product plan (v2, 2026-09-24; v1 + Codex critique resolved once)

Inputs: `docs/audit/2026-09-24-flow-audit.md` (35 findings: 6 P0, 14 P1, 15 P2; 23 drift rows; 27 hardcoded-assumption rows), `docs/audit/2026-09-24-security-audit.md` (15 findings: 1 Critical, 3 High, 7 Medium, 4 Low), `docs/research/2026-09-24-market.md` (12 competitors, 4 layout formats, 5 pointing modules, distribution norms).

## 0. Directive scrutiny (before building)

| Directive | Claim that makes it right | Strongest counter | Accepted cost / boundary |
|---|---|---|---|
| "Flagship app people with ZMK/QMK boards can use" | Research: no incumbent is file-based + ZMK & QMK + custom layouts + pointing-aware. ZMK Studio (official) will never do custom layouts or combos; keymap-editor is stale and pointing-blind. The gap is real. | Most users are served well enough by ZMK Studio (runtime, no build) + keymap-editor. A file editor competes on breadth of devicetree it can round-trip, which is a parser problem, not a UI problem. | Accept. The true cost is a real devicetree parser that preserves unknown nodes (Phase 3). Until then we ship "any ZMK config repo whose keymap uses the common shapes", and say so. |
| "Pick keyboard type, fully custom layout" | Layout formats are well-specified (KLE, QMK info.json, ZMK physical-layout, keymap-editor info.json); keymap-drawer (MIT) already implements all four importers. Auto-detect from a config repo covers most users with zero drawing. | A drag-and-drop layout builder is a large surface with low frequency of use; most people import or auto-generate. | Phase 1 = registry + importers + auto-detect (covers ~all). Phase 5 = visual builder, last, only if Phase 1 telemetry-free feedback says imports fail often. |
| "Add/remove trackpad, trackball" | Pointing setup is the least-served capability (1/9 competitors, partial). Tom has already done it by hand twice; the shapes (west.yml module, .conf flags, overlay pinctrl+bus+sensor+listener) are templatable. | Pin/bus config is board-specific and wrong values brick nothing but waste hours; generic generation for arbitrary boards is where bugs will live. | Phase 4 supports KNOWN modules only (PMW3610, Azoteq IQS5XX, Cirque Pinnacle) via templates from canonical configs, always with a diff preview before writing, never silent. "Custom sensor" = escape hatch to raw overlay editing. |
| "Frontend security" | Audit found a Critical (any-command IPC) and three Highs (no CSP, `$HOME/**` fs scope, unauthenticated dev write bridge). | None. | Phase 0 closes all four before any build leaves this machine. |
| Web build on Vercel | Same Chromium-only constraint every competitor accepts. | Secondary; ~31% browser share; must not embed personal paths (it does today). | Keep as secondary target; ship after desktop is safe (Phase 6). |
| QMK parity | Users expect ZMK+QMK from the name. | VIA JSON cannot carry combos/pointing/tap-dance; real QMK = `keymap.json`/`keymap.c` + `config.h`/`rules.mk`. keymap.c parsing is a compiler-grade problem. | QMK v1 = `keymap.json` (Configurator format) + `config.h`/`rules.mk` pointing flags. keymap.c stays read-only / combo-only as today. Stated in-app. |

## 1. Target architecture (what changes structurally)

- **Keyboard registry** (`src/lib/registry/`): persisted descriptors `{ id, name, firmware: 'zmk'|'qmk', repoPath, keymapPath, layout: PhysicalLayout, layoutSource, pointing: PointingDescriptor[], build?: { workflow, artifactPattern } }` in `tauri-plugin-store` (desktop) / localStorage (web). Replaces `keyboards.ts`, `pointingConfig.ts` constants, QMK paths, layer-name tables.
- **PhysicalLayout** (`src/lib/layout/`): canonical `{ keys: {x,y,w,h,r,rx,ry,matrix?,hand?,encoder?}[] }` in key-units; importers KLE / QMK info.json / ZMK physical-layout dtsi / keymap-editor info.json / matrix-transform fallback grid; exporters ZMK dtsi + QMK info.json. One `<PhysicalBoard>` renderer with rotation replaces SplitKeyboard/QMKKeyboard/MacbookKeyboard geometry code.
- **Dirty registry** (`src/lib/dirty.ts`): each store registers `{ isDirty, save, revert }`; sidebar navigation, keyboard switch, Cmd+S, Revert, and Tauri `ExitRequested` consult it.
- **UI primitives** (`src/components/ui/`): Popover (portal + measured placement + dialog ARIA + focus return), ConfirmBanner, Toast, Switch, FieldLabel, ErrorPanel, Section, IconButton, BoardLegend. Design tokens for radius/z-index/text sizes; no numeric literals in TSX.
- **File I/O layer** (`src/lib/io.ts`): atomic write (tmp + rename) with one `.bak`, size cap, realpath check; the only place that writes.
- **Devicetree parser** (Phase 3): tree-sitter-devicetree (WASM) AST with byte-range edits, replacing regex slicing; unknown nodes preserved verbatim (keymap-editor's proven approach).

## 1b. Critique resolution (one opposite-vendor pass, Codex gpt-5.6-sol/high, `docs/plan/2026-09-24-codex-critique.md`)

| Codex point | Decision |
|---|---|
| Phase 0 not enough for a stranger's machine: count guard is a data-safety defect; validate-before-write; visible "Restore backup"; frozen lockfile + pinned install.sh | Accepted. All moved into Phase 0. Phase 0 renamed "safe local preview". |
| Phase 1 "Any keyboard" is misleading while the regex parser remains; make it a vertical slice and pull the real parser forward | Accepted. Phase 1 = registry + detection + ZMK-native layout import + catalogue + compatibility report. Phase 2 = real parser + corpus + remaining importers. UX polish moves to Phase 3. |
| Pointing wizard: "known module" is too loose; bound to tested tuples (module rev × controller × bus × split × ZMK version); unsupported = editable preview, no buildability claim | Accepted. |
| Cut the visual layout builder (5.1); move the catalogue (5.2) into Phase 1 | Accepted. Builder goes to backlog, reconsidered only on observed import failures. |
| Cut git push and automatic UF2 handling from build integration; keep diff preview, run status, artifact download; no stored GitHub token | Accepted for push and tokens. Partially accepted for UF2: kept as an explicit user-triggered "Flash" step (wait for volume, copy, report), never automatic. |
| QMK: JSON-only editable; keymap.c read-only with explanation; golden tests for unknown JSON fields; `qmk json2c` compile fixtures | Accepted. |
| Web build later than desktop stability | Accepted. Stays in Phase 6, after 6.1/6.2. |
| Replace non-deterministic acceptance criteria (kill -9, "identically", "≤3 clicks", "fully visible", Lighthouse) with scripted assertions | Accepted; criteria rewritten below. |
| Risks: tree-sitter WASM packaging, persisted-scope + atomic rename siblings, TCC across signed updates | Accepted as explicit spikes: 2.0, 0.2, 6.1. |

## 2. Phases (resolved order)

Every phase ends with `npx tsc -b` clean, `bun test` green, the phase's scripted checks green, a manual smoke in the packaged app, and a gate with Tom.

### Phase 0 — Safe local preview (security + data safety)

| Task | Owned files | Acceptance (scripted) |
|---|---|---|
| 0.1 Remove `run_shell_command` + `tauri-plugin-shell`; set CSP | `src-tauri/src/lib.rs`, `Cargo.toml`, `package.json`, `capabilities/default.json`, `tauri.conf.json` | grep: 0 hits for `run_shell_command`, `plugin-shell`; CSP non-null; app boots, loads, saves a fixture |
| 0.2 fs scope spike + rollout: no static `$HOME/**`; `tauri-plugin-persisted-scope` with directory grants from the folder picker; app-data dir for the registry | `capabilities/default.json`, `Cargo.toml`, `lib.rs` | harness: grant repo dir → restart → write sibling `.tmp` → rename over target → restore `.bak` → adjacent dir still denied; every step asserted |
| 0.3 Dev write bridge: Origin + Content-Type + per-run token; realpath allowlist of registered files; narrow `server.fs.allow` | `vite.config.ts`, `tauri-web-shims/plugin-fs.ts` | curl POST without token or with foreign Origin → 403; with both → 200 only for a registered file |
| 0.4 `io.ts`: validate-before-write (re-parse the output; refuse if layer/key counts changed), atomic tmp+rename, one `.bak`, 1 MB cap; count-mismatch guard blocks edits when layout≠keymap length; all writers use it; remove `'{}'` fallback | `src/lib/io.ts`, `zmkStore.ts`, `ZMKEditor/index.tsx`, `Pointing/index.tsx`, `QMKComboEditor.tsx`, `qmkStore.ts` | fault injection after tmp write and after bak rename → target is either original or complete; sparse-array edit path cannot be reached (test) |
| 0.5 "Restore backup" affordance in ZMK/QMK/Pointing toolbars | `components/ui/RestoreBackup.tsx`, toolbars | clicking restores `.bak` byte-for-byte and reloads |
| 0.6 Karabiner patch hygiene: skip unchanged, preserve_order, tmp+rename, startup restore marker for built-in keyboard | `lib.rs`, `Cargo.toml` | quit without toggle → file byte-identical; marker present at launch → `hidutil` restore runs |
| 0.7 Mouse engine: re-enable on `TapDisabled*`, `Once` spawn, drop probe tap, push config at launch | `mouse_engine.rs`, `Mouse.tsx` | test blocks callback 2 s, emits disabled event, asserts exactly one active tap resumes |
| 0.8 Parser hardening: anchored layer regex; keymap-block-scoped node search | `zmkParser.ts`, `tests/` | 200 KB hostile fixture parses < 100 ms; behaviors node sharing a layer name is untouched after save |
| 0.9 Exit guard: Rust dirty flag; native confirm on `ExitRequested`; QMK/Pointing included | `lib.rs`, `src/lib/dirty.ts`, stores | scripted: dirty → exit request → confirm shown; clean → no confirm |
| 0.10 Dead code + unused CSS removed; untrack `.claude/settings*`, `.vite/`; pin `@types/bun`; `bun install --frozen-lockfile` in CI; pin or remove remote scripts in `install.sh` | listed in audits | `tsc` clean; `git ls-files` clean; CI uses frozen lockfile |

### Phase 1 — Any ZMK config repo: registry, detection, catalogue, compatibility report

| Task | Owned files | Acceptance |
|---|---|---|
| 1.1 Registry store (`tauri-plugin-store` / localStorage) with descriptors; Settings "Add keyboard": pick repo folder → detect firmware, `build.yaml`, `config/*.keymap`, shields, `west.yml` modules → confirm → save; edit/remove; ZMK/QMK/Pointing pickers read from it | `src/lib/registry/*`, `Settings.tsx`, `ZMKEditor/index.tsx`, `Pointing/index.tsx` | scripted first-run against a fixture repo: registered and editable in a declared click count; `dist/` contains no `/Users/` string |
| 1.2 PhysicalLayout model + ZMK-native import (`zmk,physical-layout` dtsi, matrix-transform grid fallback) + `<PhysicalBoard>` renderer with rotation/encoders/hand split | `src/lib/layout/*`, `src/components/board/*` | geometry snapshot of corne_tp and crosses within 0.01u of today's; 36/42/58/80-key fixtures render all keys |
| 1.3 Layout catalogue (bundled JSON: keymap-editor contrib + QMK info.json for popular boards) with search, used when no layout is detected | `src/lib/layout/catalogue/*` | "Sofle" resolves without files |
| 1.4 Compatibility report: on open, list constructs the current parser does not own (includes of other keymap files, macros/behaviors referencing layers, conditional layers, preprocessor conditionals); unsupported → read-only with the construct named | `src/lib/compat.ts`, `ZMKEditor/index.tsx` | fixture with `#ifdef` opens read-only, banner names the line |
| 1.5 First-run screen + empty states; Karabiner ships `rules: []` with "Load example" | `App.tsx`, `Onboarding.tsx`, `karabinerStore.ts` | fresh profile shows onboarding, not an error panel |

### Phase 2 — Preservation guarantee: real devicetree parser + corpus + importers

| Task | Owned files | Acceptance |
|---|---|---|
| 2.0 Spike: tree-sitter-devicetree WASM loaded in a packaged universal build under the Phase 0 CSP; parses one fixture | `src/lib/dt/spike/*`, CSP | packaged app parses fixture; asset served with correct MIME offline |
| 2.1 Parser with byte-range edits applied in descending offset order; unknown nodes preserved; `#include`d `.dtsi` read for layers/macros with include ownership tracked; CRLF safe | `src/lib/dt/*`, `zmkParser.ts` | corpus (≥8 public keymaps incl. macros, conditional layers, duplicate node names, nested includes, CRLF, malformed): byte-identical no-op; one edit = one changed line |
| 2.2 QMK: `keymap.json` (Configurator format) editable; unknown JSON fields preserved (golden tests); `keymap.c` repos open read-only with explanation; `qmk json2c` compile fixtures | `qmkStore.ts`, `qmkParser.ts`, `tests/qmk/*` | golden tests pass; `qmk json2c` output compiles for 2 fixtures |
| 2.3 Remaining importers/exporters: KLE, QMK info.json, keymap-editor info.json; export ZMK dtsi + QMK info.json | `src/lib/layout/*` | round-trip per format within 0.01u; exported ZMK dtsi coordinates match source integers exactly |

### Phase 3 — Editor UX and consistency (was Phase 2 in v1)
Tasks 2.1–2.7 of v1 unchanged (primitives + tokens; migrations; keys as buttons + a11y + `.key-sub` + contrast; dirty registry with Cmd+S/Revert/undo; combos/layer-delete/rename/Karabiner reorder; Karabiner Install writes file; copy pass). Acceptance rewritten: popover bounding box asserted within an 800×600 viewport; scripted keyboard-only edit asserts binding and restored focus; Karabiner install asserts a schema-valid file at the exact assets path (discovery in Karabiner is manual smoke).

### Phase 4 — ZMK depth: behaviors, build status, export

| Task | Acceptance |
|---|---|
| 4.1 Behavior editors: macros, hold-tap, mod-morph, tap-dance, sticky, caps-word; user behaviors in BindingEditor | create + bind a hold-tap; diff asserted in tests |
| 4.2 Build integration WITHOUT push: repo state + diff preview; watch a user-initiated Actions run (pinned fake API in tests); artifact download; explicit "Flash" button that waits for the UF2 volume and copies (never automatic) | fake-API test passes; flash step is manual smoke |
| 4.3 Keymap SVG export (keymap-drawer-compatible) | exported coordinates equal board geometry within tolerance |

### Phase 5 — Pointing devices (tested tuples only)

| Task | Acceptance |
|---|---|
| 5.1 Descriptor detection from overlays (`zmk,input-listener`, sensor `compatible`, processors, `zmk,input-split`); generic per-layer children UI | corne_tp, crosses, choovick charybdis detected with no hand-written regex |
| 5.2 "Add pointing device" wizard bound to a tested-tuples table (e.g. nice!nano v2 × PMW3610 badjeff@zmk-0.4 × SPI × split-right × ZMK main; nice!nano v2 × Azoteq IQS5XX × I2C; Cirque SPI); writes `west.yml`, `.conf`, overlay from templates; diff preview; untested tuple → editable preview labelled "untested"; remove = inverse | pinned containerized ZMK build compiles the generated config for each tested tuple |
| 5.3 QMK pointing flags (`rules.mk`/`config.h`) | round-trip on a Charybdis QMK dir |

### Phase 6 — Distribution

| Task | Acceptance |
|---|---|
| 6.1 Developer ID signing + notarization, universal, `minimumSystemVersion`; TCC test: install signed vN in `/Applications`, grant Accessibility, update to vN+1, event tap works without reopening Settings | `spctl --assess` passes; TCC procedure documented and passed |
| 6.2 `tauri-plugin-updater` + GitHub Releases `latest.json`; Windows/Linux builds with macOS-only sections hidden | in-app update vN→vN+1 |
| 6.3 Web build (Chromium FS Access only), after 6.1/6.2 | axe: 0 violations; no personal paths in bundle |
| 6.4 Docs site, in-app "What is supported" page, CHANGELOG, license | published |

Backlog (not scheduled): visual layout builder; git push from the app; keymap.c editing.

## 3. Routing (AF)
Understanding-bottlenecked (1.1 layout model, 3.1 parser, 4.2 templates, 2.4 dirty registry design): Fable/high. Execution-loop heavy (2.2 migrations, 2.7 copy pass, 0.9 cleanup, 1.5 QMK, 5.1 builder): Sol/high via codex. Everyday build: Sonnet/medium. Mechanical (fixture collection, token replacement): Haiku.

## 4. Decisions recorded at the plan gate (2026-09-24)

| Decision | Answer |
|---|---|
| Plan v2 | Approved; Phase 0 started on branch `phase-0-safe-local-preview` |
| Platforms v1 | macOS only; Windows/Linux deferred to Phase 6 |
| License | MIT |
| Apple Developer Program | Not now — Phase 6.1 (signed public macOS build) is blocked until enrollment; all other phases proceed |
| Codex planning lane | Degraded on 2026-09-24 (tool host timeouts); critique obtained with sources inlined |

## 4b. Original open decisions
1. Product name and bundle identifier domain (`com.ultimatekeyboards.app` needs a domain you control for signing/updater).
2. Apple Developer Program ($99/yr) — required for Phase 6.1; nothing public before that.
3. Windows/Linux in scope for v1, or macOS-only first? (Karabiner + Mouse sections are macOS-only by nature.)
4. License: MIT (matches keymap-drawer/keymap-editor ecosystem) or keep private?
5. Phase 5 (visual builder) may be cut if importers + catalogue cover users; decide after Phase 1.

## 5. Notes from Tom during Phase 0 (2026-09-24)

| Note | Where it lands |
|---|---|
| Minimal icon/logo: app icon set (icns/ico/png), menu-bar template glyph, in-app logo mark | Phase 3 (identity task 3.8, alongside the design-token pass); replaces the hand-drawn tray glyph in `lib.rs` |
| Keyboards must be add / edit / rename / delete | Phase 1 task 1.1 (registry + Settings wizard); confirmed in scope |
| Mouse and Pointing should be per-keyboard, not global sections | Phase 1: a keyboard becomes the top-level object with Keymap / Combos / Pointing tabs (Pointing only when the descriptor has a pointing device). The macOS scroll engine is host-level; decide at the Phase 1 gate whether it lives under a "This Mac" section with the Karabiner tools or under each keyboard's Pointing tab as "host scroll" |

## 6. Phase 0 execution log

- macOS Cmd-Q never reaches Tauri: tao does not implement `applicationShouldTerminate`, so the process terminates with no `ExitRequested` (OBSERVED in tao 0.35.3 and tauri-runtime-wry 2.11.4 sources). The old "restore keyboard on quit" therefore never ran on Cmd-Q. Fix: the app now sets its own menu whose Quit item (Cmd+Q) and the tray Quit both go through `request_quit`, which asks about unsaved edits and then calls `exit`, where the keyboard is restored.

### Phase 0 verification (2026-09-24, packaged release build, driven via `orca computer`)

| check | result |
|---|---|
| tsc / bun test / cargo check | clean / 9 pass / clean |
| dev bridge | no creds 403 · foreign Origin 403 · bogus token 403 · real token + same origin 200 · real token + path outside ~/Documents 403 |
| keymap loads in packaged app | yes (first launch after build took ~15 s to render; second launch 8 s — watch in Phase 1) |
| edit key → Cmd-Q | native "Unsaved changes" dialog (Discard and Quit / Cancel); Cancel keeps app alive and dirty |
| Save | exactly one line changed on disk; `corne_tp.keymap.bak` created; "Restore backup" button appears |
| Restore backup | disk byte-identical to git; a second restore swaps back (restore is itself undoable) |
| Cmd-Q with nothing unsaved | app exits; `karabiner.json` checksum unchanged before/after |
| NOT verified | crash-marker keyboard restore (would disable Tom's keyboard mid-session); mouse-engine re-enable after a stall; persisted-scope grant via the file picker (exercised in Phase 1 with the folder picker); Windows/Linux (out of scope) |
| deferred to Phase 1 | audit F1/F2/F8 (registry, per-keyboard layout, seeded Karabiner rules) |

### Phase 1 verification (2026-09-24, packaged release build, driven via `orca computer` + osascript for the native folder picker)

| check | result |
|---|---|
| tsc / bun test | clean / 24 pass (parser, safety, layout importers, pointing detection, compat, catalogue) |
| personal paths | none in `src/` or the web bundle (`grep tomkwon dist/` = 0); seed only fires when the old files exist |
| registry | `~/Library/Application Support/com.ultimatekeyboards.app/registry.json` written; 3 keyboards seeded (Corne, Crosses, Corne Procyon) |
| per-keyboard IA | sidebar lists keyboards; Keymap / Combos / Pointing tabs; Pointing shows the Corne trackpad (Azoteq, 80 %) and the Crosses trackball (PMW3610); Corne Procyon shows QMK layers + 7 keymap.c combos |
| rename | Edit → type "Corne TP" → Save: sidebar and registry.json updated; renamed back |
| remove | Remove → in-app confirm → Cancel keeps it; Remove → Remove deletes only the registry entry |
| add from folder | native picker → `~/Documents/cross_keyboard` detected as ZMK · corne_tp · 42 keys, layout from `cross_corne.json`, trackpad found; duplicate name (case-insensitive) blocks Add; renamed → added → navigated to it with a Pointing tab; persisted with `layout.source = info-json` |
| onboarding | empty registry shows the first-run screen (browser build) |
| NOT verified | add from a single .keymap file (needs the native file picker); layout switching from the Edit form on a real save; QMK keyboard added from a folder; compat read-only banner in the UI (unit-tested only); persisted-scope after restart for a picker-granted folder outside ~/Documents |
| deferred | audit F2's real fix (layout ≠ keymap count) is now a banner + read-only; the Corne info.json layout Tom's repo carries is a flat grid, so the catalogue's staggered "Corne 6 Column" is offered as an alternative in the picker rather than forced |

### Phase 2 verification (2026-09-24)

| check | result |
|---|---|
| tsc / bun test | clean / 59 pass |
| corpus golden tests | corne_tp, crosses (local) + upstream corne, kyria, lily58, sofle, glove80, urob base: no-op save byte-identical on all 8; one binding edit = exactly one changed line on the 7 parseable ones |
| urob base (C-macro-defined layers) | 26 syntax errors reported → keymap opens read-only with the lines named (not silently mangled) |
| CRLF | round-trips; one-key edit keeps line count |
| combos | edit bindings/positions/layers in place; add `layers` property; drop it; add/remove nodes; untouched nodes byte-identical; file without a combos block gets one inserted before `keymap` |
| layers | add → rename → delete returns the original bytes; renaming a layer never touches a same-named behaviors node |
| KLE importer | stateful cursor, rotation, VIA `row,col` legends; export→import round-trip |
| QMK VIA JSON | one-key edit changes exactly one keycode; every non-`layers` field survives the merge |
| WASM in the packaged app (spike 2.0) | FAILED twice, then passed: (1) emscripten's own loader cannot fetch on Tauri's custom-scheme origin → we fetch the bytes and pass `wasmBinary` / `Uint8Array`; (2) CSP `connect-src` lacked `'self'` → same-origin fetch blocked. Both fixed; keymap renders through the CST parser in the release build |
| end-to-end save in the packaged app | X → `&trans` saved through the new parser: exactly one changed line on disk, `.bak` written; file reset afterwards |
| NOT verified | `#include`d `.dtsi` layer files (parser reads one file; includes are flagged, not followed); Phase 2.3 exporters exercised by unit tests only; `qmk json2c` compile fixtures (qmk CLI not installed here) |

### Phase 3 verification (2026-09-24)

| check | result |
|---|---|
| tsc / bun test | clean / 64 pass |
| `window.confirm` / JS hover hacks left in `src/` | 0 / 0 |
| MacBook key popover (audit P0 F3) | browser at 820×620: anchored under the key, fully visible; nested key dropdown opens above it with focus in its search box |
| in-app confirm | rule delete shows the banner (Delete / Cancel) inline; same primitive for combos (ZMK/QMK/Mac), layer delete, QMK reload, homerow presets |
| keys as buttons (packaged app) | 42 accessible `toggle button Key n: <binding>` entries; Tab reaches the board (23 tabs from the sidebar), ArrowRight Q→W, ArrowDown W→S (geometry-based), Enter opens the editor, Esc closes it with focus back on the key |
| layer-delete dry-run | Delete on layer 3 (Gesture) shows the references (combo "gesture" `&mo 3`, combo "delete" layer filter) instead of a confirm; "Go to key" appears only for key references |
| Install to Karabiner | wrote `~/.config/karabiner/assets/complex_modifications/ultimate-keyboards.json` (33 rules from the example profile) with a `.bak` of the pre-existing file; test file removed and the previous file restored |
| tray glyph | NOT visually verified: the white square first blamed on the icon belongs to another app (still there with ours quit), and this Mac's menu bar is full, so macOS hides our status item in the overflow (System Events reports it at x=2973, off the visible strip). The glyph is now rendered by `scripts/render-tray-icon.py` as raw RGBA (72×72, transparent background, 1364 opaque px) and fed through `Image::new`, the same path the previous hand-drawn glyph used |
| homerow threshold | now emitted as `basic.to_if_held_down_threshold_milliseconds` = 150 and the UI copy reads from the same constant |
| NOT verified | undo/redo in the packaged app (unit-tested); screen-reader announcement of the toasts and dialogs; the Switch on the Pointing tab in the packaged app; 800×600 legibility (audit P2) |
| side effect to note | "Load example profile" was clicked during QA, so the MacBook Keys section now holds the 33-rule example set (which equals the pre-Phase-1 default rules) |

### Phase 4 verification (2026-09-24, packaged build)

| check | result |
|---|---|
| tsc / bun test | clean / 72 pass (behaviors parse + byte-exact edits, SVG export) |
| Behaviors tab | Corne lists its 6 mod-morphs with summaries; expanding `&and_bspc` shows bindings + mod pills; toggling LSFT updates the summary to `<(MOD_RCTL\|MOD_LSFT)>`, marks Unsaved, leaves disk untouched; Cmd+Z reverts it |
| Build tab | repo branch + 2 uncommitted changes (both outside config/), 5 GitHub Actions runs with status via the user's `gh` login, Download on the latest run refreshed the 3 uf2 files in `cross_keyboard/firmware/` (timestamps 20:54) |
| Flash | NOT exercised (needs a half in bootloader); the Rust step is the same wait-for-volume + copy flow used manually on 2026-09-23/24 |
| SVG export | FAILED first: the save-dialog grant covers only the chosen file, so the atomic writer's sibling `.tmp` was refused ("forbidden path … svg.svg.tmp"). Fixed: new files are written directly; existing files fall back to an in-place write when sibling writes are refused. Second attempt surfaced another defect: a bare default file name opened the save panel at the process cwd (`/`), so the write hit a read-only path; fixed by defaulting to Downloads. Third attempt: `~/Downloads/corne-keymap.svg`, 458 rects, 157 KB, well-formed |
| Custom binding type | listed from the keymap's own behaviors with `#binding-cells` params (unit-tested parse; UI not exercised) |
| add hold-tap / macro from the UI | NOT exercised in the GUI (add/remove round-trips are unit-tested) |

