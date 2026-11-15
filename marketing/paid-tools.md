# Paid Mac keyboard / remap / shortcut tools: what people pay for

Access date for every URL: 2026-11-15. "unknown" = not on a page I could fetch. Many deep docs pages 404'd or returned only a TOC; gaps are marked. Reddit not used.
Method note: WebFetch summarises pages with a small model, so exact figures are as reported by it; re-check prices before quoting externally.

## 1. BetterTouchTool (BTT)
- Price: Standard $15 (2 years of updates, keep last version after); Lifetime $25 (all updates while BTT exists); also on Setapp (price unknown). One license covers all personal Macs. Source https://folivora.ai/buy
- Trial: 45 days, no account. https://folivora.ai/
- Free tier: none (trial only).
- Signature features (https://folivora.ai/): trackpad/Magic Mouse gestures; keyboard shortcuts and key sequences with a configurable Hyper Key; Spotlight-style launcher with clipboard history; scripting/remote control (btt:// URL, web server, CLI); Stream Deck/macro-pad/gamepad support; custom AI agents.
- Hyper key: Caps Lock as Hyper via the "Act as Hyper Key" action (since 3.540), Shift optional; caveats: Caps Lock must be set to Caps Lock in System Settings; unused-release action only fires on a release under 0.65 s, longer holds use "After Long Hold"; docs warn the Hyper Key is designed to work with shortcuts defined inside BTT. https://docs.folivora.ai/docs/1004_hyper_key.html
- Per-app: Conditional Activation Groups (one rule covering many apps), per-app triggers. https://docs.folivora.ai/docs/configuration/global-vs-app-specific/ . Forum reports CAGs updating unreliably or matching too much (https://community.folivora.ai/t/conditional-activation-group-does-not-update-reliably/13941), a real "it stopped working" source.
- Permissions UX, status/recovery, sync, cheat sheets, tap-hold timing: unknown (docs pages I tried 404'd; the home page does not describe them). Forum-suggested recovery for CAG trouble is deleting the Application Support folder (reset).

## 2. Keyboard Maestro (KM)
- Price: $36 one-time for v11, no subscription; upgrades from older versions $25; purchases since 2023-03-01 get v11 free. Free trial exists. https://www.keyboardmaestro.com/main/
- Signature: hundreds of actions with flow control, text snippets, New Macro Wizard, app launching with window arrangement (same page). Triggers, per-app macro groups, palettes: not confirmed from fetched pages (unknown).
- Permissions: Accessibility needed for both the Editor and the separate "Keyboard Maestro Engine"; Input Monitoring can override; Screen Recording for image/OCR actions. https://wiki.keyboardmaestro.com/assistance/Accessibility_Permission_Problem (via search). Has a Security pane in Preferences listing each required permission and whether it is on. https://wiki.keyboardmaestro.com/manual/Troubleshooting
- Recovery ladder (official): restart Mac, `tccutil` reset, relaunch Engine, move app to /Applications; reinstall keeps macros; Help > Interactive Help wizard. Same URL. Official wiki admits macOS shows checkboxes that are ticked but not effective. Forum shows recurring Sequoia screen-recording failures with the Engine (https://forum.keyboardmaestro.com/t/is-sequoia-okay/37627). Engine log at ~/Library/Logs/Keyboard Maestro/Engine.log.
- Sync/presets/overlay/typing feel: unknown from fetched pages. Out of scope for us: it is general automation.

## 3. Superkey (superkey.app) and Hyperkey (hyperkey.app), same developer (Ryan Hanson per https://desktopinsights.com/apps/superkey)
- Hyperkey: free. Caps Lock or any single modifier becomes Hyper (⌃⌥⌘⇧); can instead remap Caps Lock; macOS 10.15+. https://hyperkey.app/
- Superkey: "Free for 20 days" then paid; exact price unknown (page truncated; pricing URL 404). One license on 3 devices at once; macOS 14+. https://superkey.app/
- What Superkey adds: "Seek", type text and it clicks it anywhere on screen via OCR or Accessibility API; includes all of Hyperkey; "power user presets" as checkboxes (e.g. left Shift + right Shift = Caps Lock). Tap/hold and layers are not mentioned.
- Permissions: Accessibility (keystrokes and clicks), Screen Recording only for Seek (a good least-privilege pattern: ask only when the feature is used). Troubleshooting for "Unable to initialize Superkey": remove from Accessibility and Input Monitoring, restart, relaunch, re-grant. https://superkey.app/
- Limit stated openly: remaps don't work in secure password fields (https://hyperkey.app/). Per-app: not described.

## 4. Raycast
- Price: Free $0; Pro $10/mo or $96/yr; Plus $20/mo or $192/yr; Max $50/mo or $480/yr; Teams Pro $15/user/mo. https://www.raycast.com/pricing
- Free lacks: AI, Cloud Sync, unlimited clipboard history (free = 3 months), Dictation, custom themes, translator, custom window-management commands. Same page.
- Hotkeys: per-command hotkeys; Hyper Key in Settings > Keyboard > Hyper Key: left/right modifier, Caps Lock or F1-F12; Caps Lock "Quick Press" chooses nothing / Caps Lock / Escape on a tap; Shift optional; restores Caps Lock on all connected keyboards when turned off; Secure Input Compatibility option (reserves Right Control). https://manual.raycast.com/hyper-key . Whether Hyper is Pro-only: unknown (manual silent; pricing page silent).
- Why people pay: AI and Cloud Sync, not remapping. Remap-wise it shows that a tap-action on Caps Lock (Escape) is a standard expectation.

## 5. Alfred Powerpack
- Price (GBP): Single £34; Mega Supporter £59 with free lifetime upgrades; buying now includes upgrade to Alfred 6. https://www.alfredapp.com/powerpack/
- Free lacks: Powerpack gates workflows, clipboard history, snippets, themes, etc. (page lists them as Powerpack features).
- Signature: Workflows launched by hotkey/keyword; clipboard history; snippets with auto-expansion; file navigation; themes. Same page.
- Sync: point preferences to a folder in Dropbox/iCloud etc.; main hotkey, theme and clipboard history stay per-Mac; recommends a local backup for sync conflicts. https://www.alfredapp.com/help/advanced/sync/
- Cheat sheet: built-in cheatsheet page of default hotkeys. https://www.alfredapp.com/help/
- Permissions/hyper key/remap: unknown / not covered.

## 6. Homerow (homerow.app): keyboard clicking of any UI element, not a remapper
- Price: official page shows "$4999" one-time, "use on all your Macs forever", student discount, free to try with a reminder every 50 activations; macOS 13+. https://www.homerow.app/ , https://www.homerow.app/pricing . The missing decimal likely means $49.99, but this is a guess. A 2024 forum thread said $29/year per device with one year of updates (https://talk.macpowerusers.com/t/homerow-navigate-macos-like-a-pro/32308), so pricing has changed or sources conflict; treat as unknown.
- Features: Shift+Space click labels, Shift+J scroll, Shift+/ search. Customisation and multi-monitor are FAQ items; answers not retrieved.
- Nag-based trial (activation counter) instead of a time limit or feature lock is a notable model.
- Permissions/recovery: unknown.

## 7. Shortcat
- Free download (also `brew install shortcat`); v0.12.2 (2025-07-03); macOS 13+; no price on page; so a paid tier is unknown. https://shortcat.app/
- Features: keyboard clicking incl. right/double/modifier clicks, window switching by title, menu search, emoji mode, fuzzy search with synonyms. Same page. Same job as Homerow/Superkey Seek, not remapping.

## 8. Rectangle Pro (only because keyboard-centric)
- Free Rectangle is MIT open source. Pro: 10-day trial, iCloud config sync, 3 devices per license; price not shown on page. https://rectangleapp.com/pro . Aggregators say ~$9.99 (https://rectangle-pro.macupdate.com), unconfirmed.
- Features: window "throw" to 16 positions, custom snap areas, workspace arrangement on display connect/disconnect, stash to edge, pin app, menu customisation.

## 9. Other / adjacent
- KeyPath (https://malpern.github.io/KeyPath/): free, MIT, pre-release, built on Kanata; the closest direct competitor to Ultimate Keyboards. Offers 10 prebuilt packs, home row mods, tap-hold with 4 hold behaviours (Basic, Trigger Early, Quick Tap, Custom Keys), per-key timing sliders, "smart misfire prevention" so fast typing like "as" is not read as a shortcut, same-hand combinations stay plain letters, leader keys, tap-dance, layers that switch with the frontmost app, Karabiner config import, hot-reload of external edits, 16 rule collections but no community marketplace. Needs Accessibility and no driver per its own docs; installer detects a running Karabiner and warns; cannot run alongside Karabiner (https://malpern.github.io/KeyPath/migration/karabiner-users/). Pricing: free today, so it sets a price anchor for us. Health check, overlay and sleep recovery: unknown.
- Karabiner-Elements: free; its docs TOC shows pages on "Driver alert keeps showing up", "stopped working after macOS update", EventViewer, "Required macOS settings" (https://karabiner-elements.pqrs.org/docs/help/troubleshooting/). Content not retrieved. Confirms those are the pain points. Community-rule import and EventViewer are its discoverability tools.
- Mouseless (keyboard mouse control): ~$15-20, sources conflict, unconfirmed. https://mouseless.macupdate.com , https://desktopinsights.com/apps/mouseless
- Not found: any paid home-row-mod-specific Mac app other than free KeyPath. Vimac, Wooshy, Keysmith, Typinator/TextExpander not researched (low relevance; out of budget).

## Cross-tool patterns
1. Pricing models: one-time with time-limited updates (BTT $15/2y, $25 lifetime; KM $36 + $25 upgrades; Alfred £34 / £59; Homerow one-time), subscription only where there is a cloud/AI cost (Raycast). Hyper-key-only tools are free (Hyperkey, Raycast Hyper, BTT, KeyPath); nobody sells plain Caps-to-Hyper.
2. Trial styles: 10, 20 and 45 days; Homerow counts activations.
3. Permissions: everyone needs Accessibility; Input Monitoring also appears for Superkey and KM. KeyPath markets "one permission, no driver". Least-privilege per feature (Superkey Screen Recording only for Seek) is the nicest pattern. KM's Security pane is the best status surface found; its recovery ladder (restart, tccutil, relaunch engine, move to /Applications) exists because macOS shows ticked-but-ineffective permissions.
4. Conflicts: KeyPath warns when Karabiner is running; Secure Input (password fields) blocks remaps everywhere and Raycast has an opt-in workaround; BTT CAG rules can fail to switch with the front app.
5. Sync: Alfred via user's own cloud folder, Rectangle Pro via iCloud, Raycast paid Cloud Sync, BTT unknown. Per-machine exceptions (Alfred keeps main hotkey per-Mac) matter.
6. Typing feel: only KeyPath documents per-key timing and misfire protection; BTT only documents a 0.65 s hyper release threshold. This is the gap a QMK/ZMK-literate product can own.

## Ideas for Ultimate Keyboards (ranked)

| # | Feature | Demand proof | Tier | Difficulty |
|---|---|---|---|---|
| 1 | Permission and health panel: one screen listing Accessibility/Input Monitoring/driver state with one-tap fix, plus auto re-check after sleep, wake and macOS update, and a clear "remapper is off because X" menu-bar state. Also detect a running Karabiner/KeyPath at first run. | KM Security pane and recovery ladder; Superkey "Unable to initialize" steps; Karabiner driver and post-update pages; KeyPath conflict detection | Free (must-have; trust) | M |
| 2 | Tap-hold tuning that beats the competition: per-key timing, same-hand/opposite-hand rule, fast-typing protection, quick-tap, and a live "typing test" that shows misfires. Presets (balanced, fast typist, hold-first). | KeyPath marketing; home-row-mod community; no paid tool documents it | Basic free; per-key and opposite-hand tuning plus misfire analytics paid | L |
| 3 | Caps Lock as Hyper/Esc/tap-action and a "Quick Press" choice, as the free onboarding hook | Hyperkey, Raycast, BTT, Superkey all offer it free | Free | S |
| 4 | Live layer/key overlay (current layer, pending hold, key-press visualiser) | KeyPath hero image of layers (details unknown); Alfred cheatsheet; Karabiner EventViewer | Overlay free; "teach me" recording/stats paid | M |
| 5 | Per-app layers/rules (frontmost app switches layer or disables remap, e.g. games, terminals) | BTT CAGs, KeyPath app-switched layers | Paid (but 1 exclusion list free) | M (BTT shows reliability pitfalls: test app detection) |
| 6 | Preset library and sharing (import/export file, Karabiner-rule import, ZMK/QMK keymap import) | KeyPath imports Karabiner; Karabiner community rules; Alfred/Rectangle sync | Import free; cloud/iCloud sync of profiles paid | M (import) / M (sync) |
| 7 | Sync profiles via user's own folder or iCloud, with per-Mac exceptions | Alfred sync folder pattern; Rectangle Pro iCloud; Raycast Cloud Sync | Paid | M |
| 8 | Keyboard-to-firmware bridge: same layout edited once, applied to MacBook driver and exported to ZMK/QMK build via GitHub Actions | No tool in this survey does this (Ultimate Keyboards' differentiator; unknown whether others elsewhere do) | Paid (headline) | L (already core scope) |
| 9 | Secure-input awareness: show "paused in password field" instead of silent failure | Hyperkey page, Raycast Secure Input Compatibility | Free | S |
| 10 | Pricing: one-time with 1-2 years of updates plus lifetime option, 14-30 day full trial or activation-count nag; avoid subscription unless cloud-hosted builds | BTT, KM, Alfred, Homerow; Raycast only subscribes for AI/cloud | n/a | S |
| 11 | Least-privilege requests: ask for each permission only when the feature needing it is turned on | Superkey Screen Recording | Free | S |
| 12 | Keyboard clicking, snippets, window management, mouse keys | Homerow, Shortcat, Superkey Seek, Alfred, Rectangle Pro, Mouseless | Out of scope: different products; at most integrate (e.g. send a Hyper combo to them) | - |
| 13 | General automation, workflows, scripting, gestures, Stream Deck, AI | KM, BTT, Alfred, Raycast | Out of scope for a keyboard-layout product; expose a URL scheme/CLI at most | L, not recommended |

Honest caveats: price points above rely on official pages except where marked; Homerow, Superkey, Rectangle Pro prices unconfirmed; none of the tools' sleep/wake recovery behaviour was documented in sources I could read, so "auto-recovery after sleep" demand is inferred from complaint-driven recovery guides (KM, Superkey, Karabiner TOC), not proven.
