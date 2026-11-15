# Templates gallery: design (KE-45)

Status: design for KE-46 to build. Nothing here changes code. Written 2026-11-15 for the `uk-pro-roadmap` run.

Outcome: a person on a MacBook opens **Templates**, sees popular key setups as cards, opens one to see
what it does on a picture of their keyboard, adds it to their keys with one button, and can undo it.
The remapping itself changes only when they press the existing Apply and enable (run intent, constraint 4).

## 1. Sources and how they were used

| Source | What it settled |
| --- | --- |
| `~/.claude/refs/studio-design-language.md`, Studio `docs/` (`Glass.md`, `ContentDesign.md`, `States.md`, `components/Card`, `Sheet`, `Segmented`, `Notice`, `Toast`) | Card = pane button, no shadow, equal-height tiles, a selected card shows a tag not a solid fill; sheet anatomy; one Notice per screen; copy rules (Title Case buttons, curly quotes, error formula); states list. |
| `AppleRules.md` F-03, F-04, F-07, F-08, F-09, F-10 (sheets), P-48 (undo), Q-01, Q-09, Q-10, Q-11, Q-12, Q-13, Q-14 | One sheet at a time; Cancel leading and the action trailing; medium detent for progressive disclosure; wide windows get a centred sheet over a dim; Mac sheets are modal to their window; undo is a toast; render before showing; glass is one fill deep (cards sit on the page, not inside another pane); anything clickable answers hover; focus rings need room; say a fact once; align by what the value is. |
| `src/lib/templates/catalog.json` and `index.ts` | The data the screens show: `name`, `why`, `forWho`, `changes`, `caution`, `difficulty`, `category`, `rules`, `video` (title, channel, published, startSeconds, note), `source`. `templateKeys()` is the base for conflicts. |
| `MacbookKeyboard.tsx`, `macKeymapView.ts`, `macbookLayout.ts`, `ScaledBoard.tsx`, `ui/` | Existing role colours (orange mod-tap `#f2a35e`, blue layer `#5fc8ec`, purple combo `#a48cf5`), key geometry, board scaling, `ConfirmBanner`, `Toast`. Reuse, do not restyle. |
| `karabinerStore.ts` | `replaceRules`, `undo`, `past`: one history entry per apply is possible. |
| `src-tauri/tauri.conf.json` | Window minimum is 800 x 600; the web build has no minimum. |
| Run intent | Plain words for a 12-year-old; never name the remapper driver; templates only for MacBook keys; a video link only when it was opened and checked. |

Claude Design (`/design`) is not callable from this builder session, so it was not used. In its place a
throwaway HTML prototype was built from the app's own tokens and the real catalog data, rendered
headless, and inspected (section 13). Re-run the design in Claude Design when a session that has it
picks up KE-46, starting from this file; the decisions below are the brief.

## 2. Task, comparison, next action

- Task: "Which setup is worth trying, and is it safe to add?"
- What people compare at once: what each setup does (the picture and one line), how hard it is to learn,
  and whether it clashes with what they already have.
- Next action: open one, check the picture, add it. Nothing else on the screen competes with that.

## 3. Where it lives and the flow

- New first tab **Templates** in the MacBook Keys editor (`KarabinerEditor`), before Keymap, Homerow mods,
  Combos, Remapping. First run (no rules in the profile) opens on Templates.
- Flow: **Gallery** -> tap a card -> **Detail sheet** (preview first) -> **Add to My Keys** -> toast with
  **Undo** -> (optional) **Turn On Remapping** goes to the Remapping tab, where the existing Apply and
  enable is the only thing that changes live typing.
- Naming decision (interpretation of the plan's "apply"): the step in this screen is labelled **Add to My
  Keys**, not "Apply". "Apply" already means "change live typing" in the Remapping tab; two Applys with
  different powers would mislead a 12-year-old. In this document "apply a template" means that button.

## 4. Gallery

Layout (single scroll column inside the tab; no inner scroll areas):

1. Title `Templates` (Title Case nav title) and one lede: "Pick a setup that’s popular with Mac people.
   You’ll see what it changes before you add it."
2. One legend line for the three key colours (said once for the whole page, not per card): orange "Hold for
   a shortcut key", blue "Hold for new keys", purple "Press together".
3. Sections, in this order, with a heading each: **Caps Lock**, **Home row keys**, **Hold a key, get new
   keys** (catalog category `layers`), **Press two keys together** (`combos`). Inside a section, easy
   first, then medium, then tricky; ties keep catalog order. A section with no templates is not drawn.
   No filter and no search: nine cards fit two screens. Revisit when the catalog passes about 12.
4. Grid: `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`, gap 14, driven by the content
   area's own width, not the window, so the sidebar cannot break it. Tiles in a row are equal height.

Card (the whole pane is one button; no nested buttons or links):

| Part | Rule |
| --- | --- |
| Preview | Mini keyboard (section 5), first, full card width. |
| Title | `shortName`, 15/20 semibold, at most 2 lines then ellipsis (Studio States: too-long content). |
| Line | `blurb`, 13/18, secondary ink, at most 2 lines. Always reserve 2 lines so tiles align. |
| Footer | Difficulty word, then at most one tag: **In your keys** (check + green ink) or **Replaces N of your rules** (amber ink). No tag when neither applies. |
| Surface | Pane fill, 1px pane rim, radius 20, padding 14, no shadow, no gradient. |

States: rest; hover (pane-hover fill, accent rim; Q-11); pressed (scale 0.98); keyboard focus (2px accent
ring with 2px offset, never clipped: the grid has at least 4px padding inside its scroller; Q-12);
"In your keys" (tag, never a solid pane); "Replaces" (amber tag). Disabled does not exist: every card can be
opened.

Card copy. The catalog has long `name` values (up to 56 characters) and a multi-sentence `why`. KE-46 adds
two required fields to `catalog.json` and the `KeyTemplate` type, with a test that each is non-empty and
within the limit (blurb at most 80 characters, shortName at most 32):

| id | shortName | blurb |
| --- | --- | --- |
| caps-esc-ctrl | Caps Lock: Escape and Control | Caps Lock becomes Escape when tapped and Control when held. |
| home-row-starter | Home row starter | Hold D, F, J or K for Command or Shift. A tap still types the letter. |
| home-row-gacs | Home row mods (GACS) | Your eight home-row letters turn into shortcut keys when you hold them. |
| home-row-cags | Home row mods (CAGS) | The same idea, with Command on a stronger finger for Mac habits. |
| space-arrows | Space for arrow keys | Hold Space and H J K L become arrow keys. |
| combos-easy-reach | Easy-reach combos | Press two keys together for Enter, Backspace or Escape. |
| number-pad-layer | Number pad on your right hand | Hold Caps Lock and your right hand becomes a number pad. |
| symbols-layer | Symbols without Shift | Hold Right Option and type symbols without Shift. |

Difficulty words (from `difficulty`): easy = "Easy", medium = "Takes practice", tricky = "Tricky".
The sheet title uses the full `name`; the card uses `shortName` so a title never ends mid-phrase.

Card status is computed from the working profile, not stored: see `templateStatus` in section 7.

## 5. Mini keyboard preview

One component, `TemplateKeyboard`, used by cards (small) and the sheet (large). It reuses the MacBook key
geometry and `ScaledBoard`; it does not invent a new board.

- Crop: the four lower rows (Tab row, home row, Shift row, bottom row with arrows), 14.5 units wide. Every
  template's keys are inside it (checked against the catalog: Caps Lock, letters, Space, Right Option).
  The function and number rows are left out to keep the card short.
- Laid out at real size (50px pitch, 46px keys) and transform-scaled to the card as one picture, so text in
  it is never shrunk below the platform's 8px floor (the in-app browser rule); label sizes are written
  before the scale, not after.
- Unchanged keys: neutral key fill and rim, no label. Changed keys carry the role:

| Role | Colour (both themes) | Mark inside the key | Rule it comes from |
| --- | --- | --- | --- |
| Hold for a shortcut key (mod-tap) | orange `#f2a35e`, rim `#b45309` | the modifier glyph, one of the four: `⌘ ⌥ ⌃ ⇧` | `homerow_mod` |
| Hold for new keys (layer key) | blue `#5fc8ec`, rim `#0e7490` | the word `hold` | `layer_activator` |
| Key that changes while held | blue tint, dashed `#0e7490` border | its new output (`←`, `7`, `&`) | `layer_binding` |
| Press together (combo) | purple `#a48cf5`, rim `#6d4fd6` | the key's letter | `combo` |

- Colour is never the only signal: each role also has a mark and the dashed border separates "changes while
  held" from "the key you hold". The three names are the same words in the legend, `aria-label` and sheet.
- Ink on the role fills is `#101827` in both themes (contrast 8.6, 9.3, 6.5 against orange, blue, purple).
- Card legend is the page legend (section 4). The sheet legend lists only the roles that template uses.
- Accessibility: the picture is `role="img"` with an `aria-label` built from the template, for example
  "Preview: Caps Lock is Escape when tapped and Control when held. Other keys stay the same." Built from
  `changes`, so it is said once and stays true.
- The preview shows the template's result by itself. In the sheet, a segmented control `Your keys now | With
  this template` switches to the working profile's own picture for comparison (section 6).

## 6. Detail sheet

Presentation by available width (the sheet follows the window, not the platform name):

| Width | Presentation |
| --- | --- |
| 641 px and wider (tablet, desktop, Mac window) | Centred card, 680 wide, max height window minus 56, over a dimmed parent window; modal to this window only (F-08, F-09). |
| 640 px and narrower (phone, web narrow) | Bottom sheet, 8px inset from the edges, grabber, medium detent about 62% height, drag to large (F-01, F-05, F-07); swipe down or Esc closes. |

Both: footer fixed, body scrolls, title area fixed, one sheet at a time (F-03), focus moves to the title on
open and returns to the card on close, Esc closes, a trailing close circle in the title area (Studio
convention). Reduce Motion: crossfade, no scale on the page behind.

Content order (top to bottom; each fact once, Q-13):

1. Meta line: difficulty word, dot, category ("Easy . Caps Lock").
2. Title: full `name`.
3. **Notice** (only when there are conflicts): amber tone, bold first line "This changes keys you already
   set up", one line "Adding it replaces N of your rules. Everything else stays.", then the replaced
   rules' `description` as a short list. This is the single Notice on the screen.
4. Segmented `Your keys now | With this template` (default: With this template) over the large preview and the
   role legend.
5. **Why it helps**: `why`, then "Good for:" and `forWho`.
6. **What changes**: `changes`, one bullet each.
7. **Good to know**: `caution`. Plain text with a heading, not a second Notice. Omitted when absent.
8. **Try it** (section 8).
9. **Learn more**: the video row (below). The `source` link, when it is not the video's page, is a second row
   of the same kind. No row for a video that is missing; the catalog rule (checked before listing) means a
   missing video is simply absent.
10. Footer: Cancel (leading) and the action (trailing), equal width, 44 high. Both fit side by side at 390.

Video row: a resource row (title in accent ink, `channel . Mon YYYY` beneath, a trailing external-link
symbol), the whole row is the target, hover shows the accent rim (Q-11). Tapping opens the default browser
through the app's external-URL command (a YouTube-only variant of `openUrl.ts`, because the existing one is
GitHub-only), at `startSeconds` when the catalog gives one. If it fails: toast "Couldn’t open the video.
Copy the link instead." with **Copy Link**. The `note` (what the video does and does not show) sits as one
secondary line under the row when it is not already said by the title; the check date is data, not UI.

Footer action by state:

| State | Primary label | Behaviour |
| --- | --- | --- |
| Nothing clashes, not added | **Add to My Keys** | Adds and closes. |
| Clashes | **Replace and Add** | Replaces the listed rules and adds, one undoable step. |
| Already added | **Already in Your Keys** (disabled, with the reason beside it) and a quiet **Remove from My Keys** link | Remove is one undoable step. |

Buttons are Title Case verbs (Studio `copy/button-title-case`). Cancel never changes anything.

## 7. Conflicts and apply

Preview first: nothing is written until the footer button. The sheet is the preview (picture, list, and
the conflict Notice) and the button is the second step.

`templateStatus(template, rules)` (pure function, in `src/lib/templates/`, unit tested) returns one of:

- `in`: every rule of the template (compared by value, ignoring `description`) is already in `rules`.
  Cards show "In your keys".
- `clash`: not `in`, and a physical key in `templateKeys(template)` is used by an existing rule that is not
  one of this template's rules. Returns the clashing existing rules (the ones to replace) and their count.
  A layer-name collision (same `layerName` with different content) counts as a clash on the layer's
  activator key. Cards show "Replaces N of your rules".
- `free`: neither.

A clash replaces the clashing rules, never the whole profile: other rules stay (the Notice says so).
Replaced rules are removed, the template's rules are appended in catalog order, and layer names the
template introduces are added. All of it is one `replaceRules` call so Undo restores everything in one step.

Known pairs the function must report (from the catalog): the three home-row sets replace each other;
`number-pad-layer` and `caps-esc-ctrl` share Caps Lock; `symbols-layer` and the number pad use different
layers and keys and do not clash; the home-row sets and `combos-easy-reach` share K, L and others and are
reported as a clash even if the engine could cope. KE-46 should check whether the engine really allows a
home-row mod and a combo on one key and, if it does, narrow this rule in the function and its tests.

After Add:

- Dialog closes. Toast (6 s): "Added “Caps Lock: Escape and Control” to your keys. Not turned on yet." with
  **Undo** (calls the store's undo; works for the whole step) and a second action **Turn On** that opens the
  Remapping tab. The profile is marked unsaved as for any edit; the draft rules (retained automatically) keep
  it. The toast is `min(520px, 100vw - 24px)` wide so the text never wraps to four lines (found in the render).
- The card now says "In your keys". The toolbar's own Undo (`KeymapActionBar`) undoes the same step; KE-46 confirms that the single history entry makes it so.
- Remapping does not change. The existing Remapping tab copy already says remapping starts only on Apply
  and enable.

What Add never does: start or stop remapping, touch other profiles, save to disk by itself.

## 8. Try it

A short practice field inside the sheet, shown for every template. It only works when the template's rules
are really live (profile contains them and the remapper's last applied profile matches), so it never reads
"ready" when it cannot work (run constraint: controls show what can really happen):

| Situation | Field | Line beneath |
| --- | --- | --- |
| Not added | Disabled | "Turns on after you add this and turn on remapping." with a link **Add to My Keys** |
| Added, remapping off or older rules | Disabled | "Added, but not turned on yet." with a link **Turn On Remapping** (goes to the Remapping tab) |
| Live | Enabled, placeholder "Type here to try it" | The first two `changes` lines as tips ("Tap Caps Lock: Escape") |

The field is an ordinary text area; remapping is system-wide, so no hook into typing is needed.

## 9. States

| State | Gallery | Sheet |
| --- | --- | --- |
| First run (empty profile) | Templates is the opening tab; lede is the explanation; no empty shell | n/a |
| Loading | None: the catalog is bundled JSON, so nothing to wait for | None |
| Empty catalog | EmptyState "No templates yet" (should not happen; guards a bad build) | n/a |
| Error | n/a | Video fails: toast with Copy Link. Add fails (store throws): the sheet stays open with an error panel "Couldn’t add this. Your keys are unchanged. Try again." and **Try Again** |
| Offline | Fully works | Everything works except the video, which the browser reports |
| Remapping unavailable (driver not approved) | Fully works; adding only edits the draft | Try it shows "Turn On Remapping" path; nothing else is blocked |
| Many conflicts | Tag shows the real count | Rule list in the Notice scrolls with the body; never more than the body height |
| Long content | Title 2 lines then ellipsis; line 2 lines | Title wraps; `why` and `changes` wrap; no horizontal scroll at any width |
| Zero | No tag instead of "0 rules" | No Notice instead of an empty one |
| Done | "In your keys" tag | "Already in Your Keys" |

## 10. Responsive behaviour

The gallery follows its content width; the sheet follows the window width (table in section 6).

| Check size | Gallery columns | Sheet | Notes |
| --- | --- | --- | --- |
| 390 x 844 (phone; web build, future companion) | 1 | Bottom sheet, medium detent, grabber | Needs the sidebar to collapse to a top bar below 640 (the prototype assumed it; the Tauri window cannot go below 800, so this is the web build and the future companion); tabs wrap. Legend wraps to two lines. |
| 820 x 900 (tablet; also the Mac minimum window of 800 with the 228px sidebar) | 2 | Centred card | Content is about 540 wide after the sidebar, so the grid minimum is 240, not 270 (270 gave one huge card; found in the render). |
| 1280 x 800 (desktop; default Mac window is 1200) | 3 | Centred card, 680 | Content about 1000 wide. |

Touch targets are at least 44 high for the footer buttons and the segmented items; cards and the video row
are far larger.

## 11. Themes

The app today ships dark only (`globals.css` has no light tokens). Studio says product apps ship both, so
KE-46 adds a light set for the tokens this screen uses (as the prototype did) rather than hard-coding
colours. Values proven in the render:

| Token | Dark | Light |
| --- | --- | --- |
| Page haze | `#0a0c16` with teal/sky glow | `#eef0f8` with the same glow at lower alpha |
| Pane / hover / rim | white 5.5% / 9% / 10% | white 72% / 92% / `rgba(20,24,60,.12)` |
| Float (sheet) | `#171a2c`, rim white 14% | `#ffffff`, rim `rgba(20,24,60,.14)` |
| Dim behind the sheet | `rgba(3,4,12,.55)` | `rgba(20,24,50,.28)` |
| Text / secondary / muted | `.98` / `.68` / `.58` of `#f4f5ff` | `#12152b` / `.74` / `.62` |
| Accent text and link | `#5eead4` | `#0f766e` |
| Primary button | `#2dd4bf` with `#04201c` text (9.2:1) | `#0f766e` with white text (5.5:1) |
| Neutral key | white 12%, rim white 22% | `#f1f3fa`, rim `rgba(20,24,60,.30)` |
| Amber (Notice, "Replaces" tag) | tint `rgba(251,191,36,.14)`, ink `#fcd34d` | tint `rgba(217,119,6,.12)`, ink `#92400e` |
| Green ("In your keys") | `#4ade80` | `#166534` (the first try, `#15803d`, was 4.2:1 on its tint and failed; `#166534` passes 4.5) |

Role fills (orange, blue, purple) and their ink are identical in both themes. On the light page they are
1.7 to 2.5:1 against the neutral key, below the 3:1 non-text guide, so each role also has a darker rim, a mark
inside the key, and a dashed variant; that is why the mark rule in section 5 is required, not decoration.

## 12. Accessibility, keyboard, motion

- Tab order: tabs, cards in reading order, then (in the sheet) close, segmented, text/links, Cancel, action.
  Focus is trapped in the sheet; Esc and the close circle close it; focus returns to the opening card.
- Each card is `<button>` with an accessible name "Title. Blurb. Difficulty. In your keys." (last part only
  when true). The grid is a plain list of buttons, no roving index needed at this size.
- Segmented is a `radiogroup`, arrows move the selection. Notice is `role="note"`. The toast is
  `role="status"` (polite), with Undo reachable by keyboard while it shows and the toolbar Undo after.
- Reduce Motion: sheet crossfades, press scale off, toast fades. Normal motion: sheet rises on the Studio
  sheet recipe, toast on the app's existing `toast-in`. Every screen draws its resting state in frame one:
  nothing in the gallery depends on an entrance animation.
- Text sizes: body 13 to 14, 12 for tags and metadata, nothing under 12 outside the scaled keyboard art.

## 13. Rendered verification (prototype, throwaway)

Build: one HTML file using the catalog JSON and the app's token values, outside the repo (not committed; this
task owns only this document). Rendered headless with `af-browse` at 1280x800, 820x900 and 390x844, in dark
and light. Frames inspected: gallery at all six combinations; detail sheet (no clash) at 1280 dark and
390 dark (medium detent); detail with conflict at 1280 light, 820 dark and 390 light (large detent); Added
toast at 390 dark; card hover (light) and keyboard focus (dark). Contrast figures were computed, not eyeballed.

Found in the render and already folded into the spec above:

1. A grid minimum of 270 gave one oversized card at 820; changed to 240 (2 columns).
2. Full catalog names truncated mid-phrase on cards ("... Shift…"); added `shortName`.
3. The "In your keys" green failed 4.5:1 on the light tint; moved to `#166534`.
4. The toast shrank to a 4-line column at 390; set its width to `min(520px, 100vw - 24px)`.
5. Light neutral keys were the same white as the card and disappeared; set to `#f1f3fa` with a stronger rim.
6. Role colours alone are weak on the light page (1.7 to 2.5:1); every role now carries a mark and rim.

Not verified yet (KE-46 must, on the real build, with screenshots in the QA ledger):

- The real app in Tauri, not the prototype; real fonts and the real sidebar.
- Pressed state, the segmented switch animation, sheet drag between detents, and Reduce Motion.
- Layer and combo cards (space, number pad, symbols, combos) in the final component: the prototype drew them,
  but only the Space-arrows sheet at 390 was inspected, and the card rows below the first screen were cut off
  in the gallery frames.
- The Try it live state, which needs the remapper running (Tom, manual).
- Claude Design output, because this session could not run `/design`.

## 14. Test plan for KE-46

Unit (bun test): `templateStatus` for each catalog pair (in, free, clash, layer-name clash, counts);
`blurb` and `shortName` present and within limits for every template; `TemplateKeyboard` role map
(each rule type -> role, glyph); one history entry per apply and one `undo` restores the previous rules;
video fields required when a row is drawn. Existing engine, service and app tests stay green:
`bun test && npx tsc --noEmit && (cd native/engine && cargo test -q)`.

Rendered QA (screenshots, both themes, 390 / 820 / 1280): gallery at rest, hover, focus, with an "In your
keys" card and a "Replaces" card; sheet with and without a conflict; sheet at medium and large detent on
phone; toast with Undo; the video row opening the browser; card and sheet at ~130% text zoom with no
clipping and no sideways scroll.

## 15. Left out on purpose (and why)

- Filter chips and search: nine cards; revisit past about 12.
- A third "merge" choice when keys clash: a half-applied template would not do what its picture shows.
- A "Not here yet" list of ideas the engine cannot do (`leftOut` in the catalog): its reasons mention the
  engine and need rewriting in plain words first.
- Template editing or saving your own: a later task, not part of picking a setup.
- Karabiner is not mentioned anywhere in the copy above, on purpose.
