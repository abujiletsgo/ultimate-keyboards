# Ultimate Keyboards — frontend + Tauri security audit (2026-09-24, HEAD e3deb1c)

Read-only; no files edited. Evidence labels: OBSERVED = read in source or measured; INFERRED = derived from documented behavior where the crate source was not on disk.

Counts: Critical 1, High 3, Medium 7, Low 4 (15 findings).

## Findings

| # | Sev | Area | Issue (file:line) | Impact | Fix |
|---|---|---|---|---|---|
| 1 | Critical | Tauri IPC | `run_shell_command` runs any program with any args (`src-tauri/src/lib.rs:26-47`, registered `:265`). No app ACL manifest exists (`src-tauri/gen/schemas/acl-manifests.json` has no app key), so Tauri allows every app-defined command from the local origin with no capability check (OBSERVED in tauri 2.11.5 `src/webview/mod.rs:1823`; Cargo.lock pins 2.10.3, same policy INFERRED). Nothing in `src/` calls it. | Any JS in the webview has arbitrary code execution; with #2, any XSS becomes RCE. | Delete the command. If a shell call is ever needed, hardcode the binary as `run_hidutil` does. |
| 2 | High | CSP | `"csp": null` (`src-tauri/tauri.conf.json:28`). | No CSP injected; inline/remote scripts and remote fetches unrestricted. | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ipc: http://ipc.localhost`. |
| 3 | High | Dev fs bridge | `/__fs/write` middleware (`vite.config.ts:16-40`) checks no Origin, Host, Content-Type or token. Any website in the browser can send a simple cross-origin POST to `localhost:5173`; Vite's CORS default only blocks reading the response. Accepts any existing `$HOME` file ending `.json/.conf/.keymap/.overlay/.dtsi`, follows symlinks; `startsWith(homedir())` also matches `/Users/tomkwon2`. | While `bun run dev` runs, a malicious page can overwrite `~/.claude/settings.json` (hooks -> command exec), `~/.config/karabiner/karabiner.json` (live remaps), any `package.json`, `~/.gnupg/gpg.conf`. Chrome's Local Network Access prompt mitigates in recent Chrome only (INFERRED); Safari/Firefox do not. | Require Origin = dev server origin and `Content-Type: application/json`; per-run random token via `define`; allowlist of realpath-resolved registered files; `realpath` before the prefix check. |
| 4 | High | fs scope | `fs:allow-read-text-file / write-text-file / mkdir / exists` on `$HOME/**` (`src-tauri/capabilities/default.json:12-27`). App needs only 4 known paths under `~/Documents`; Karabiner is patched from Rust. | Webview can read/write anything in the home dir, including dotfiles unless the plugin's leading-dot rule blocks them (INFERRED; verify). | Scope to `$DOCUMENT/cross_keyboard/**`, `$DOCUMENT/cross_keyboard-crosses/**`, `$DOCUMENT/splitkey2/**`; drop `mkdir` (never called on desktop). |
| 5 | Medium | shell plugin | `shell:default` + `shell:allow-execute` granted (`default.json:9-10`) but `@tauri-apps/plugin-shell` is never imported in `src/`. `allow-execute` with no scope entries rejects every program (INFERRED); `shell:default` = `allow-open` with the http/tel/mailto validator (OBSERVED in acl-manifests). | Dead attack surface; a future `Command.create` or `open(url)` from JS works unreviewed. | Remove `tauri-plugin-shell` from Cargo.toml, package.json and the capability. |
| 6 | Medium | Rust / data integrity | `patch_karabiner_disable_builtin` (`lib.rs:102-142`) rewrites `karabiner.json` on every toggle and every quit (`lib.rs:316,348`); `changed=true` even when the value is unchanged; `serde_json` lacks `preserve_order` (Cargo.lock: no indexmap) so keys re-sort; `std::fs::write` truncates in place, no backup, no temp+rename. | Every quit rewrites the user's Karabiner config; a crash mid-write leaves an empty/partial file and Karabiner drops all rules. | Skip write when unchanged; enable `serde_json/preserve_order`; write `.tmp` then `rename`; keep one `.bak`. |
| 7 | Medium | Rust / safety | Built-in keyboard state is memory-only (`lib.rs:324`). Restore runs on `ExitRequested` and tray quit only; `panic = "abort"` (`Cargo.toml:30`), SIGKILL or a crash skips it. | User left with a dead built-in keyboard until reboot; next launch starts `false` and never restores. | Persist a marker file when disabling; on startup, if present run `run_hidutil(false)` and delete it. |
| 8 | Medium | Mouse engine | Callback receives `TapDisabledByTimeout`/`ByUserInput` regardless of mask but never re-enables (`mouse_engine.rs:150-153`); `STARTED` is a `OnceLock` set after spawn (`:112,178`) so concurrent `set_mouse_config` calls can spawn two taps; probe tap (`:123-140`) is briefly a second active HID tap. | Engine silently dies after a slow callback and cannot restart in-process; double tap = doubled/un-reversed scroll. | Match on event type and `tap.enable()` on the disabled events; `Once`/`get_or_init` for spawn; drop the probe, report worker-thread errors via a channel. |
| 9 | Medium | Parser | `parseLayers` regex `/(\w[\w+]*)\s*\{/g` (`src/lib/zmkParser.ts:168`) is quadratic on long identifier runs. Measured with bun: 50 KB word run = 2.6 s, 200 KB = 41.5 s (OBSERVED, `scratchpad/redos.ts`). Brace walkers finish in 0 ms on unbalanced input. | Hostile or corrupted `.keymap` opened via the dialog freezes the UI. Hang, not RCE. | Anchor to line start `/^[ \t]*(\w[\w+]*)\s*\{/gm`; cap file size at load (1 MB). |
| 10 | Medium | Parser / corruption | `updateLayerBindingsInSource` searches `\b<name>\s*\{` from offset 0 (`zmkParser.ts:300-301`), not inside `keymap {}`, unlike `findLayerNode` (`:423-426`). A macro/behavior/combo node sharing a layer's name is edited instead; its `bindings` span count mismatches so the full-rewrite fallback (`:334-337`) replaces the node body with 42 `&trans`. | Silent corruption of a behaviors/macros node on save when names collide. | Slice to the keymap block first (reuse `findLayerNode`). |
| 11 | Medium | Writes | All saves are truncate-and-write with no backup: `ZMKEditor/index.tsx:88`, `Pointing/index.tsx:247`, `QMKComboEditor.tsx:183`, `qmkStore.ts:53`. `qmkStore.save` falls back to `'{}'` if the re-read fails (`qmkStore.ts:51`) and writes only `layers`. | A transient read error wipes every other key in the VIA layout JSON. Keymaps live in git checkouts, so committed state is recoverable; unstaged edits are not. | Remove the `'{}'` fallback (abort on read error); write `.tmp` then rename via plugin-fs, or keep `.bak`. |
| 12 | Low | Web build | Vercel bundle embeds `/Users/tomkwon/Documents/...` (`dist/assets/keyboards-*.js`, `Pointing-*.js`, `ZMKEditor-*.js`; sources `src/lib/keyboards.ts:20,26`, `pointingConfig.ts:39,62`, `qmkStore.ts:5`, `QMKComboEditor.tsx:7-8`). | Leaks username and repo layout to anyone loading the site. | User-editable, localStorage-persisted registry with `~`-relative defaults resolved via `homeDir()`. |
| 13 | Low | Dev server reads | `server.fs.allow` includes `~/Documents` (`vite.config.ts:73`); `/@fs/` serves it to any `localhost`/`127.0.0.1` origin on any port (Vite default CORS regex, OBSERVED in `node_modules/vite/dist/node/chunks/logger.js`). | Any other localhost page can read `~/Documents` while dev runs. | Narrow to the three keymap repos. |
| 14 | Low | Supply chain | Caret ranges throughout; `@types/bun: latest` (`package.json:26`); `bun.lock` tracked (good). `install.sh:10,16` pipes remote scripts to `sh` unpinned. No third-party scripts, no CDN, no telemetry (grep of `src/` for `fetch|XMLHttpRequest|WebSocket|sendBeacon|https?://`: nothing outside the dev shim). | Low; zero runtime network. | Pin `@types/bun`; `bun install --frozen-lockfile` in CI. |
| 15 | Low | Repo hygiene | `.claude/settings.json`, `.claude/settings.json.bak`, `.claude/FACTS.md`, `.vite/deps/*` are tracked (`git ls-files`). Repo is private (OBSERVED via `gh repo view`). The AF damage-control hook blocked reading the two settings files, so contents are UNVERIFIED. | If the repo goes public, hook definitions or local paths leak. | Review, `git rm --cached`, add to `.gitignore`. |

## Command inventory

| Command (`lib.rs`) | Input validation | Verdict |
|---|---|---|
| `run_shell_command` :27 | none | remove (#1) |
| `is_builtin_keyboard_disabled` :219 | n/a | fine |
| `set_builtin_keyboard_disabled` :224 | bool only; hidutil path/args constant (`:74-81`), payload from fixed range (`:53-69`) | no injection |
| `set_mouse_config` :241 | speed clamped 0.1-20 (`mouse_engine.rs:51`); JSON cannot carry NaN | fine |
| `get_mouse_config` :250 | n/a | fine |

CGEventTap: active HID tap (`mouse_engine.rs:123-127`) needs the Accessibility grant. On denial `start()` returns a user-facing error and the UI flips the toggle back (`Mouse.tsx:45-52`). One `unsafe` block (`:170-172`), correct. The tap is a mach port owned by the process, so it dies with the process. It keeps running while the window is merely hidden (`lib.rs:338-341`), by design. Config is only re-pushed when the Mouse section mounts (`Mouse.tsx:37-41`), so after relaunch the engine stays off until the user opens Mouse, contradicting the comment there.

## Persisted state, XSS, privacy

| Check | Result |
|---|---|
| localStorage keys | `uk.zmk.selectedKeyboard`, `uk.karabiner` (rules + title), `uk.activeSection`, `uk.mouseConfig`; no secrets |
| XSS sinks in `src/` | 0 (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`) |
| Third-party scripts / CDN | 0; `index.html` loads only local files |
| Runtime network calls | 0; dev-only same-origin `fetch` in `tauri-web-shims/plugin-fs.ts:20,38` |
| Web FS Access API | writes only through the user-picked handle (`plugin-fs.ts:28-34`); fallback downloads; scoped |
| Devtools | debug builds only (`lib.rs:329-333`); `devtools` cargo feature off |
| Remote content / remote IPC | none; capability `local: true`, no `remote` block |
| Updater | not configured |

## Already fine

- hidutil is fixed-path, fixed-args; no user input reaches it.
- Tray quit and Cmd-Q restore the keyboard; window close only hides.
- Dev bridge is `apply: "serve"`, client path gated on `import.meta.env.DEV`; `dist/` contains no `__fs/write` (OBSERVED).
- Web shim alias gated on `TAURI_ENV_PLATFORM`, so desktop builds use real plugins.
- React rendering only; file contents never hit an HTML sink.
- Minimal-diff serializers; brace walkers terminate on malformed input.
- No telemetry, no analytics, no outbound requests.

## Distribution blockers (public macOS release)

| Item | Current (OBSERVED from `target/release/bundle/macos/Ultimate Keyboards.app`) | Needed |
|---|---|---|
| Code signing | `Signature=adhoc`, `linker-signed`, `TeamIdentifier=not set`, `Info.plist=not bound` | Developer ID cert; `bundle.macOS.signingIdentity` |
| Hardened runtime + notarization | none | `APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID` at build; Tauri notarizes the DMG |
| TCC stability | ad-hoc signature changes per build, so Accessibility grants are lost each rebuild | stable signing identity |
| Entitlements | none needed for hidutil or CGEventTap; App Sandbox must stay OFF, so no Mac App Store | document only |
| Architecture | `Mach-O thin (arm64)` | `tauri build --target universal-apple-darwin` |
| Minimum OS | `LSMinimumSystemVersion 10.13` (default) | set `bundle.macOS.minimumSystemVersion` to the oldest tested OS |
| Identifier | `com.ultimatekeyboards.app` | use a domain you control; `.app` suffix built fine |
| Auto-update | none | `tauri-plugin-updater` with signing keypair, or state there are none |
| Hardcoded paths | Tom's paths compiled in (#12) | configurable keyboard registry |
| Findings #1, #2, #4 | open | close before shipping |

## Not done / unverified

- `tauri-plugin-fs` 2.5.0 and `tauri-plugin-shell` 2.3.5 sources are not in the local cargo registry; the leading-dot rule (#4) and execute-scope rejection (#5) are INFERRED.
- `.claude/settings.json` contents not read (hook-blocked).
- No dynamic testing of the running app or the Vercel deployment; #3 is reasoned from code, not exercised.
- `zmkGenerator.ts`, `qmkParser.ts`, `qmkComboParser.ts` not audited line by line.
