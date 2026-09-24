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

## 4. Open decisions for Tom
1. Product name and bundle identifier domain (`com.ultimatekeyboards.app` needs a domain you control for signing/updater).
2. Apple Developer Program ($99/yr) — required for Phase 6.1; nothing public before that.
3. Windows/Linux in scope for v1, or macOS-only first? (Karabiner + Mouse sections are macOS-only by nature.)
4. License: MIT (matches keymap-drawer/keymap-editor ecosystem) or keep private?
5. Phase 5 (visual builder) may be cut if importers + catalogue cover users; decide after Phase 1.
