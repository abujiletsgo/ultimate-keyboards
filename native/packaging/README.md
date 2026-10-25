# Native setup packaging

`scripts/build-native-installer.py` builds and inspects an installer. It never
installs it, registers jobs, opens the driver Manager, captures keyboards, or
injects input. Python uses only the standard library; building additionally
requires Rust, Xcode command-line tools, macOS `codesign`, `pkgbuild`,
`productbuild`, `pkgutil`, `installer`, and the populated `native/vendor` headers.

Development, with a real local signing identity:

```sh
python3 scripts/build-native-installer.py --development \
  --identity 'Apple Development: YOUR CERTIFICATE NAME' --team-id YOURTEAMID
```

An explicitly requested `--development --identity -` is permitted for package
inspection; an ad-hoc helper cannot satisfy the production peer-signature
contract. Without a Team ID compiled in, the helper refuses privileged IPC.
The outer development installer is unsigned unless `--installer-identity` is
supplied, and it is not notarized. Its title and welcome disclose this status.

Production:

```sh
python3 scripts/build-native-installer.py \
  --identity 'Developer ID Application: ORGANIZATION (TEAMID)' \
  --team-id YOURTEAMID \
  --installer-identity 'Developer ID Installer: ORGANIZATION (TEAMID)' \
  --notary-profile YOUR_NOTARYTOOL_KEYCHAIN_PROFILE
```

Production fails without distribution certificates, a Team ID, or notarization
credentials. It signs the helper with hardened runtime, signs the helper and
outer packages, submits the outer package to Apple's notary service, staples
the result, and verifies the artifact. Credential secrets are never arguments;
`--notary-profile` refers to an existing Keychain profile.

`--no-build [--helper /absolute/path/to/existing/binary]` packages an existing
helper. The caller must ensure it was compiled with the same `UK_TEAM_ID`; no
placeholder is generated. Default builds set `UK_TEAM_ID` explicitly and ignore
an ambient `CARGO_TARGET_DIR` so the selected artifact is unambiguous.
`--driver-package PATH` accepts only the pinned upstream SHA-256. Otherwise the
script first reuses the research checkout package and then downloads the exact
immutable GitHub commit URL. All package-building work uses a temporary staging
directory, and the output replaces the prior artifact only after verification.
Signing timestamps and Apple notarization mean identical binary bytes are not
promised; dependency pins, build steps, and verification are reproducible.

Output:

- `native/installer/UltimateKeyboards-Native-Setup.pkg`
- Adjacent `.manifest.json`: hashes, identities, inventories, permissions,
  signature evidence, and current-machine driver choice.
- Adjacent `.choices.xml`: actual `installer -showChoicesXML` output.

## Combined application installer

Use an already signed application to produce one installer containing the app,
helper, and conditional standalone driver component:

```sh
python3 scripts/build-native-installer.py --no-build --development \
  --application 'src-tauri/target/release/bundle/macos/Ultimate Keyboards.app' \
  --identity 'Apple Development: YOUR CERTIFICATE NAME' --team-id YOURTEAMID
```

`--application` (alias `--app`) changes the default output to
`native/installer/UltimateKeyboards-<package.json version>.pkg`. It cannot
overwrite the native repair package or write inside the signed source app.
`--no-build` uses the existing compiled helper; it does not rebuild either source
binary. The app is copied intact into an `/Applications/Ultimate Keyboards.app`
component, with root:wheel ownership and bundle relocation disabled. The builder
does not re-sign or edit the source app.

Before staging, the builder rejects symlink apps/members, non-Mach-O executables,
wrong bundle IDs, mismatched versions, unsigned/ad-hoc apps, and foreign Team
IDs. Both app and helper must satisfy the same explicit Team ID. Production also
requires the supplied app to already have a Developer ID Application signature.
All app file hashes, including its executable, sealed signature resources, and
embedded native repair package, must remain identical after copying and package
extraction. These hashes are recorded in the package and adjacent manifest.

When the local native repair package exists, its hash must match the one inside
the supplied app. If native packaging changes, first rebuild the native-only
repair installer, then re-embed it and re-sign the app through the normal app
build workflow. The combined builder rejects stale embedded repair resources.
It does not silently modify the input app to make them match.

The app choice is required, alongside the helper. Existing driver compatibility
selection is unchanged. A separate `pkg-ref/must-close/app` element asks Installer
to require the running app to close before replacement; no script force-quits
the main app. Apple's [Distribution XML reference](https://developer.apple.com/library/archive/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html)
specifies this form and requires `require-scripts=true` for JavaScript choice
expressions. `allow-external-scripts=false` remains explicit; compatibility code
reads Installer-provided filesystem APIs without arbitrary external execution.

`--verify PATH` detects combined packages automatically and verifies the app
signature, exact file hashes, must-close rule, non-relocating component, root
ownership, payload inventory, and real app/helper/driver choices. Supply
`--application PATH` alongside `--verify PATH` to additionally compare against
the current signed source app. The native-only verification mode remains
available. The light-mode welcome explains app installation, background login
launch, user-controlled app closure, and the remaining macOS approval steps.

Verify without building or installing:

```sh
python3 scripts/build-native-installer.py --development --team-id YOURTEAMID --verify
python3 -m unittest discover -s native/packaging/tests -v
```

The verifier checks the original driver provenance archive's exact hash, pqrs
Team ID `G43BCU2T37`, trusted notarization, helper signature/bundle identity,
expected payload, root:wheel ownership, state mode 0700, and real Installer
choices. It also checks PackageKit component topology and calls the local
PackageKit parser to create actual package objects and initialize an in-memory
request. Every expected component ID, version, and count must match. Production
verification also validates the outer installer signature and staple.

## Install lifecycle

The helper lives at `/Library/Application Support/com.ultimatekeyboards.app/Native/Ultimate Keyboards Remapper.app`.
It reuses `src-tauri/icons/icon.icns` through `CFBundleIconFile`; the icon is
copied before signing, and verification checks the resolved resource's exact
bytes against that existing brand asset as well as the helper's resource seal.
Its LaunchDaemon is `com.ultimatekeyboards.remapper`; native state is root-owned
0700. The app login LaunchAgent starts `/Applications/Ultimate Keyboards.app`
with `--native-background` once per Aqua login and does not force it to restart
after the user quits. These launch plists associate with `com.ultimatekeyboards.app`.

The helper starts idle. Driver activation through the signed upstream Manager,
Input Monitoring permission, and explicit app enable remain separate steps.
Installation alone does not prove capture/output works. Previously enabled
saved state is subject to the service's authenticated app heartbeat/session
rules; installing the package never sends an enable request.

Installer JavaScript reads the installed broker Info.plist. Versions 8.5.0 and
8.6.0 share protocol 7 and deselect the bundled driver component. Unknown or
partial installations stop setup. The helper preinstall also verifies the exact
broker bundle identity and pqrs signature before reuse.

The final archive is the canonical output of `productbuild`: package references
target expanded component directories containing `PackageInfo`, `Bom`,
`Payload`, and optional `Scripts`. The builder never replaces them with opaque
flat packages and never re-flattens the product. The original signed upstream
archive is preserved separately in the signed helper's
`Contents/Resources/Provenance/Karabiner-DriverKit-VirtualHIDDevice-8.6.0.pkg`.
Its archive signature, notarization, and exact pinned SHA are verified. Every
file in the executed driver component is compared byte-for-byte against the
contents of that archive; the extracted Manager, Daemon, and dext code
signatures are independently verified. Thus the upstream executable signatures,
scripts, and payload remain intact even though the product container uses the
normal component layout. The outer production signature protects that layout,
as described by the local Apple `productbuild(1)` manual.

The distribution declares `hostArchitectures=arm64`, matching the application
and helper checked with `lipo -verify_arch`. This avoids implicit Rosetta
evaluation documented in `productbuild(1)`.

### Regression caught after an actual failed install

The earlier custom layout put flat `.pkg` files inside the outer XAR as package
reference targets. `installer -pkginfo` and `-showChoicesXML` accepted its
metadata, but the actual 2026-10-24 install failed with `PKInstallRequest` error 2
and “not supported by PK” before software installation. Those metadata checks
were insufficient evidence of installability. The layout has been removed.

`packagekit-preflight.m` is a local diagnostic using runtime-checked private
PackageKit selectors. It requires nonnil `PKPackage.packageWithURL` results and
then nonnil `PKInstallRequest` initialization; `canInitWithURL` alone is
insufficient. It never obtains authorization, creates an install session,
submits a request, invokes staging/preflight operations, or starts installation.
An unavailable parser API fails verification rather than weakening the check.
The real macOS regression test creates a canonical package and a deliberately
malformed nested-flat variant: metadata accepts the latter, but PackageKit must
reject it while admitting the canonical one. This proves parser admission only;
privileged script execution, permissions, and installation still require an
actual user-authorized installation test.

The bundled upstream broker has no process lock and its socket implementation
unlinks the prior path before binding. Our launcher never invokes it directly:
it reuses the canonical upstream launchd label, exits if that label or an
existing broker process is present, then performs atomic bootstrap. It never
kickstarts, boots out, kills, or replaces the shared broker. A periodic check
allows a clean-machine driver installation to finish after the helper component.
Unrelated software that starts the broker outside the canonical job concurrently
cannot be synchronized by our launcher; that unsupported coordination remains
a live integration concern.

`uninstall.sh` is an explicitly invoked admin action. It removes our two daemon
registrations, login plist, helper, native state, and helper receipt. It leaves
the shared broker registered, the shared driver/Manager installed, and the
user's frontend rules intact. It does not quit the main app or reset system
permission/background-item databases.

Tests exercise Installer JavaScript, compatibility, stage layout/modes, signing
guards, shell syntax/no-shared-restart constraints, canonical topology, exact
parser identity/version/count checks, and actual PackageKit acceptance/rejection
of the regression fixtures. No install, launch, dext activation, TCC grant, or
physical-keyboard test is part of these checks.
