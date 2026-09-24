## 1. Phase ordering and scoping

Phase 0 is not yet sufficient for a stranger’s machine.

- Move the layout/key-count guard from 1.2 into 0.4. Today a short layout can create sparse bindings and trigger a destructive rewrite (`src/stores/zmkStore.ts:180-181`; `src/lib/zmkParser.ts:326-337`). That is a present data-safety defect, not onboarding work.
- Expand 0.2/0.4 acceptance to test directory-scoped grants, sibling temporary files, atomic rename, restart persistence, symlink replacement, and backup restoration. A file-only dialog grant may permit the target but reject the sibling `.tmp` needed by atomic save.
- 0.9 does not fully close security finding #14: add `bun install --frozen-lockfile` in CI and remove or pin the remote scripts executed by `install.sh`.
- Add validation-before-write and a user-visible “Restore backup” path. Merely creating `.bak` does not make recovery usable.
- Keep signing/notarization in Phase 6, but rename Phase 0 to “safe local preview.” An unsigned, ad-hoc-signed build with unstable Accessibility identity is not ready for ordinary public installation (`docs/audit/2026-09-24-security-audit.md`, “Distribution blockers”).

Phase 1 is the right product theme but the wrong milestone boundary. Registry and layout detection solve the current dead end (`src/lib/keyboards.ts:15-28`), yet “Any keyboard” is misleading while the regex parser remains until 3.1. Make Phase 1 a vertical slice:

1. Registry, repo detection, count guard, and one layout source.
2. Move 3.1—the real parser—immediately after that.
3. Then add the remaining importers, exporters, and renderer migration.

Otherwise onboarding succeeds precisely far enough to expose unfamiliar repositories to a parser already known to hang and corrupt (`src/lib/zmkParser.ts:168,300-337`).

The Phase 4 “known modules only” boundary is correct, but “known module” is insufficient. Bound support to tested tuples of module revision, controller, bus, split topology, and ZMK version. A PMW3610 template plus arbitrary board pins is still generic hardware generation. Unsupported combinations should produce an editable preview without claiming buildability.

Phase 5.1 should not exist in the committed roadmap. Geometry drawing is low-frequency; matrix transforms encode electrical ordering that cannot safely be inferred from a picture. Retain import plus manual JSON/DTS editing. Move the searchable catalogue in 5.2 into Phase 1 because it cheaply improves onboarding. Reconsider a builder only from demonstrated import failures—not as a scheduled phase.

## 2. Technical risks the plan underestimates

| Risk | Likelihood / blast radius | Smallest de-risking step |
|---|---|---|
| Devicetree parser and includes | High / silent edits across arbitrary ZMK repos. A CST does not itself resolve preprocessing, macros, conditional nodes, or include ownership. Sequential byte-range edits can invalidate later offsets. | Build 3.1 first against a corpus containing malformed input, CRLF, macros, conditional compilation, duplicate node names, and nested includes. Require byte-identical no-op output and a one-line diff for one edit. |
| Persisted Tauri filesystem scope | High / all saves can fail after restart or atomic-save rollout. Grants, sibling temp files, renamed files, and symlinks interact differently. | Package a tiny harness that grants a repo directory, restarts, writes/renames a sibling temp file, restores a backup, and proves an adjacent directory remains inaccessible. |
| tree-sitter WASM under Vite/Tauri | Medium-high / blocks the principal ZMK editor in production only. Asset URLs, MIME loading, CSP, and offline packaging often differ from dev mode. | Before parser implementation, ship a production-bundled spike that loads the WASM under the intended CSP and parses one fixture in a packaged universal app. |
| Git/GitHub integration | High / credential exposure, unwanted commits, branch conflicts, and a very large 3.3 failure surface. It also assumes Git, remotes, authentication, Actions, artifacts, and mount discovery simultaneously. | Remove push from v1. First detect repo state, show the diff, and monitor an Actions run initiated by the user’s existing workflow. Store no GitHub token until an explicit auth design exists. |
| Signing and macOS TCC | Medium / mouse functionality appears broken after update. A stable identifier alone does not prove Accessibility permission continuity. | Install a signed/notarized vN in `/Applications`, grant Accessibility, update in place to vN+1, and verify the event tap without reopening Settings. |
| QMK JSON versus C | High / broad QMK data loss or false parity. Current behavior spans layout JSON and immediate `keymap.c` writes (`QMKComboEditor.tsx:180-191`); Configurator JSON cannot represent arbitrary C features. | Declare JSON-only editable support. Golden-test preservation of every unknown JSON field, compile fixtures with `qmk json2c`, and open `keymap.c` repositories read-only with an explicit explanation. |

## 3. Acceptance criteria

Several criteria are subjective, environment-dependent, or nondeterministic:

- 0.4 “kill -9 during save” → inject failure after temp write and after backup rename; assert exact allowed filesystem states.
- 0.6 “survives a 2 s stall” → block the callback for a fixed duration, emit the disabled event, then assert exactly one active tap resumes.
- 1.1 “render identically” and 3.4 “SVG matches board” → checked geometry snapshots with numeric tolerances and approved fixture outputs.
- 1.3 “editable board in ≤3 clicks” → scripted first-run UI test with an exact fixture repository and declared click count.
- 2.2 “fully visible” → assert the popover bounding box lies within an 800×600 viewport.
- 2.3 “keyboard-only edit succeeds” → scripted focus/keystroke sequence with asserted binding and restored focus.
- 2.6 “appears in Karabiner” → assert a schema-valid file at the exact assets path; keep Karabiner discovery as a manual smoke.
- 3.3 and 4.2 depend on GitHub, hardware, and external modules → use pinned local fake API responses plus a pinned containerized firmware build; keep hardware flashing separate.
- 5.1 “matches ZMK Studio” → another reason to cut it; otherwise compare exported coordinates and transform indices exactly.
- 6.1 “TCC survives rebuild” → specify the signed vN→vN+1 installed-update procedure above.
- 6.3 Lighthouse ≥95 → pin browser/version and use the median of three CI runs, or replace it with explicit axe violations and contrast assertions.

## 4. Three things to cut and three things to add

Cuts, worst user value per engineering week first:

1. 5.1 visual layout builder.
2. 6.3 web build until the desktop product is stable.
3. Git commit/push and automatic UF2 volume handling from 3.3; retain diff preview, build status, and artifact download.

Adds, best value per engineering week first:

1. Phase-0 count guard, validation-before-write, and visible backup restoration.
2. A compatibility report that opens unsupported repositories read-only and names the unsupported construct.
3. A pinned corpus with golden no-op, one-edit, malformed-input, and compile tests for both ZMK and QMK.

## 5. Verdict

Approve with the changes above. The product thesis is credible, especially minimal-diff ZMK editing plus pointing support, but the plan currently spends breadth before proving its core preservation guarantee. Moving the real parser forward, tightening Phase 0 around recoverable writes, constraining hardware support to tested combinations, and dropping the visual builder converts this from an ambitious feature inventory into a defensible flagship sequence.