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
| `karabinerStore.ts`, `macDefaults.ts`, `macLayerEditing.ts` | `replaceRules` (sets `rules` only, one history entry), `undo`, `past`; `DEFAULT_PROFILE` is not empty: it holds `DEFAULT_RULES` (8 home-row mods + 3 combos); `macLayerNames` derives layer names from rules, so layer names need no separate write. |
| `src-tauri/tauri.conf.json` | Window minimum is 800 x 600; the web build has no minimum. |
| Run intent | Plain words for a 12-year-old; never name the remapper driver; templates only for MacBook keys; a video link only when it was opened and checked. |

Claude Design (`/design`) is not callable from this builder session, so it was not used. In its place a
throwaway HTML prototype was built from the app's own tokens and the real catalog data, rendered
headless, and inspected. The prototype is not kept in the repo, so its screenshots cannot be re-opened;
section 13 therefore separates what was seen in that render, what was recomputed and can be re-checked
from this file, and what is still only proposed. Re-run the design in Claude Design when a session that has
it picks up KE-46, starting from this file; the decisions below are the brief.

## 2. Task, comparison, next action

- Task: "Which setup is worth trying, and is it safe to add?"
- What people compare at once: what each setup does (the picture and one line), how hard it is to learn,
  and whether it clashes with what they already have.
- Next action: open one, check the picture, add it. Nothing else on the screen competes with that.

## 3. Where it lives and the flow

- New first tab **Templates** in the MacBook Keys editor (`KarabinerEditor`), before Keymap, Homerow mods,
  Combos, Remapping. First run opens on Templates. A new profile is never empty (it starts with
  `DEFAULT_RULES`), so first run is not decided by the rules: the editor opens on Templates until the
  Templates tab has been shown once, recorded in one local flag (`uk.templates.seen`, written when the tab
  first renders). After that it opens on the tab it opens on today. The gallery on first run is the
  gallery over the default profile (section 7 lists exactly what each card says there).
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
   No filter and no search: eight cards fit two screens. Revisit when the catalog passes about 12.
4. Grid: `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`, gap 14, driven by the content
   area's own width, not the window, so the sidebar cannot break it. Tiles in a row are equal height.

Card (the whole pane is one button; no nested buttons or links):

| Part | Rule |
| --- | --- |
| Preview | Mini keyboard (section 5), first, full card width. |
| Title | `shortName`, 15/20 semibold, at most 2 lines then ellipsis (Studio States: too-long content). |
| Line | `blurb`, 13/18, secondary ink, at most 2 lines. Always reserve 2 lines so tiles align. |
| Footer | Difficulty word, then at most one tag: **In your keys** (check + green ink), **Replaces N of your rules** (amber ink) or, when every rule it would replace is one the app started you with, **Swaps N starting keys** (amber ink). No tag when none applies (including a template that is partly there already: it just adds the rest). |
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
3. **Notice** (only when the status is `clash`): amber tone, bold first line "This changes keys you already
   set up", one line "Adding it replaces N of your rules. Everything else stays.", then the replaced
   rules' `description` as a short list. When every replaced rule is one the app started you with
   (`replacesOnlyStarting`, section 7) the first line is "This swaps your starting keys" and the line is
   "Adding it swaps N of the keys the app started you with. Everything else stays." This is the single
   Notice on the screen.
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
| Already added (`in`) | **Already in Your Keys** (disabled, with the reason beside it) and a quiet **Remove from My Keys** link | Remove takes out exactly the template's rules (section 7) and is one undoable step. |

Buttons are Title Case verbs (Studio `copy/button-title-case`). Cancel never changes anything.

## 7. Conflicts and apply

Preview first: nothing is written until the footer button. The sheet is the preview (picture, list, and
the conflict Notice) and the button is the second step.

### Definitions (all by value, so the function is pure and testable)

- **Same rule**: two rules are the same when every field except `description` is equal; the keys of a combo
  compare as a set. `description` never counts.
- **Slot** (the thing a rule takes over; two different rules in one slot cannot both work):
  - `hold:<fromKey>` for a `homerow_mod` or a `layer_activator` (a key can have one hold behaviour, so a
    home-row mod and a layer activator on one key share the slot);
  - `combo:<keys, sorted>` for a `combo` (the same pair of keys; two combos that only share one key, such as
    K+L and K+J, are different slots and not a clash);
  - `bind:<layerName>:<fromKey>` for a `layer_binding`.
  A home-row mod and a combo on one key (K with K+L=Enter) are different slots. They are **not** a clash:
  the shipped default profile already has exactly that (`DEFAULT_RULES`: 8 home-row mods plus the K+L, I+O,
  W+E combos), so the rule must never remove one to add the other.
- **Layer**: a template that uses a `layerName` owns that whole layer. Any existing rule with that
  `layerName` that is not one of the template's rules is replaced (a half-merged layer would not do what the
  picture shows).
- **Home-row family**: the templates in category `home-row` are alternatives, not additions. A home-row
  template owns all eight home-row keys (A S D F J K L ;): any existing `homerow_mod` on one of those keys
  that is not one of its rules is replaced, even when the key is not in its own picture (so Starter on top of
  Home row mods leaves exactly the Starter four). Other `homerow_mod` rules, such as Caps Lock, are not in the
  family.

### `templateStatus(template, rules)` (pure, in `src/lib/templates/`, unit tested)

From the existing `rules` it computes three lists:

- `kept`: existing rules that are the same as a template rule. They stay exactly where they are and are not
  added again, so applying never creates a duplicate.
- `replaced`: existing rules that are not `kept` and share a slot with a template rule, or are in a layer the
  template owns, or (home-row templates) are a `homerow_mod` on a home-row key.
- `added`: template rules that have no same rule in `rules`, in catalog order.

and returns one status:

- `in`: `added` and `replaced` are both empty. Cards show "In your keys".
- `clash`: `replaced` is not empty. Returns `replaced` and its count. Cards show "Replaces N of your
  rules". `replacesOnlyStarting` is true when every replaced rule is the same as a rule in `DEFAULT_RULES`;
  the card then reads "Swaps N starting keys" and the sheet uses the starting-keys Notice (section 6).
- `free`: neither. This includes a template that is partly present already (`kept` is not empty, `added`
  is): Add appends only `added`. No tag.

Because `in` needs nothing to replace, a smaller template is never `in` just because a bigger one holds its
rules: with CAGS added, Starter is a `clash` ("Replaces 4"), not "In your keys".

### Add, Replace and Add, Remove

- **Add** and **Replace and Add**: `next = existing.filter(not in replaced).concat(added)`. One
  `replaceRules(next)` call. `replaceRules` is one history entry, so Undo restores everything in one step.
  Layer names need no write: `macLayerNames` derives them from the rules, and calling `addLayer` would add a
  second history entry and break the one-step Undo, so KE-46 must not call it.
- **Remove from My Keys** (only when `in`): `next = existing.filter(not the same as any template rule)`.
  One `replaceRules` call. No other template's rules are touched because no catalog rule is shared between two
  templates that can both be `in` (a unit test asserts it, section 14).
- A clash replaces only the listed rules, never the whole profile: other rules stay (the Notice says so).

### What the app must report (these results are the unit test's expected values)

On the default profile (a fresh install; first-run gallery): Easy-reach combos is `in` (the profile already
has the three combos, so the card says "In your keys" and that is true); Home row starter, Home row mods
(GACS) and (CAGS) are `clash` with `replacesOnlyStarting` and counts 8, 6 and 4 ("Swaps 8 starting keys",
"Swaps 6", "Swaps 4"; the GACS count is lower because the default S and L already match, the CAGS count
because A, S, L and ; do; Starter replaces all eight because it owns the whole home row and none of the
default rules match its four); the other four are `free`.

With exactly one template in the profile, status of the others:

| In the profile | Result for the others |
| --- | --- |
| Caps Lock: Escape and Control | Number pad: `clash` (1). All others `free`. |
| Number pad | Caps Lock: Escape and Control: `clash` (1; both own the Caps Lock hold slot). Symbols and the others `free`. |
| Home row starter | GACS: `clash` (2: D and K differ; F and J are kept). CAGS: `free` (adds 4; D F J K are kept). |
| GACS | Starter: `clash` (6). CAGS: `clash` (4). |
| CAGS | Starter: `clash` (4, adds none, so the result is exactly Starter). GACS: `clash` (4). |
| Space arrows, Symbols, Easy-reach combos | Every other template `free`: layers and combos never clash with home-row mods. |

Applying any single template to a profile that has none of its slots yields `rules + template.rules`.

### After Add

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
| First run (default profile, Templates not yet seen) | Templates is the opening tab; lede is the explanation; no empty shell. Over `DEFAULT_RULES`: Easy-reach combos "In your keys", the three home-row cards "Swaps N starting keys", the rest untagged (section 7) | n/a |
| Loading | None: the catalog is bundled JSON, so nothing to wait for | None |
| Empty catalog | EmptyState "No templates yet" (should not happen; guards a bad build) | n/a |
| Error | n/a | Video fails: toast with Copy Link. Add fails (store throws): the sheet stays open with an error panel "Couldn’t add this. Your keys are unchanged. Try again." and **Try Again** |
| Offline | Fully works | Everything works except the video, which the browser reports |
| Remapping unavailable (driver not approved) | Fully works; adding only edits the draft | Try it shows "Turn On Remapping" path; nothing else is blocked |
| Many conflicts | Tag shows the real count | Rule list in the Notice scrolls with the body; never more than the body height |
| Long content | Title 2 lines then ellipsis; line 2 lines | Title wraps; `why` and `changes` wrap; no horizontal scroll at any width |
| Zero | No tag instead of "0 rules"; a template that adds only (nothing replaced) has no tag | No Notice instead of an empty one |
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

## 13. Rendered verification: what is proven, what is not

Honest status. The design tool the plan asks for (Claude Design, `/design`) was not available to this
session. The check that was done is a throwaway prototype outside the repo (one HTML file using the catalog
JSON and the app's token values), rendered headless with `af-browse`. The prototype and its screenshots were
not kept, so nothing in the "seen in the render" list can be re-opened from the repo; treat it as the
author's observation, not evidence. The right-hand column says how a later session re-checks each claim.

| Claim | Status | How to re-check |
| --- | --- | --- |
| Role-colour contrast: ink `#101827` on orange 8.6, blue 9.3, purple 6.5; primary button 9.2 dark, 5.5 light | Recomputed in this fix round (WCAG relative luminance) and matches | Recompute from the hex values in sections 5 and 11; the unit test for tokens can assert them. |
| Light neutral key `#f1f3fa` against the roles is 1.9, 1.7, 2.5:1 (below 3:1) | Recomputed; matches the "1.7 to 2.5" claim | Same. The mark and rim rule in section 5 exists because of it. |
| Green `#166534` passes 4.5:1 on its tint; `#15803d` did not | Seen in the render only | Compute on the final tint values. |
| Gallery at 1280, 820, 390 in both themes (first screen) | Seen in the render only | Rendered QA in section 14, on the real build. |
| Grid minimum 240 gives 2 columns at 820; 270 gave one oversized card | Seen in the render only | The same sizes on the real build. |
| Detail sheet: no conflict at 1280 dark and 390 dark; conflict at 1280 light, 820 dark, 390 light; Added toast 390 dark; hover (light), focus (dark) | Seen in the render only, for one template (Space arrows) at 390 | Section 14 lists every template. |
| Cards and sheets for Home row, Number pad, Symbols and Combos | **Not verified.** The first-screen frames cut off the lower rows and only one layer sheet was inspected, so the previews, wrapping and legends of those cards are unchecked | KE-46 renders all eight cards and eight sheets. |
| Pressed state, segmented switch animation, sheet drag between detents, Reduce Motion | **Not verified.** Specified only | KE-46 renders and records them. |
| The real app in Tauri (fonts, real sidebar), and the Try it live state (needs the remapper running; Tom, manual) | **Not verified** | KE-46; Tom for the live state. |
| Claude Design output | **Not produced** | Run `/design` from this file as the brief before KE-46 styles the screen. |

Findings from the render that are folded into the spec above (author's observation):

1. A grid minimum of 270 gave one oversized card at 820; changed to 240 (2 columns).
2. Full catalog names truncated mid-phrase on cards ("... Shift…"); added `shortName`.
3. The "In your keys" green failed 4.5:1 on the light tint; moved to `#166534`.
4. The toast shrank to a 4-line column at 390; set its width to `min(520px, 100vw - 24px)`.
5. Light neutral keys were the same white as the card and disappeared; set to `#f1f3fa` with a stronger rim.
6. Role colours alone are weak on the light page (1.7 to 2.5:1); every role now carries a mark and rim.

KE-46 must not call the visual design finished until the "Not verified" rows are rendered on the real build,
with screenshots attached to the QA ledger.

## 14. Test plan for KE-46

Unit (bun test):

- `templateStatus` for the whole catalog, using the expected results in section 7: the default profile (statuses,
  counts, `replacesOnlyStarting`), and every ordered pair "profile holds only template A, status of template
  B" (the table in section 7 is the expected data). Plus: each template alone is `in` for itself; applying any
  `free` or `clash` template and then asking again returns `in` for it (apply is idempotent); applying
  never leaves two rules in one of the template's slots and never produces a duplicate rule; a home-row mod and a combo on one
  key never clash; same layer name with different content is a clash.
- Remove: after Add then Remove on a profile that did not have the template, the rules equal the original;
  Remove is offered only for `in`.
- Across the catalog, no rule is the same as a rule of two different templates that can be `in` together.
- One history entry per Add or Remove: `past` grows by one, one `undo` restores the previous rules, and
  `addLayer` is never called.
- `blurb` and `shortName` present and within limits for every template; `TemplateKeyboard` role map (each
  rule type to role and glyph); video fields required when a row is drawn.
- First-run flag: Templates opens first while `uk.templates.seen` is unset, and not after.

Existing engine, service and app tests stay green:
`bun test && npx tsc --noEmit && (cd native/engine && cargo test -q)`.

Rendered QA (screenshots, both themes, 390 / 820 / 1280): the gallery over the default profile (first run:
"In your keys" on combos, "Swaps N starting keys" on the three home-row cards) and over a customised profile
(a "Replaces N of your rules" card); all eight cards and all eight sheets, with and without a conflict;
sheet at medium and large detent on phone; pressed state, hover and keyboard focus; toast with Undo; the video
row opening the browser; Reduce Motion; card and sheet at ~130% text zoom with no clipping and no sideways
scroll.

## 15. Left out on purpose (and why)

- Filter chips and search: eight cards; revisit past about 12.
- A third "merge" choice when keys clash: a half-applied template would not do what its picture shows.
- A "Not here yet" list of ideas the engine cannot do (`leftOut` in the catalog): its reasons mention the
  engine and need rewriting in plain words first.
- Template editing or saving your own: a later task, not part of picking a setup.
- Karabiner is not mentioned anywhere in the copy above, on purpose.
