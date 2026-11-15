# Phase 0 spike findings (2026-11-15, iOS 26.4 Simulator)

All results are from the Simulator, which shares the Mac's network stack: it cannot show Local Network privacy, AWDL, real extension lifecycle or Wi-Fi latency.

| Question | Result | Evidence |
|---|---|---|
| Extension discovers the Mac (NWBrowser) and connects (NWConnection) | **Yes** in the Simulator: found "UK Spike Mac", reached `ready`, inserted frames | evidence/02, 03, 05; extension-oslog.txt |
| Local Network prompt for the extension; must the app ask first? | **Unanswered**: no prompt in the Simulator (Full Access on or off) | needs a real iPhone |
| Full Access off blocks networking? | Simulator: no difference. Apple documents it does; **verify on device** | — |
| Hide/show keyboard | Controller is destroyed and recreated each time; new instance re-browses and reconnects in < 1 s; a frame sent while hidden arrived 1155 ms late (seq 58) | extension-oslog.txt |
| Latency (median of 50, loopback) | 0.485 ms (min 0.26, max 2.15): code path only, not Wi-Fi | sender.log |
| insertText / deleteBackward / adjustTextPosition(-3) / setMarkedText + unmarkText | **All work** (checked via documentContextBeforeInput); marked 한→하 replaced, unmark committed | extension-oslog.txt |
| Mac CLI listener on all interfaces | `newConnectionHandler` never fired for the extension, though netstat showed ESTABLISHED; loopback `nc` did fire. Likely macOS Local Network privacy for a CLI from a sandboxed shell (unconfirmed). Workaround `--loopback` worked | sender.log |
| Enabling the keyboard in the Simulator | `defaults write .GlobalPreferences AppleKeyboards -array world.hyly.keyboards.spike.keyboard en_US@sw=QWERTY\;hw=Automatic` + reboot; Full Access needed the Settings UI | evidence/04 |

## Design consequences
- The extension must reconnect on every `viewWillAppear` and the Mac must not send while no extension is attached (pill: "Open a text field on the iPhone"); never queue keys for later delivery.
- The Mac app (not a CLI) must declare Local Network use and be checked for incoming-connection permission.

## Needs a real iPhone (~10 minutes, before Phase 2)
Local Network prompt and which target owns it; Full Access gating; peer-to-peer/AWDL with no shared Wi-Fi; extension suspension while visible; real Wi-Fi latency.

## Gotchas
`simctl io screenshot` wrote only to /tmp; coordinate clicks via orca computer were unreliable (element-index clicks via ukclick.sh worked); the Simulator window can drop out of the window list until `open -a Simulator`; dismiss the first-run swipe-keyboard sheet.
