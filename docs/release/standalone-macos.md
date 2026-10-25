# Standalone macOS product

The customer installs Ultimate Keyboards once, approves macOS access, and edits and runs the supported mappings in the app. They do not install Karabiner-Elements, Homebrew, Rust, Bun, or a separately downloaded keyboard driver for MacBook remapping. Installation, recovery, updates and removal must be understandable without Terminal.

This is the release contract, not a claim that the development preview has passed customer acceptance. Current scope is Apple silicon running macOS 13 or later. Native capture targets the built-in keyboard. Fn/Touch ID remapping and arbitrary firmware behaviors are not supported native features.

## Included components

The product contains the main app, Ultimate Keyboards Remapper, and the pinned standalone pqrs virtual keyboard driver, daemon and activation Manager. The native engine has no runtime dependency on the Karabiner-Elements application, its grabber, or its CoreService. The pqrs client headers are compiled into our service; its dynamic libraries are Apple/system libraries.

Bundling an upstream component is compatible with a standalone product. Its original signing identity remains visible in system approval: **Fumihiko Takayama (pqrs.org)**, Team `G43BCU2T37`. Do not rename or re-sign the upstream driver or hide this approval identity. Customers approve **Ultimate Keyboards Remapper** for Input Monitoring. These system approvals cannot be performed silently by our installer.

The pinned upstream [license](https://github.com/pqrs-org/Karabiner-DriverKit-VirtualHIDDevice/blob/9036bc771259ff8d61341f4d1b7072b954fdb2fa/LICENSE.md) expressly permits commercial redistribution. The upstream, Boost and MIT notices are retained by the native packager. A complete inventory of Rust, frontend, font, layout and icon licensing remains a release task; this component check does not clear the whole product.

## Implemented in this iteration

- First launch offers a MacBook setup entry alongside external keyboards.
- Setup names the helper and driver publisher, distinguishes installation from repair, and gives an action for an empty keymap. Existing service files with no endpoint report an unavailable installed service rather than a new installation.
- Native releases use the complete installer for updates, keeping app and helper together. The app-only updater is not used across the native-release boundary.
- Signed helper inputs report their compiled trust Team ID through a pure `--build-info` mode. Packaging verifies it instead of assuming the build environment matched the certificate.
- Production verification requires distribution signatures, hardened runtime, timestamps, macOS 13 minimum, exact lifecycle scripts, and a valid embedded production repair package. Custom output paths do not accidentally compare against the development preview.
- The checked-in delivery builder signs, notarizes and verifies the DMG, checks its read-only mounted contents and package digest, and cleans up the mount. Failed candidates do not replace a verified output.
- Native removal waits for both owned background jobs to disappear before deleting files. It preserves the app, personal rules and shared driver. A complete customer-facing removal flow is still pending.

## Build a commercial candidate

Only Apple Development and local development signing identities were available during this work. A public customer release needs **Developer ID Application**, **Developer ID Installer**, their actual Team ID, and notarization credentials. Development signing is not a substitute. See Apple's [distribution packaging](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution) and [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

The following commands are maintainer operations. They are not customer setup instructions. Keep credentials in Keychain; never put passwords or signing keys in the repository or this document.

Read-only prerequisite report:

```bash
python3 scripts/build-commercial-release.py --preflight \
  --identity 'Developer ID Application: YOUR NAME (TEAMID)' \
  --installer-identity 'Developer ID Installer: YOUR NAME (TEAMID)' \
  --team-id YOURTEAMID \
  --notary-profile YOUR_KEYCHAIN_PROFILE
```

After those credentials are installed, build and submit a candidate to Apple's notary service:

```bash
python3 scripts/build-commercial-release.py --build \
  --identity 'Developer ID Application: YOUR NAME (TEAMID)' \
  --installer-identity 'Developer ID Installer: YOUR NAME (TEAMID)' \
  --team-id YOURTEAMID \
  --notary-profile YOUR_KEYCHAIN_PROFILE \
  --output /Volumes/Work/projects/hardware-mac/ultimate-keyboards/native/release/0.3.0-candidate-1
```

The wrapper runs deterministic checks, builds the helper with its compiled trust Team ID, creates the signed/notarized repair package, embeds that exact package into the signed app, builds the complete signed/notarized installer, then creates and verifies the signed/notarized delivery DMG. It isolates build products from the last delivered development preview. Use a new empty output directory for each candidate. It never installs, enables keyboard capture, pushes a tag, or publishes a release.

The prerequisite report does not authenticate the notarization profile. Its validity is established by Apple's response during the build. Passing signing and packaging checks produces a **candidate**, not verified customer readiness. The old automatic publication workflow remains blocked for native releases until full-product acceptance is complete.

## Customer acceptance still required

Use a separate clean Mac with no Karabiner-Elements installation, no development tools and no inherited input permissions. Download the candidate through the normal customer channel so quarantine and Gatekeeper behavior are exercised. Record the OS/build, hardware, candidate SHA-256, outcome and evidence for each case.

| Case | Passing result | Current evidence |
|---|---|---|
| Clean install | One DMG and Installer transaction installs every required component; no Terminal or external download | PackageKit parsing and component admission verified; clean installation pending |
| Approvals | Exact helper and driver names match the in-app instructions; denied or delayed approval preserves ordinary typing | Browser state fixtures and passive permission checks; clean-device approval pending |
| Native mappings | Simple remap, home-row tap/hold, combos, dedicated layer, dual-role layer and Layer 1 V → + work physically | Engine/unit and disabled compiled IPC tests; hardware output pending |
| Timing | Layer chords and rolling taps behave as documented; physical latency measured on supported hardware | Deterministic engine and scheduling tests; physical measurements pending |
| Stop and recovery | Stop/quit/crash/lease expiry, permission loss, sleep/wake and driver loss release capture without stuck modifiers | Deterministic safety tests; physical recovery matrix pending |
| Offline operation | Installed mappings work offline; bundled repair requires no network fetch | Architecture supports this; clean offline acceptance pending |
| Complete update | Previous customer version upgrades app/helper together and preserves rules; cancelled installation is recoverable | Installer update race regression passes; real version-to-version acceptance pending |
| Karabiner migration | Elements can be absent; removing Elements does not leave our product broken after repair | No Elements runtime dependency; actual migration/repair acceptance pending |
| Removal | Customer can remove our app and background jobs without Terminal, losing personal rules or breaking another product's shared driver | Native-only shell removal hardened; complete GUI removal and shared ownership policy pending |
| External keyboard firmware | Advertised build/flash workflows work through supported in-app authentication without a separate CLI | Existing workflows still require GitHub CLI and external git operations |
| Notices | Every distributed dependency and asset has the required attribution/license notices | Native upstream notices included; complete product inventory pending |

GitHub firmware builds are a separate remaining dependency gap. The existing `gh` login and external git workflow must be replaced by in-app authentication/API operations, or explicitly excluded from the standalone launch scope. Do not describe the entire product as free of customer-installed tools while those advertised features depend on them.

The initial update policy uses the complete installer. Tauri's ordinary macOS update artifact contains the [app bundle](https://v2.tauri.app/plugin/updater/), so it cannot alone establish that the root helper was upgraded. A future automatic updater must verify and install the complete product transaction, preserve personal rules, and obtain normal administrator authorization.

## Evidence for this iteration

- Existing task and acceptance ledger: `docs/plan/2026-10-23-native-remapping.json`.
- Actual installer race diagnosis: `.qa/native-bootstrap-failure/diagnosis.md`.
- Disabled compiled Layer 1 plus profile acceptance: `.qa/native-plus-ipc/result.json`.
- Commercial prerequisite report: `.qa/commercial-release-preflight.json`.
- Packaging/delivery tests and isolated development smoke: `.qa/commercial-release/`.

Installed development previews remain separate from these source changes. No public release, Karabiner uninstall, new permission approval, or real capture was performed by this release-hardening work.
