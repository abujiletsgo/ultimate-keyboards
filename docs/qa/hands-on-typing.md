# Hands-on typing test: MacBook remapping

For Tom, on his own MacBook. About 20 minutes. It checks what the tests cannot: real keys, real timing, real sleep. Each section matches one row in `verify/checks.yaml` (HANDS-1 to HANDS-9). After each section, tell the agent pass or fail, plus the note asked for. The agent records the rows with `af verify record --target macbook`.

Use the default MacBook profile: home-row mods (A=Ctrl, S=Option, D=Shift, F=Cmd, J=Cmd, K=Shift, L=Option, ;=Ctrl) and the combos K+L = Enter, I+O = Backspace, W+E = Escape. Type only test text in this list, never real messages or passwords.

## 0. Get the build

The test needs the complete native package (app, helper and driver in one installer) from the release candidate:

- Where: `/Volumes/Work/releases/ultimate-keyboards/<version>/` (made by KE-20). Until that exists, the development preview is `native/installer/UltimateKeyboards-0.3.0.pkg`, installed by `scripts/install-native-preview.sh` in Terminal.
- Tests that must be green before you start (the agent runs them): `bun test`, `cargo test -q` in `native/engine` and `native/service`.
- Install, approve and enable: [native-remapping.md](../user/native-remapping.md), steps 1 to 5. Quit Karabiner-Elements first if it runs.
- Open TextEdit, choose Format > Make Plain Text, and keep it open for sections 2 to 5.

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
3. If an external keyboard is at hand, plug it in: its keys type plainly and the combos do not fire on it.

Pass: stop is immediate and complete, and enable brings it back. Note what each key did.

## 8. Sleep and wake (HANDS-8)

1. With remapping on, close the lid for 10 seconds. Open it and unlock.
2. Without opening the app, type `like` then K+L. Pass: letters, then Enter.
3. Open the app: the status still says running. Note the first key that worked after wake.
4. Close the app window (the app stays in the menu bar) and repeat steps 1 and 2.

## 9. Log out, log in, restart (HANDS-9)

1. Log out and back in. Without touching the app, type `like` then K+L, then open the app and read the status.
2. Restart the Mac, log in and do the same.

Pass: the status is honest in both cases. Either remapping returns by itself, or the app says what to press and pressing it works. Note which happened.

## After the test

Report the sections that failed with the notes. Fixes for failures become bug rows (`af verify add --from-bug`) before the fix. Passing rows carry the build hash they were typed on.
