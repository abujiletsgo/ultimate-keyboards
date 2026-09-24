# UI flow + consistency audit — ultimate-keyboards frontend

Scope: every file under `src/` (8,854 lines incl. lib) read in full, read-only. All findings OBSERVED from source unless marked INFERRED (reasoned from platform/CSS rules) or SPECULATIVE. Nothing was executed in a browser or the packaged app; contrast and scale numbers are computed from source values.

**Verdict: the app is a solid single-user tool with a well-considered token layer, but four P0s make it unusable or lossy for anyone but Tom, and one P0 popover bug affects Tom too.**

Dead code confirmed by grep (zero importers): `src/components/ZMKEditor/LayerGrid.tsx` (138 lines), `src/components/KarabinerEditor/RuleEditor.tsx` (453), `src/components/ZMKEditor/KeyPicker.tsx` (202), `src/lib/zmkGenerator.ts` (120). Unused CSS classes in `globals.css`: `.key-label`, `.key-sub`, `.highlit`, `.glass-hover`, `.btn-lg`, `.divider`, `.anim-pop`, `.anim-fade-in`, `.muted`, `.toolbar-actions`, `.tag-danger`.

## 1. Node × entry/exit map

| Node | Entry | Exits | State survives section switch? |
|---|---|---|---|
| App shell (`App.tsx`) | localStorage `uk.activeSection` → default `zmk` | Sidebar 5 buttons; `key={activeSection}` remounts the section wrapper (`App.tsx:106`) | Only zustand stores + localStorage |
| ZMK/QMK › ZMK tab (`ZMKEditor/index.tsx:15`) | auto-load `getSelectedKeyboard()` (`:61-64`) | seg Corne/Crosses (dirty → banner Discard / Save-then-switch / Cancel `:147-167`), Open…, Save (disabled unless dirty), view seg Keymap/Combos | keymap, isDirty, selectedLayer (zmkStore); ZMK/QMK tab, view, inline forms reset |
| ZMK › no keymap (`:174-186`) | load error | "Open .keymap manually" only | — |
| ZMK › Keymap view (`:199-325`) | default | layer tabs; + Layer (inline form, Enter/Esc); Rename (inline); Delete (`window.confirm`); key click → BindingEditor | — |
| BindingEditor (portal, `BindingEditor.tsx:429`) | key click | Apply, Esc (document listener), backdrop click. No Cancel button | — |
| ParamPicker (portal, `:175`) | button | Enter / click / Esc / outside mousedown | — |
| ZMK › Combos view (`ComboEditor.tsx:170`) | view seg | + Add → ComboForm; Edit → ComboForm; × → `window.confirm` → delete | Add-form contents lost on Edit |
| QMK tab (`index.tsx:340`) | header seg | Save, Reload (no confirm), layer tabs, key → BindingEditor; QMKComboEditor below writes keymap.c immediately | qmkStore persists; combos re-read on mount |
| MacBook Keys (`KarabinerEditor/index.tsx`) | nav | title input, Copy JSON, Download JSON → install panel; key → MacKeyEditor; RuleList delete; HomerowMod toggles/presets/Clear all; MacComboEditor Add/Edit/× | zustand `persist` |
| MacKeyEditor (NOT portaled, `MacKeyEditor.tsx:284`) | key click | 4 mode segs, Add / Cancel / Esc / backdrop | — |
| Pointing (`Pointing/index.tsx:197`) | nav | device seg (dirty banner), Save, sliders, toggles | **component state only** |
| Mouse (`Mouse.tsx`) | nav | 2 toggles + slider → `invoke("set_mouse_config")` | localStorage `uk.mouseConfig` |
| Settings (`Settings.tsx`) | nav | built-in keyboard toggle. Keyboard paths read-only | — |
| Error boundary (`App.tsx:32`) | render throw | Try again; auto-reset on section change | — |

Journey summary (where am I / can I return / can I lose work):

| Journey | Result |
|---|---|
| First launch, no paths | ZMK auto-load fails → error panel with Tom's absolute path → only "Open .keymap manually". Settings has no registration. Dead-end for a new user (F1). Opened file renders on Crosses geometry regardless of key count (F2). |
| Open keymap | Works via seg or Open…; `switchKeyboard` early-returns if same id (`index.tsx:48`) so after Open… on a foreign file, clicking the active seg does nothing. |
| Edit a key | Click → popover → Apply. No-op edits don't dirty (`:100`). No undo, no revert (F12). Mouse-only (F9). |
| Add / rename / delete layer | Add: fine. Rename: invalid name closes the form (F30). Delete: confirm before reference check (F11). |
| Add / edit / delete combo | Works; duplicate names + free-text layers unvalidated (F14). Delete via native confirm (F27). |
| Save | Button only, no Cmd+S (F13). Status auto-clears on success only. |
| Unsaved + section switch | ZMK/QMK/Karabiner survive. Pointing edits lost silently (F4). |
| Unsaved + app close | Window close only hides (`lib.rs:338-341`), so no loss. Cmd-Q: no JS prompt (F5). |
| Karabiner rule → export | Popover mispositioned/clipped (F3). Download claims success unconditionally (F6). |
| Pointing edit → save | Works; no retry on load error (F18); toggles not keyboard-reachable (F17). |
| Settings path registration | No affordance exists (F1). |
| Mouse | Works in Tauri; browser mode shows notice but controls stay live (F21). |

## 2. Ranked findings (P0 → P2)

| # | P | Area | Class | Defect (file:line) | Affordance + placement | Acceptance |
|---|---|---|---|---|---|---|
| 1 | P0 | Onboarding | flow | No way to register a keyboard. `Settings.tsx:21-31` renders the hardcoded `ZMK_KEYBOARDS` read-only; `lib/keyboards.ts:15-28` is a const. New user hits "Could not auto-load /Users/tomkwon/…" (`ZMKEditor/index.tsx:183`) on first launch. README's "Registered keyboard paths" is false. | Settings › Keyboards: "Add keyboard" button → dialog: name, keymap path (file picker), layout picker, optional overlay path; persisted store; row edit/remove. ZMK toolbar seg and Pointing seg read from it. | First launch on a clean machine reaches an editable board within 3 clicks without editing source. |
| 2 | P0 | ZMK board | flow | Every ZMK keymap renders with `CROSSES_LAYOUT` (42 keys) — `SplitKeyboard.tsx:3,110`. Keys ≥42 invisible/uneditable. For a <42-key keymap, clicking a phantom key does `newKeys[pos]=…` on a sparse array (`zmkStore.ts:180-181`); the serializer's span-count mismatch (`zmkParser.ts:326-337`) triggers a full rewrite that joins holes as blank lines and appends a binding → corrupt keymap. INFERRED from code path. | Layout registry keyed per keyboard (JSON physical layout or grid derived from key count); refuse edits when `layout.length !== layer.keys.length`; banner "Layout mismatch: N keys in file, M in layout" with layout picker. | Opening a 36- or 58-key keymap shows all keys; no save ever changes key count. |
| 3 | P0 | MacBook Keys popover | flow | `MacKeyEditor` is `position:fixed` but not portaled (`MacKeyEditor.tsx:286-291`) under two transformed ancestors (`App.tsx:106` `.anim-fade-up` fill-mode `both` → `transform: translateY(0)`; `KarabinerEditor/index.tsx:115`) plus `overflowX:auto` (`:120`) and root `overflow:hidden` (`:49`). A transformed ancestor is the containing block for fixed descendants, so viewport `left/top` are offset by the wrapper and the popover is clipped by the ~350px board strip. INFERRED (CSS containing-block rule; BindingEditor's own comment at `BindingEditor.tsx:461-465` documents the same bug it fixed via portal). | Port BindingEditor's `createPortal` + measured `ResizeObserver` placement (`BindingEditor.tsx:466-493`) into MacKeyEditor; drop `APPROX_H` (`:265`). | Clicking any MacBook key at 800×600 shows the whole popover; combo mode never clips. |
| 4 | P0 | Pointing | flow | Edits live in component state (`Pointing/index.tsx:201-203`); section switch remounts and discards them silently. `beforeunload` (`:212-217`) does not fire on sidebar nav. | Move values/orig/dirty into a `pointingStore`, or gate `navigate()` (`App.tsx:83`) with a shared `useDirtyGuard` that shows the existing banner pattern (`Pointing/index.tsx:292-310`). | Change a slider, visit another section, return: value and "Unsaved" tag persist. |
| 5 | P0 | Quit | flow | Cmd-Q: `beforeunload` (`App.tsx:89-97`) is not honored by WKWebView; Rust `CloseRequested` only hides (`src-tauri/src/lib.rs:338-341`); `ExitRequested` (`:346`) never consults JS dirty state. QMK dirty is not even in the JS check. INFERRED for WKWebView behavior. | On `ExitRequested`, consult a Rust-side `dirty` flag set via `invoke` whenever any store dirties; show native confirm before exit. | Cmd-Q with unsaved ZMK/QMK/Pointing edits prompts; clean quit does not. |
| 6 | P0 | Karabiner export | flow | `Download JSON` uses `a.download` on a blob URL (`KarabinerEditor/index.tsx:22-27`) then unconditionally shows "Downloaded! Run this…" (`:29,84`). Blob downloads are not handled by Tauri's WKWebView without a plugin; only `tauri-plugin-shell` is present (`Cargo.toml:23`). SPECULATIVE on WKWebView; false-success UI is OBSERVED. | In Tauri: write to `~/.config/karabiner/assets/complex_modifications/<title>.json` via plugin-fs and show "Installed — enable in Karabiner"; browser keeps download. Success only after the write resolves. | Desktop user clicks one button and the rule appears in Karabiner's Add-rule list. |
| 7 | P1 | QMK | flow | `Reload` (`ZMKEditor/index.tsx:389`) discards dirty edits with no confirm; App `beforeunload` ignores `qmkStore.isDirty`. | Reuse pendingSwitch banner: "Discard unsaved edits and reload?"; include QMK in the App-level dirty check. | Reload while dirty always asks. |
| 8 | P1 | Karabiner seeds | flow | `DEFAULT_RULES` (`stores/karabinerStore.ts:15-62`) is Tom's personal space-layer + combos and is persisted as every new user's rule set on first run. | Ship `rules: []`; add "Load example profile" button in the empty state (`RuleList.tsx:49-66`). | Fresh profile shows "No rules yet". |
| 9 | P1 | Keyboard nav | pattern | All keycaps are `<div onClick>` with no `tabIndex`/`role`/key handler (`SplitKeyboard.tsx:118-146`, `QMKKeyboard.tsx:152-181`, `MacbookKeyboard.tsx:120-143`). Core editing is mouse-only. | Render keys as `<button type="button" aria-label={binding}>` (reset button styles in `.keycap`); roving tabindex + arrow keys per board. | Tab to board, arrows to key, Enter opens BindingEditor, Esc returns focus to the key. |
| 10 | P1 | Popovers | pattern | No `role="dialog"`, `aria-modal`, focus trap, initial focus, or focus return in BindingEditor (`:503`), MacKeyEditor (`:287`), ParamPicker (`:234`), KeyDropdown (`MacKeyEditor.tsx:91`). KeyDropdown is `position:absolute` inside a popover with `overflow:hidden` (`:289`) so its 220px list is clipped. | Shared `<Popover>` primitive: portal, measured placement, dialog ARIA, focus first control, return focus on close. | Screen reader announces the dialog; Tab cycles inside; Esc restores focus; KeyDropdown list fully visible. |
| 11 | P1 | Layer delete | pattern | `window.confirm` fires before the reference check (`ZMKEditor/index.tsx:301-303`); user confirms, then reads "referenced by … rebind it first" in a status span that never auto-clears. | Dry-run `deleteLayer` first; if blocked, inline banner with "Go to key" (select layer, highlight pos). Otherwise in-app confirm banner. | Deleting a referenced layer never shows a confirm dialog. |
| 12 | P1 | Undo / revert | pattern | No undo for key edits, combos, layer ops; no "Discard changes" in ZMK toolbar (`index.tsx:107-144`). Only escape is switch-keyboard-and-discard. | "Revert" secondary button next to Save when dirty; Cmd+Z/Shift+Cmd+Z over a store history of keymap snapshots. | Revert restores on-disk keymap; Cmd+Z undoes last key edit. |
| 13 | P1 | Save shortcut | pattern | No Cmd+S in ZMK, QMK, or Pointing. | Global keydown → active section's save when dirty. | Cmd+S saves and shows status. |
| 14 | P1 | ZMK combos | pattern | Duplicate names unvalidated (`ComboEditor.tsx:57-70`); two new combos with one name emit two identical DT nodes (`zmkParser.ts:559-563`) → build error. `Layers` is free text (`:114-119`) with no range check. Edit-while-Add discards the Add form (`:313`). | Name uniqueness in `handleSave`; layers as multi-select pills from `keymap.layers`; block Edit while Add form is dirty. | Cannot save a duplicate name or a layer index ≥ layer count. |
| 15 | P1 | Rule ordering | pattern | Karabiner evaluates rules in order; RuleList has no reorder and no edit (`RuleList.tsx:35-75`); MacComboEditor edit = remove + append, silently moving it to the end (`MacComboEditor.tsx:192-200`). | `updateRule(idx)` for combo edits; ↑/↓ or drag handles on RuleItem. | Editing a combo keeps its index. |
| 16 | P1 | HomerowMod | pattern | `applyPreset` and `Clear all` wipe existing rules with no confirm (`HomerowModEditor.tsx:99-121,138`). Toggle is a `<div onClick>` (`:179-192`), not focusable, no `role="switch"`. | Confirm banner when replacing ≥1 rule; use the Settings/Mouse checkbox toggle. | Preset over existing rules asks; toggle reachable by Tab+Space. |
| 17 | P1 | Pointing toggle | pattern | `Toggle` is a `<span onClick>` inside a `<label>` with no input (`Pointing/index.tsx:142-157`): not focusable. | Replace with `ToggleField` from `Mouse.tsx:184-260` (real checkbox). | Tab+Space toggles. |
| 18 | P1 | Pointing load error | pattern | No Retry (`Pointing/index.tsx:312-315`); QMK combos have one (`QMKComboEditor.tsx:227`). | Retry button + "Open overlay…" fallback. | Fixing the file and clicking Retry loads without leaving the section. |
| 19 | P1 | QMK persistence split | pattern | Layer edits need Save (layout.json); combo edits write keymap.c on every Add/Edit/Delete (`QMKComboEditor.tsx:180-191`) with no Save button. Two files, two models, no explanation. | Caption "Writes to keymap.c immediately" above the combo list, or buffer combos into qmkStore and save both files on Save. | User can predict which file changes from the UI alone. |
| 20 | P1 | Homerow threshold copy | text | "Tap threshold: 120ms" (`HomerowModEditor.tsx:226`) and `karabinerGenerator.ts:154` comment; generator emits no `parameters`. Karabiner default `to_if_held_down_threshold_milliseconds` is 500 (INFERRED from Karabiner docs). | Emit `parameters` per manipulator, or change copy to "uses your Karabiner hold threshold (default 500 ms)". | Copy matches emitted JSON. |
| 21 | P2 | Mouse in browser | pattern | Notice says desktop-only (`Mouse.tsx:75-88`) but controls stay enabled and persist to localStorage. `busy \|\| !enabled` renders "not-allowed" + 0.6 opacity for a plain disabled state (`:108,217-218`). | `disabled={!IS_TAURI}` on all controls; separate `disabled` from `busy` props. | Browser mode greys controls; off-state Reverse toggle is not styled as busy. |
| 22 | P2 | Legibility @800px | text | ScaledBoard scale at 800px window: Crosses ≈0.75 (492/655), MacBook ≈0.61 (516/850) → key labels 12→7.3px, fn-row 9→5.5px (`ScaledBoard.tsx:27`, `macbookLayout.ts:137`, `crossesLayout.ts:92`). Computed, not measured. | `minScale` prop (≈0.85) switching to horizontal scroll below it; collapsible sidebar (`--sidebar-w` 228). | No keycap text under 8px at 800px. |
| 23 | P2 | Color-only meaning | text | Behavior encoded by color only; QMKKeyboard has no legend (`QMKKeyboard.tsx:121-185`); SplitKeyboard legend only in edit mode (`:68`). `.key-sub` exists in CSS (`globals.css:481-488`) but is unused. | Render `.key-sub` micro-label ("HOLD L1", "MT", "BT") under the main label; shared `<BoardLegend>` in all three boards. | Every non-`&kp` key carries a text cue. |
| 24 | P2 | Contrast | text | `--text-muted` rgba(226,230,255,.32) on `--bg` #0a0c16 ≈ 2.5:1 (computed); used at 9.5–11px for hints/legends/footers (`BindingEditor.tsx:291`, `SplitKeyboard.tsx:69`, `KeyPicker.tsx:171`). `--text-placeholder` .22 ≈ 1.9:1. `--text-secondary` .60 ≈ 6.1:1 passes. | Raise `--text-muted` to ≥0.50 alpha; keep .32 as `--text-faint` for decorative use only. | Muted hint text ≥4.5:1. |
| 25 | P2 | Delete affordances | text | Three shapes: ghost red "Delete" (`index.tsx:295-308`), `btn-danger` "×" (`ComboEditor.tsx:315`, `QMKComboEditor.tsx:342`, `MacComboEditor.tsx:291`), `btn-danger` Trash2 (`RuleList.tsx:158-166`); chip remove is `<span onClick>` (`ComboEditor.tsx:136-139`, `MacComboEditor.tsx:138`). | One `IconButton variant="danger" aria-label="Delete …"` with Trash2. | Every delete control is a labeled button with the same icon. |
| 26 | P2 | Feedback | text | Success via inline span (ZMK/QMK/Pointing), toast (Karabiner), label swap (Copy JSON); timeouts 2000×6 / 2500×2 / 3000 / 3500 / 4000 ms; error status never auto-clears. | One `useToast()` with `success`/`error`, fixed 2.5 s; errors persist with ×. | All sections use the toast. |
| 27 | P2 | Native dialogs | pattern | 5× `window.confirm` (`QMKComboEditor:199`, `index.tsx:301`, `MacComboEditor:203`, `ComboEditor:197`, `RuleList:161`) vs the in-app banner used for keyboard/device switch. | `<ConfirmBanner>` primitive extracted from `index.tsx:147-167`. | Zero `window.confirm`/`alert` in src. |
| 28 | P2 | Header titles | text | Sidebar "ZMK / QMK" vs header "Keymap Editor" (`index.tsx:472`); "Pointing" vs "Pointing Devices" (`Pointing:266`); sidebar group label "Keyboards" above Mouse/Settings (`Sidebar.tsx:67`). Version duplicated (`Sidebar.tsx:102`, `Settings.tsx:49`). | Same constant for nav and header; group label "Sections"; version from `package.json`. | One label per section, one version source. |
| 29 | P2 | Key label casing | text | `mo1` / `LT1` / `tog1` / `MT` / `sl1` mixed (`keyLabel.ts:122-137`; `QMKKeyboard.tsx:34-45`). | Uniform upper "MO1 / LT1 / TG1 / MT / SL1". | All behavior labels share casing. |
| 30 | P2 | Rename form | text | Invalid rename closes the form and reports via status (`index.tsx:262-266`); user must reopen. | Keep form open, inline error under input. | Invalid name never dismisses the form. |
| 31 | P2 | Homerow descriptions | text | Right-hand defaults render "J: hold → command" vs left "A: hold → ⌃" (`HomerowModEditor.tsx:80` index-into-string hack). | Use `MOD_OPTIONS.sym` lookup as `setMod` does (`:91`). | All homerow descriptions use glyphs. |
| 32 | P2 | Seg controls ARIA | pattern | `.seg-btn` tabs (layers, views, keyboards, modes) have no `role="tab"`/`aria-selected`/`aria-pressed`; active state is color-only. | `role="tablist"`/`tab` + `aria-selected`; arrow-key movement. | Screen reader announces "Layer 2, selected". |
| 33 | P2 | ComboForm Esc | pattern | ZMK/QMK/Mac ComboForms and pendingSwitch banners have no Esc handling (only popovers and inline layer inputs do). | Esc = Cancel in every inline form/banner. | Esc dismisses any open form. |
| 34 | P2 | Error boundary | text | Emoji ⚠️ (`App.tsx:56`) and ⌨️ (`index.tsx:171,176,397,408`) as icons; raw `String(error)` in mono with no "Copy error" or "Reload section". | lucide `AlertTriangle`; "Copy details" button; boundary already resets on nav. | No emoji glyphs; error copyable. |
| 35 | P2 | Open… scope | pattern | `Open…` loads any file but leaves `keyboard` state and Pointing/Settings pointing at the previous board; filename shown, board identity not. | Treat Open… as "Add keyboard from file" feeding the registry (F1). | Opened file appears as a named entry in the seg control. |

## 3. Consistency drift

Canon extracted from `src/styles/globals.css`: radius 7/9/12/14/18 (`:67`); spacing 4pt `--sp-*` (`:63-64`); type 11/13/15/17/20/22/28 (`:59-60`); motion 140/240/420 ms with `--ease-out`/`--ease-spring` (`:83-87`); surfaces `.glass`/`.glass-strong`/`.panel-inset` (`:239-283`); `.btn` hover/active/disabled (`:289-360`); `.keycap` hover/active/selected/muted (`:409-471`); global `:focus-visible` (`:744-748`); `.section-header`+`.section-title` (`:519-533`); `.tag` pill radius 9999 (`:552-569`); `.mono` (`:571-579`); `.toast` (`:587-605`); `.skeleton` (`:659-667`). Most-considered components: `BindingEditor.tsx` (portal, measured placement, Esc), `Sidebar.tsx` (tokens throughout), `Mouse.tsx`/`Settings.tsx` (real-checkbox toggle).

| # | Surface | Dimension | Found (file:line) | Canon (file:line) | Fix |
|---|---|---|---|---|---|
| 1 | Karabiner header | layout | `.toolbar` 52px sticky, 15px title (`KarabinerEditor/index.tsx:52-53`) | `.section-header` 11px uppercase (`index.tsx:471`, `Pointing:265`, `Mouse:70`, `Settings:13`; `globals.css:519`) | Use `.section-header`; delete `.toolbar` |
| 2 | Karabiner root | surface | opaque `background: var(--bg)` (`KarabinerEditor/index.tsx:49`) hides ambient orbs; `.5px` border (`:117`) | transparent `.app-main` (`globals.css:231`); 1px `--border` | Remove background; 1px border |
| 3 | Boards | radius | inline `borderRadius: 16` (`SplitKeyboard:95`, `QMKKeyboard:134`, `MacbookKeyboard:110`); keys 7/7/6 (`crossesLayout:75`, `corneProcyonLayout:14`, `macbookLayout:121`) overriding `.keycap` 9 (`globals.css:415`) | `--r-xl` 14 / `--r-md` 9 (`globals.css:67`) | Tokens; single `KEY_RADIUS` |
| 4 | Pills / chips / rows | radius | 20 (`BindingEditor:536`, `MacKeyEditor:148,394,449`, `MacComboEditor:113`, `RuleEditor:196`); chips 4 (`MacComboEditor:134`, `MacKeyEditor:431`); 5 (`RuleEditor:117,150`); rows 8 (`MacComboEditor:262`); error 6 (`QMKComboEditor:221`) | `.tag` 9999 (`globals.css:557`); `.panel-inset` `--r-lg` (`:281`) | Use `.tag`/`.panel-inset`; add `--r-pill` |
| 5 | Type ramp | size | literals 8, 8.5, 9, 9.5, 10, 12, 14, 16, 18, 36, 40 px (`index.tsx:213`, `BindingEditor:291,536`, `ComboEditor:207`, `App.tsx:56`, `SplitKeyboard:140`) | tokens 11/13/15… (`globals.css:59-60`) | Add `--text-10`, `--text-12`, `--text-14`; ban literals |
| 6 | Mono font | family | `fontFamily: 'monospace'` (`index.tsx:126,183,378,402`; `LayerGrid:108`) | `var(--font-mono)` (`globals.css:58`) | Replace |
| 7 | Toggles | component | span 40×22 no input (`Pointing:142-157`), div 32×20 (`HomerowMod:179-192`), checkbox 40×22 (`Mouse:184-260`, `Settings:176-219`) | none in CSS; Mouse/Settings version is accessible | Extract `<Switch>` to `components/ui` |
| 8 | Hover | state | JS `onMouseEnter` style mutation (`BindingEditor:284-285,532-533`, `MacKeyEditor:119-120,331-332`) | CSS `:hover` (`.btn:335`, `.seg-btn:395`, `.list-row:549`) | `.menu-item:hover` class |
| 9 | Disabled | state | opacity .7 (`RuleEditor:125`), .5 (`HomerowMod:175`), .6 (`Mouse:218`), .3 (`HomerowMod:208`), .38 global | `button:disabled` .38 (`globals.css:180`) | Rely on global; one `.is-disabled` |
| 10 | focus-visible | state | global rule sets `border-radius: var(--r-sm)` on any focused element (`globals.css:747`) → pills/tags snap 20→7 on focus | — | Remove radius from the rule; use `outline-offset` |
| 11 | z-index | scale | 300 (`MacKeyEditor:92`), 999/1000 (`MacKeyEditor:286,289`, `BindingEditor:500,506`), 1000/1001 (`KeyPicker`), 2000 (`BindingEditor:238`), 9999 (`.toast`), 10 (`.toolbar`), 20 (`Sidebar:30`) | none | `--z-sticky/--z-popover/--z-menu/--z-toast` |
| 12 | Scrim | overlay | invisible backdrops (`BindingEditor:500`, `MacKeyEditor:286`), `rgba(0,0,0,.6)` no blur (`KeyPicker:196`) | none | `--scrim` + `--blur-popover` token used by ConfirmBanner/modals |
| 13 | Motion | timing | HomerowMod knob `left var(--dur-1) var(--ease-out)` (`:190`) vs Pointing/Mouse `--dur-2` + `--ease-spring` (`Pointing:155`, `Mouse:252`) | `--dur-2` + `--ease-spring` for element moves (`globals.css:86,84`) | Align |
| 14 | Status timeouts | timing | 2000/2500/3000/3500/4000 ms across sections | none | `--toast-ms` constant 2500 |
| 15 | Section width | layout | `maxWidth 640` centered (`Pointing:276`, `Mouse:74`, `Settings:18`) vs full-bleed (`ZMKEditor`, `KarabinerEditor`) | — | Document: boards full-bleed, forms 640 |
| 16 | Form labels | text | 11px secondary (`ComboEditor:83`, `QMKComboEditor:88`); 10px uppercase with widths 40/44/56 in one file (`MacKeyEditor:347,361,387`); 11px uppercase letterSpacing 1 (`RuleEditor:254`, `HomerowMod:163`) | `.section-title` (`globals.css:527`) | `<FieldLabel>` primitive |
| 17 | Loading | state | emoji+text (`index.tsx:170-173,407-410`), text (`QMKComboEditor:212`), skeleton (`Pointing:317`, `App:25-27`) | `.skeleton` (`globals.css:659`) | Skeleton everywhere |
| 18 | Errors | surface | `.panel-inset` + danger bg (`index.tsx:178,398`, `Mouse:147`, `Settings:233`), hand-rolled radius 6 (`QMKComboEditor:221`), plain (`Pointing:313`) | `.panel-inset` | `<ErrorPanel>` |
| 19 | Combo rows | surface | `.panel-inset` (`ComboEditor:262`, `QMKComboEditor:297`) vs hand-rolled glass-bg radius 8 (`MacComboEditor:255-265`) | `.panel-inset` | Use `.panel-inset` |
| 20 | Duplicated data | code | `COMBO_COLORS` ×3 (`ComboEditor:8`, `QMKComboEditor:18`, `MacComboEditor:8`); `KEY_LABELS` ×2 (`MacKeyEditor:20`, `MacComboEditor:26`); `fallbackKeys` ×4; `getKeyVars` ×2 (`SplitKeyboard:32`, `QMKKeyboard:106`); `Section` ×2 (`Mouse:168`, `Settings:64`) | — | `lib/ui-tokens.ts`, `components/ui/Section.tsx` |
| 21 | Icons | glyph | emoji ⚠️ ⌨️ ✓ (`App:56`, `index.tsx:171`, `KarabinerEditor:141`); text ▾ (`BindingEditor:231`, `MacKeyEditor:88`), × (`KarabinerEditor:89`) | lucide (`Sidebar`, `RuleList`, `KarabinerEditor` toolbar) | lucide only |
| 22 | Button labels | text | "+ Add" (`ComboEditor:211`), "+ Layer" (`index.tsx:283`), `<Plus/> Add` (`MacComboEditor:215`), "Add Rule"/"Add Combo"/"Add Remap"; "Save Changes" vs "Save" | `.btn` gap 6 designed for icon+label (`globals.css:293`) | Icon + verb + noun everywhere |
| 23 | Input heights | size | 26 (`index.tsx:250`, `HomerowMod:208`), 28 (`MacKeyEditor:365`), 32 (`RuleEditor:69`), 34 (`RuleEditor:292`) | `--ctrl-sm/md/lg` 24/30/34 (`globals.css:90`) | Use control tokens |

## 4. Hardcoded personal-assumption inventory

| File:line | Assumption |
|---|---|
| `src/lib/keyboards.ts:15-28` | Two keyboards; ids `corne`/`crosses`; names; variants; absolute `/Users/tomkwon/Documents/cross_keyboard*/…` paths |
| `src/lib/keyboards.ts:1-4` | Comment assumes one git branch per keyboard + worktree layout |
| `src/stores/qmkStore.ts:5` | `/Users/tomkwon/Documents/splitkey2/corne_procyon/corne_procyon.layout.json` |
| `src/components/ZMKEditor/QMKComboEditor.tsx:7-8` | `…/corne_procyon36/keymaps/default/keymap.c` |
| `src/lib/pointingConfig.ts:7` | `keyboardId: 'corne' \| 'crosses'` type union |
| `src/lib/pointingConfig.ts:34-78` | Device names, chips, overlay paths, node regexes `iqs5xx@74`, `trackball@0`, listener names |
| `src/components/ZMKEditor/SplitKeyboard.tsx:3,110` | Every ZMK board uses `CROSSES_LAYOUT` (Corne drawn with Crosses geometry) |
| `src/lib/crossesLayout.ts:15-71` | Fixed 42-key geometry |
| `src/lib/corneProcyonLayout.ts:24-85` | Fixed 44-key geometry with encoder slots at 36/43 |
| `src/lib/qmkParser.ts:13-24` | `LAYOUT_TO_VIA` 44→48 mapping; `LAYER_NAMES` QWERTY / Numbers / Numpad+Media / Gesture / Settings |
| `src/stores/zmkStore.ts:51` | `?? 42` key count fallback |
| `src/components/ZMKEditor/ComboEditor.tsx:72,201` | 42-key fallback board |
| `src/components/ZMKEditor/QMKComboEditor.tsx:78,208` | 44-key fallback board |
| `src/components/ZMKEditor/QMKKeyboard.tsx:99` | "44 full QMK keycode strings" contract |
| `src/lib/zmkParser.ts:370-371` | New layers formatted in rows of 12 |
| `src/components/ZMKEditor/index.tsx:379,402` | Literal `corne_procyon.layout.json` in UI copy |
| `src/components/Settings.tsx:21-31` | Read-only list of the two keyboards; copy "Switch boards from the ZMK editor toolbar" |
| `src/stores/karabinerStore.ts:15-62,68` | Tom's default rules (space layer, w+e→Esc, …) and profile title "Ultimate Keyboards" seeded for all users |
| `src/components/KarabinerEditor/index.tsx:26,93,98,109` | `ultimate-keyboards.json`, `~/Downloads`, Karabiner install path, rule name to enable |
| `src/components/Pointing/index.tsx:407,439` | Scroll-layer default `{layer:5, divisor:4}`, snipe `{layer:8, divisor:3}` = Tom's layer numbers |
| `src/components/ZMKEditor/BindingEditor.tsx:90-91` | macOS shortcut keycodes (`LG(LS(NUMBER_4))`, `LG(TAB)`) in the generic ZMK keycode list |
| `src/components/ZMKEditor/BindingEditor.tsx:70` | Fallback layer list 0–4 when no keymap |
| `src/components/Mouse.tsx:100` | "the split-keyboard scroll layer" |
| `src/lib/macbookLayout.ts:25-117` | US ANSI MacBook only (no ISO/JIS) |
| `src/components/KarabinerEditor/HomerowModEditor.tsx:226`; `src/lib/karabinerGenerator.ts:154` | "120ms" threshold claim not backed by emitted JSON |
| `src/components/KarabinerEditor/MacKeyEditor.tsx:184` | Combo default output `escape` |
| `README.md` "Data flow" | Tom's paths/branches documented as product behavior |

## 5. Systemic root causes and highest-leverage fixes

Root causes:
- **No keyboard/layout registry.** Paths, geometry, key count, layer names, and pointing node regexes are compile-time constants spread over six files instead of one user-editable descriptor.
- **Per-section persistence models.** zustand (ZMK/QMK/Karabiner), component state (Pointing), localStorage (Mouse), immediate disk writes (QMK combos). Dirty tracking and guards are therefore inconsistent and partial.
- **No shared UI primitives.** Popover, confirm, toggle, toast, field label, error/loading panels are each re-implemented, so fixes don't propagate (BindingEditor's portal fix never reached MacKeyEditor).
- **Inline styles bypass the token layer.** The CSS canon is good, but most sizing/radius/z-index in TSX is numeric literals.
- **Native browser affordances used as shortcuts.** `window.confirm`, `a.download`, `beforeunload` all degrade or silently no-op inside Tauri's WKWebView.
- **Boards are divs.** No focus, no ARIA, color-only semantics, no legend on QMK.
- **Dead code in tree.** Four unused files (913 lines) and eleven unused CSS classes blur what the canon actually is.
- **Copy written for one user.** File names, layer numbers, install commands, and threshold claims assume Tom's machine.

Five highest-leverage fixes:
1. **Keyboard registry + layout descriptors** (F1, F2, F35; inventory rows 1–17): Settings "Add keyboard" writing to a persisted store; `SplitKeyboard` takes `layout` from the descriptor; refuse edits on count mismatch.
2. **`<Popover>` primitive** (F3, F10): portal + measured placement + dialog ARIA + focus return; migrate BindingEditor, MacKeyEditor, ParamPicker, KeyDropdown.
3. **App-level dirty registry** (F4, F5, F7, F12, F13): each store exposes `isDirty`/`save`/`revert`; `navigate()` and Tauri `ExitRequested` consult it; Cmd+S and Revert fall out for free.
4. **Keys as buttons + `.key-sub` labels + shared legend** (F9, F23, F24, F32): keyboard nav and non-color semantics in one pass.
5. **Replace native dialogs and blob download** (F6, F11, F27): `<ConfirmBanner>` everywhere; Karabiner "Install" writes the file via plugin-fs on desktop.

Not done: no runtime verification in a browser or the packaged app; contrast and scale numbers are computed from source values; WKWebView behavior for `beforeunload` and blob downloads is inferred, not tested.
