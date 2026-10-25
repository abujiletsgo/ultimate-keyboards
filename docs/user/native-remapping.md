# Native MacBook remapping preview

Ultimate Keyboards 0.3 owns its mapping engine and background service. The complete native build bundles the unmodified, signed standalone pqrs virtual-keyboard driver; it does not require the Karabiner-Elements application. This preview needs macOS 13 or later on Apple silicon. The app's other features retain their existing platform support.

## Install and enable

1. Open the complete native-installer DMG and double-click **Install Ultimate Keyboards.pkg**. This single installer places the application and helper together, requests administrator authorization, and registers the app to run in the background at login. It reuses a compatible shared driver already installed on the Mac. Follow the request to close any running copy of the app; the installer does not force it to quit.
2. Open **Ultimate Keyboards → This Mac → MacBook Keys**. **Keymap** is the shared editing workspace; **Remapping** contains native setup and activation. **Install native components** remains available there for repairs; it is not a second required installation step after the combined installer.
3. In **Remapping**, choose **Activate keyboard driver** and follow macOS's driver-extension approval prompts. If macOS requests a restart, complete it before proceeding.
4. Use **Input Monitoring** to open the helper through macOS LaunchServices and request access under **Ultimate Keyboards Remapper**. Approve that entry in System Settings, then choose **Check status**. This explicit check can restart our background helper to refresh permission state; it leaves remapping stopped. Accessibility for the separate scroll engine does not establish this permission.
5. Edit the **Keymap**, then **Save** the profile. In **Remapping**, choose **Apply and enable**; this also saves the submitted profile. The helper checks driver readiness before capturing the built-in keyboard. A failed handshake leaves ordinary keyboard input available.
6. Use **Stop remapping** to release capture. It is available in **Remapping** and stays in the Keymap toolbar while remapping is running or its status is uncertain. Closing the window keeps the app in the menu bar; quitting the app stops remapping. After sleep or a recovery stop, explicitly enable again.

Existing Karabiner users should stop their overlapping mappings before enabling native capture. The installer never stops or upgrades a compatible shared pqrs broker. Unknown or incomplete shared driver installations block setup with an explanation. Removing our helper leaves the shared driver and personal rule files intact.

The MacBook **Keymap** uses the same binding editor, searchable picker, toolbar, layer controls and key styles as the split-keyboard editor. Select **Base** or a named layer, click a key, choose its binding type and parameters, then use the popup's **Apply** to update the local keymap. This does not start remapping. Available binding types depend on the keyboard's capabilities. Dashed keys inherit Base; selecting a layer only changes the preview. Use **Ordered rules** to inspect mappings and priority conflicts.

To put **+** at the physical **V** position on Layer 1, select that layer, click V, choose **Key**, and search for **+** or **plus**. Select **+ · plus**, then **Apply** and **Save**. The US ANSI symbol choice emits `equal_sign` with Shift; the keypad's `keypad_plus` is a separate choice. Other shifted symbols, such as `!`, `?` and `{`, are searchable too. These choices depend on the active macOS input layout. Shifted symbol choices are available for **Key** bindings; tap actions currently accept a single keycode.

Use **+ Layer**, **Rename**, **Delete**, **Undo/Redo**, **Save** and **Revert** as in the split-keyboard editor. A layer with an activating key cannot be deleted until that reference is removed. Working drafts are retained locally for crash recovery; **Save** commits the profile and **Revert** restores that saved version. Existing profiles become the initial saved baseline. Local editing, saving, history and layer operations do not change the running remapper. **Apply and enable** in **Remapping** is the separate system-wide activation action.

## What is implemented

The native engine accepts the editor's existing simple remaps, combos, layer activators/bindings, and home-row mods. Profiles are full snapshots; edits take effect on the next explicit apply. The tap/hold fallback and combo window default to 150/50 ms. The UI distinguishes configured rules from the last snapshot submitted in the current app session; it does not claim that a matching title proves identical live contents.

Layer-only keys activate on key-down and deactivate on release. A layer key with a tap action offers three native timing choices:

| Timing | When the hold becomes a layer |
| --- | --- |
| Balanced | Another key is pressed and released while the layer key stays held, or the hold fallback expires. |
| Fast chord | Another key is pressed while the layer key stays held, or the hold fallback expires. |
| Timed | The hold fallback expires. |

Balanced is the default, including saved rules without an explicit timing choice. Releasing the layer key first preserves rolling taps. Fast chord prioritizes immediate layer chords and may activate the layer when you intended overlapping taps. Choose Timed to restore the previous timer-only behavior. Home-row modifiers keep their existing timing. A higher-priority combo can still delay a shared trigger while its chord is being resolved. These native timing choices do not change the optional Karabiner compatibility export's original timing.

While remapping is active, the helper waits for macOS input events and wakes to process them, bounded by the next engine deadline and a short safety interval. It no longer adds a fixed sleep after each active processing pass. Deterministic engine and synthetic event-wake tests verify those removed waits; physical end-to-end latency and equivalence to a particular keyboard still require live measurement.

Only the built-in keyboard is selected. External split keyboards are left alone. Fn and media inputs pass through when their device elements are supported; assigning Fn or unsupported media usages as mapping rules is rejected. Unknown mixed-input devices are excluded before capture. One exact Apple vendor-control report is outside the advertised keyboard-event stream; it is excluded only when the static descriptor and the actual Apple event driver's supported-usage contract match the verified hardware. Its private payload is not decoded, logged or forwarded. There is no event-tap fallback and no claim of exact Karabiner behavior equivalence.

The privileged helper accepts bounded configuration, status, disable, and own-service restart IPC. Mutations require the active console user's running application to satisfy the expected bundle identifier and Apple signing Team ID. Neither typed keys nor passwords are logged. A native app heartbeat, independent of hidden-window JavaScript timers, renews a 15-second lease. Driver/permission/session loss, stop, helper shutdown, or lease expiry releases capture. The helper also listens for system sleep notifications.

Permission setup uses a fresh helper app instance with its own bundle identity and the HID-specific listen-event APIs. Running a helper executable directly from Terminal can inherit Terminal's permission attribution, so its CLI preflight does not prove that the background helper has access. **Check status** performs the fresh bundle check and returns the background helper's status. Periodic polling never launches setup, restarts the service, or enables capture. An explicit restart affects only our helper and preserves the profile with remapping disabled; it never restarts the shared driver broker.

## Build locally

The source needs Bun, Rust and Xcode's C++23 toolchain. Dependency headers and their license notices are pinned under `native/vendor`; the upstream signed driver package is fetched by immutable commit and verified by SHA-256 and signature.

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
cargo test --locked --manifest-path native/engine/Cargo.toml
cargo test --locked --manifest-path native/service/Cargo.toml
```

Build the native setup first with `python3 scripts/build-native-installer.py --help`. For a local development build, supply the Apple Development signing identity and its actual Team ID with `--development`, `--identity` and `--team-id`. Ad-hoc setup packages are inspection artifacts: they cannot authenticate as an Apple-signed production app.

Then build the app with the native resource overlay:

```sh
bunx tauri build --config src-tauri/tauri.native.conf.json --bundles app,dmg
```

Sign the main application with the same Apple identity/Team ID as the helper, using Tauri's signing configuration. The overlay embeds `native/installer/UltimateKeyboards-Native-Setup.pkg` under the fixed app-resource path expected by the setup action. A normal build without the overlay deliberately reports that its native installer is absent.

Build the combined application/helper/driver product by passing the signed application to the same builder with `--application`. The application must have the expected identity, version and signing Team ID, and contain the current repair installer; a stale repair package is rejected. For a local development build:

```sh
python3 scripts/build-native-installer.py --development \
  --identity "$NATIVE_SIGNING_IDENTITY" --team-id "$NATIVE_SIGNING_TEAM" \
  --no-build --application 'src-tauri/target/release/bundle/macos/Ultimate Keyboards.app'
```

This produces `native/installer/UltimateKeyboards-0.3.0.pkg`. It installs the app, helper and driver components in one transaction, preserves the app's signed contents, disables app relocation, and requires the running app to close before replacement. Native-only setup remains a separate repair artifact. The combined product can be placed inside a DMG as a single **Install Ultimate Keyboards.pkg** file; verify the image and its mounted package digest before delivery.

Public distribution requires Developer ID Application and Installer certificates plus notarization. Development signatures and a signed upstream driver do not make our application or final package notarized. The legacy release workflow refuses to publish version 0.3+ without the native packaging pipeline; no release tag or public publication is part of this implementation task.

## Acceptance boundary

Unit and synthetic tests verify the engine, IPC limits and authorization rejection, readiness predicates, report encoding, profile lifecycle and installer inventory. Read-only helper preflight does not connect to output, seize devices or inject typing. These checks do not establish live remapping.

Complete acceptance on an installed, approved build must exercise physical capture → engine → virtual output, password/Secure Input behavior, modifiers and caps lock, Fn/media pass-through, real tap/chord timing, sleep/wake, logout/login, app/helper/driver crashes, permissions revoked, and uninstall. Inspect the actual desktop UI, including the 800×600 minimum window and keyboard navigation. Record each result separately; any unexecuted case remains pending.

Research and exact source pins: [implementation decision](../research/2026-10-23-native-remapping.md). Active ownership and verification: [task record](../plan/2026-10-23-native-remapping.json).
