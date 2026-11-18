# Hands-on typing test: MacBook remapping

For Tom, on his own MacBook. About 20 minutes. It checks what the tests cannot: real keys, real timing, real sleep. Each section matches one row in `verify/checks.yaml` (HANDS-1 to HANDS-9). After each section, tell the agent pass or fail, plus the note asked for. The agent records the rows with `af verify record --target macbook`.

Use the default MacBook profile: home-row mods (A=Ctrl, S=Option, D=Shift, F=Cmd, J=Cmd, K=Shift, L=Option, ;=Ctrl) and the combos K+L = Enter, I+O = Backspace, W+E = Escape. Type only test text in this list, never real messages or passwords.

## 0. Get the build

**Do not start until the agent has handed you a build record.** No installable package contains the behaviour under test yet (checked 2026-11-17): the old preview `native/installer/UltimateKeyboards-0.3.0.pkg` was built 2026-11-09, before the default MacBook profile (`f76a777`), the home-row misfire guard (`6c6efea`) and combo-first-on-home-row (`056362d`), which sections 2 to 4 exercise. `/Volumes/Work/releases/ultimate-keyboards/` does not exist until KE-20 makes the release candidate.

The agent gives you, before you begin:

1. The package path and its SHA-256 (from the build's `.manifest.json`).
2. The source commit it was built from, which must contain `056362d`: `git merge-base --is-ancestor 056362d <commit>` exits 0. If it does not, the test is not ready.
3. Green tests on that commit (the agent runs them): `bun test`, and `cargo test -q` in `native/engine` and `native/service`.

Install it in Terminal with the path and hash from the record. The script refuses a package whose hash differs:

```sh
bash scripts/install-native-preview.sh <package.pkg> <sha256>
```

Then approve and enable: [native-remapping.md](../user/native-remapping.md), steps 1 to 5. Quit Karabiner-Elements first if it runs. Write the build's SHA-256 and commit at the top of your notes; each row is recorded against that build.

Open TextEdit, choose Format > Make Plain Text, and keep it open for sections 2 to 5.

## 1. Install and turn on (HANDS-1)

1. Install the package, approve the driver, approve Input Monitoring for **Ultimate Keyboards Remapper**.
2. This Mac > MacBook Keys > Remapping > **Apply and enable**.
3. Pass: the status says remapping is running, and you needed no step the app did not tell you. Note anything that took a retry.

## 2. Plain typing (HANDS-2)

Type this twice, fast, the way you normally type:

> The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. Sphinx of black quartz, judge my vow. Fall asleep, kids; all jokes aside, folks flee fast.

Pass: both copies are exactly right. Fail: any missing, doubled or swapped letter, or a stray shortcut firing. Note the word.

## 3. Home-row mods (HANDS-3)

In TextEdit:

| Do | Pass when |
| --- | --- |
| Type `hello`, hold **J**, tap **Z** | Cmd+Z undoes the typing |
| Type `abc`, press Cmd+A the normal way, hold **J**, tap **C**, press the right arrow, type a space, hold **J**, tap **V** | `abc` is copied then pasted: `abc abc` |
| Hold **D**, tap **H** | capital `H` |
| Tap **A S D F J K L ;** one at a time, slowly | `asdfjkl;`, no modifier effect |
| Type `sad fad lad` at normal speed | exactly `sad fad lad` |

Pass: every row. Note which failed.

## 4. Combos and ordinary words (HANDS-4)

| Do | Pass when |
| --- | --- |
| Press **K** and **L** together | new line (Enter) |
| Type `abc`, press **I** and **O** together | the `c` is deleted (Backspace) |
| Open Spotlight with Cmd+Space, type `x`, press **W** and **E** together | Spotlight closes (Escape) |
| Type `like kill polio were write low` at normal speed | exactly those words, no Enter, Backspace or Escape fired |

Pass: every row. Note the combo or word that misfired.

## 5. Everything else on the keys (HANDS-5)

- Shift + a letter gives a capital. Both Shift keys.
- Caps Lock turns on and off, and the light follows.
- Cmd+Tab switches app. Cmd+Space opens Spotlight.
- Volume up/down, mute, brightness up/down work from the Fn row, with and without holding Fn.

Pass: each does its normal job. Note any that did nothing.

## 6. Password field (HANDS-6)

Secure Input must not stop the mappings from passing real characters. In Terminal, run `read -s x; echo ${#x}`, then type `fjdkslaghjklqweruio` (19 characters) and press Return. Pass: it prints `19`. Note the number.

## 7. Stop, restart, external keyboard (HANDS-7)

1. Remapping > **Stop remapping**. Type `kl` quickly, then hold **F** and tap **N**: plain letters, no Enter, no shortcut.
2. **Apply and enable**. K+L gives Enter again.
3. Plug in an external keyboard (required for this row): its keys type plainly and the combos do not fire on it. If none is at hand, record the row as blocked, not pass.

Pass: stop is immediate and complete, enable brings it back, and the external keyboard is unchanged. Note what each key did and which external keyboard you used.

## 8. Sleep and wake (HANDS-8)

By design the helper stops capture on sleep and does not turn itself back on: the status reads "Sleep or event-loop interruption detected; physical keyboards released. Enable again to resume." (`docs/user/native-remapping.md`, step 6). This section checks that this happens cleanly and that enabling again works.

1. With remapping on, close the lid for 10 seconds. Open it and unlock.
2. Without touching the app, type `like` then K+L. Pass: plain letters `like` and `kl` (no Enter): the keyboard is released, not stuck or half-mapped.
3. Open the app: the status says stopped and says to enable again. Press **Apply and enable**, then type `like` then K+L: letters, then Enter.
4. Close the app window (the app stays in the menu bar) and repeat steps 1 and 2, then open the app from the menu bar and repeat step 3.

Pass: after each wake the keys are plain, the status says stopped and what to press, and Apply and enable brings the mappings back. Fail: mappings half-applied, keys stuck, a status that still says running while the keys are plain, or Apply and enable not restoring them. Note the first key that worked after wake and the exact status text.

## 9. Log out, log in, restart (HANDS-9)

1. Log out and back in. Without touching the app, type `like` then K+L, then open the app and read the status.
2. Restart the Mac, log in and do the same.

Pass: the status is honest in both cases. Either remapping returns by itself, or the app says what to press and pressing it works. Note which happened.

## After the test

Report the sections that failed with the notes. Fixes for failures become bug rows (`af verify add --from-bug`) before the fix. Passing rows carry the build hash they were typed on.
