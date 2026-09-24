# Ultimate Keyboards — flagship product plan (draft v1, 2026-09-24)

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

## 2. Phases

Each phase ends with: `npx tsc -b` clean, `bun test` green (fixtures: corne_tp, crosses, plus public sofle/glove80/lily58 keymaps and a KLE/info.json set), a manual smoke in the packaged app, and a plan-gate check-in with Tom before the next phase starts.

### Phase 0 — Safe to run on someone else's machine (security + data safety)
Closes: security #1–#11, #13–#15; flow F5, F7, dead code.

| Task | Owned files | Acceptance (deterministic) |
|---|---|---|
| 0.1 Remove `run_shell_command`, `tauri-plugin-shell`; set CSP | `src-tauri/src/lib.rs`, `Cargo.toml`, `package.json`, `capabilities/default.json`, `tauri.conf.json` | grep finds no `run_shell_command`/`plugin-shell`; `csp` non-null; app boots and saves |
| 0.2 fs scope: no static `$HOME/**`; add `tauri-plugin-persisted-scope` + dialog-granted paths; app-data dir for registry | `capabilities/default.json`, `Cargo.toml`, `src-tauri/src/lib.rs` | reading an unregistered path fails; registered path read/write works after restart |
| 0.3 Dev write bridge: Origin + Content-Type + per-run token; realpath allowlist of registered files; narrow `server.fs.allow` | `vite.config.ts`, `src/lib/tauri-web-shims/plugin-fs.ts` | curl POST without token/origin → 403; app dev save works |
| 0.4 `io.ts` atomic write + `.bak` + 1 MB cap; all writers use it; remove `'{}'` fallback in qmkStore | `src/lib/io.ts`, `ZMKEditor/index.tsx`, `Pointing/index.tsx`, `QMKComboEditor.tsx`, `stores/qmkStore.ts` | kill -9 during save leaves original or complete file; `.bak` exists |
| 0.5 Karabiner patch: skip unchanged, preserve_order, tmp+rename, startup restore marker for built-in keyboard | `src-tauri/src/lib.rs`, `Cargo.toml` | quit with no toggle → `karabiner.json` byte-identical; crash after disable → next launch restores |
| 0.6 Mouse engine: re-enable on `TapDisabled*`, `Once` spawn, drop probe tap, push config on launch | `src-tauri/src/mouse_engine.rs`, `Mouse.tsx` | engine survives a 2 s stall; relaunch restores reverse-scroll without visiting Mouse |
| 0.7 Parser hardening: anchored layer regex, keymap-block-scoped node search; fixture tests | `src/lib/zmkParser.ts`, `tests/` | 200 KB hostile file parses < 100 ms; behaviors node with a layer's name untouched on save |
| 0.8 Exit guard: Rust dirty flag via invoke; native confirm on `ExitRequested`; QMK/Pointing in dirty check | `lib.rs`, `src/lib/dirty.ts`, stores | Cmd-Q with dirty edits prompts; clean quit doesn't |
| 0.9 Delete dead code + unused CSS; untrack `.claude/settings*`, `.vite/`; pin `@types/bun` | listed in audit | `tsc` clean; `git ls-files` shows none |

### Phase 1 — Any keyboard: registry, layouts, onboarding
Closes: flow F1, F2, F8, F35, all 27 hardcoded rows; security #12.

| Task | Owned files | Acceptance |
|---|---|---|
| 1.1 PhysicalLayout model + importers (KLE, QMK info.json, ZMK physical-layout dtsi, keymap-editor info.json, matrix-transform grid fallback) + ZMK/QMK exporters; fixtures | `src/lib/layout/*`, `tests/layout/*` | round-trip tests per format; corne_tp & crosses render from imported dtsi identically to today |
| 1.2 `<PhysicalBoard>` renderer with rotation, encoders, hand split, count-mismatch guard; replaces geometry in SplitKeyboard/QMKKeyboard/MacbookKeyboard | `src/components/board/*`, callers | opening a 36/42/58/80-key keymap shows every key; layout≠keymap count shows banner, edits blocked |
| 1.3 Registry store + Settings "Add keyboard" wizard: pick repo folder → detect firmware, `build.yaml`, `config/*.keymap`, shields, `west.yml` modules, physical layout → confirm → save. Edit/remove rows. ZMK/QMK/Pointing pickers read from it | `src/lib/registry/*`, `Settings.tsx`, `ZMKEditor/index.tsx`, `Pointing/index.tsx` | clean machine → editable board in ≤3 clicks; no `/Users/tomkwon` in `dist/` |
| 1.4 First-run screen + empty states; Karabiner ships `rules: []` with "Load example" | `App.tsx`, `components/Onboarding.tsx`, `karabinerStore.ts` | fresh profile shows onboarding, not an error panel |
| 1.5 QMK: registry-driven `keymap.json` load/save (Configurator format), layout from `info.json`; VIA JSON kept as import | `stores/qmkStore.ts`, `lib/qmkParser.ts` | corne_procyon opens from registry; layer names from file |

### Phase 2 — Editor UX and consistency
Closes: flow F3, F4, F6, F9–F34; all 23 drift rows.

| Task | Owned files | Acceptance |
|---|---|---|
| 2.1 UI primitives (Popover, ConfirmBanner, Toast, Switch, FieldLabel, ErrorPanel, Section, IconButton, BoardLegend) + tokens (`--z-*`, `--r-pill`, `--text-10/12/14`) | `src/components/ui/*`, `globals.css` | zero `window.confirm`/`alert`; zero `position: fixed` outside Popover; zero emoji icons |
| 2.2 Migrate BindingEditor, MacKeyEditor, ParamPicker, KeyDropdown, all combo forms, HomerowMod, Pointing toggles to primitives | listed files | MacBook key popover fully visible at 800×600; all toggles Tab+Space |
| 2.3 Keys as `<button>`: roving tabindex, arrow nav, Enter opens editor, Esc returns focus; `.key-sub` behavior labels; shared legend; `--text-muted` ≥ 4.5:1 | board components, `globals.css` | keyboard-only edit of a key succeeds; every non-kp key has a text cue |
| 2.4 Dirty registry: Cmd+S, Revert, Cmd+Z/Shift+Cmd+Z (snapshot history), section-switch guard, Pointing store | `src/lib/dirty.ts`, stores, `App.tsx`, `Pointing/*` | slider edit survives section switch; Cmd+Z undoes a key edit |
| 2.5 Combos: unique names, layer pills, edit-while-add guard; layer delete dry-run with "Go to key"; rename inline error; Karabiner rule reorder/edit-in-place; homerow threshold emitted | `ComboEditor.tsx`, `ZMKEditor/index.tsx`, `RuleList.tsx`, `MacComboEditor.tsx`, `karabinerGenerator.ts` | duplicate combo name rejected; referenced-layer delete never shows a confirm |
| 2.6 Karabiner "Install" writes to `~/.config/karabiner/assets/complex_modifications/` on desktop; success only after write | `KarabinerEditor/index.tsx` | rule appears in Karabiner's Add-rule list |
| 2.7 Copy pass: section names, casing, de-personalized strings, README rewrite | many | grep for `tomkwon`, `corne_procyon` in `src/` returns nothing |

### Phase 3 — ZMK depth: real parser, behaviors, build + flash
Flagship capabilities #2, #3, #5, #9.

| Task | Owned files | Acceptance |
|---|---|---|
| 3.1 tree-sitter-devicetree (WASM) parser with byte-range edits; unknown nodes preserved; `#include`d `.dtsi` layers/macros read; keep minimal-diff invariant | `src/lib/dt/*`, `zmkParser.ts` | byte-identical no-op save on 6 public keymaps; edit of one binding = one changed line |
| 3.2 Behavior editors: macros, hold-tap, mod-morph, tap-dance, sticky, caps-word params; user behaviors appear in BindingEditor | `components/ZMKEditor/Behaviors/*` | create a hold-tap and bind it; file diff reviewed in tests |
| 3.3 Build & flash: git commit/push from app (with diff preview), GitHub Actions run status, artifact download, UF2 volume watcher + copy (the flow used manually on 2026-09-23) | `src-tauri/src/build.rs`, `components/Build/*` | click "Build" → run status → "Flash left/right" copies uf2 when NICENANO mounts |
| 3.4 Keymap render/export (SVG via keymap-drawer-compatible YAML) and print view | `src/lib/export/*` | SVG matches board |

### Phase 4 — Pointing devices, generalized
Flagship capability #10 (the gap).

| Task | Owned files | Acceptance |
|---|---|---|
| 4.1 Pointing descriptor detection from overlays: `zmk,input-listener` nodes, sensor `compatible`, processors, split `zmk,input-split`; per-layer children UI generic (move/scroll/snipe/temp-layer) | `src/lib/pointing/*`, `Pointing/*` | corne_tp and crosses detected with no hand-written regex; choovick charybdis config detected |
| 4.2 "Add pointing device" wizard for PMW3610 (SPI), Azoteq IQS5XX (I2C), Cirque Pinnacle (SPI/I2C): writes `west.yml` module, `.conf` flags, overlay pinctrl/bus/sensor/listener from templates; pin form with board pin picker; diff preview; remove = inverse | `src/lib/pointing/templates/*`, `components/Pointing/Wizard/*` | generated config for nice!nano + PMW3610 builds green in CI on a test repo |
| 4.3 QMK pointing: `rules.mk`/`config.h` flags (driver, rotation, invert, auto-mouse layer) | `src/lib/qmkConfig.ts` | round-trip on a Charybdis QMK keymap dir |

### Phase 5 — Custom layout builder
| Task | Acceptance |
|---|---|
| 5.1 Visual layout editor: add/move/resize/rotate keys, split halves, encoders, matrix assignment, snap grid; import any Phase 1 format; export ZMK physical-layout dtsi + matrix transform and QMK info.json | drawn 36-key layout exports a dtsi that builds and matches ZMK Studio's rendering |
| 5.2 Community layout catalogue (bundled JSON from keymap-editor contrib + QMK info.json for popular boards) with search | pick "Sofle" → layout loads without files |

### Phase 6 — Distribution
| Task | Acceptance |
|---|---|
| 6.1 Developer ID signing + notarization, universal build, `minimumSystemVersion`, stable TCC identity | `spctl --assess` passes on a clean Mac; Accessibility grant survives rebuild |
| 6.2 `tauri-plugin-updater` + GitHub Releases `latest.json` via tauri-action; Windows/Linux builds (Karabiner/Mouse sections hidden off-macOS) | update from vN to vN+1 in-app |
| 6.3 Web build: Chromium FS Access path only, no personal paths, "desktop recommended" banner; Vercel | Lighthouse a11y ≥ 95; no `tomkwon` in bundle |
| 6.4 Docs site, in-app "What is supported" page (ZMK shapes, QMK limits), CHANGELOG, license (MIT) | published |

## 3. Routing (AF)
Understanding-bottlenecked (1.1 layout model, 3.1 parser, 4.2 templates, 2.4 dirty registry design): Fable/high. Execution-loop heavy (2.2 migrations, 2.7 copy pass, 0.9 cleanup, 1.5 QMK, 5.1 builder): Sol/high via codex. Everyday build: Sonnet/medium. Mechanical (fixture collection, token replacement): Haiku.

## 4. Open decisions for Tom
1. Product name and bundle identifier domain (`com.ultimatekeyboards.app` needs a domain you control for signing/updater).
2. Apple Developer Program ($99/yr) — required for Phase 6.1; nothing public before that.
3. Windows/Linux in scope for v1, or macOS-only first? (Karabiner + Mouse sections are macOS-only by nature.)
4. License: MIT (matches keymap-drawer/keymap-editor ecosystem) or keep private?
5. Phase 5 (visual builder) may be cut if importers + catalogue cover users; decide after Phase 1.
