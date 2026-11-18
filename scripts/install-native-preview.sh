#!/bin/bash
# Run interactively in Terminal. macOS approvals remain user actions.
set -euo pipefail

# Usage: install-native-preview.sh <package.pkg> <expected-sha256>
# The hash comes from the build record (the package's .manifest.json); it is never pinned here.
if [[ $# -ne 2 || ! "$2" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'Usage: install-native-preview.sh <package.pkg> <expected-sha256 from the build record>' >&2
  exit 2
fi
uk_package="$1"
uk_expected_sha="$2"

if [[ ! -f "$uk_package" ]]; then
  echo "Installer not found: $uk_package" >&2
  exit 1
fi

uk_digest="$(/usr/bin/shasum -a 256 "$uk_package")"
if [[ "${uk_digest%% *}" != "$uk_expected_sha" ]]; then
  echo 'The installer differs from the build record. Installation stopped.' >&2
  exit 1
fi

if /usr/bin/pgrep -f '[U]ltimate Keyboards[.]app/Contents/MacOS/ultimate-keyboards' >/dev/null; then
  echo 'Save your edits and quit Ultimate Keyboards with Command-Q, then run this again.' >&2
  exit 1
fi

sudo /usr/sbin/installer -pkg "$uk_package" -target /

uk_helper_bundle='/Library/Application Support/com.ultimatekeyboards.app/Native/Ultimate Keyboards Remapper.app'
uk_helper='/Library/Application Support/com.ultimatekeyboards.app/Native/Ultimate Keyboards Remapper.app/Contents/MacOS/ultimate-keyboards-remapper'
/usr/sbin/pkgutil --pkg-info com.ultimatekeyboards.application
/usr/sbin/pkgutil --pkg-info com.ultimatekeyboards.native-helper
/usr/bin/codesign --verify --deep --strict \
  -R='identifier "com.ultimatekeyboards.app" and anchor apple generic and certificate leaf[subject.OU] = "9878YL387T"' \
  '/Applications/Ultimate Keyboards.app'
/usr/bin/codesign --verify --deep --strict \
  -R='identifier "com.ultimatekeyboards.remapper" and anchor apple generic and certificate leaf[subject.OU] = "9878YL387T"' \
  "$uk_helper_bundle"
/bin/launchctl print system/com.ultimatekeyboards.remapper >/dev/null
"$uk_helper" --self-test

/usr/bin/open -n -g "$uk_helper_bundle" --args --request-permission
/usr/bin/open -a '/Applications/Ultimate Keyboards.app'
/usr/bin/open 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'

echo 'Installer completed. Enable Ultimate Keyboards Remapper in Input Monitoring.'
echo 'Then open MacBook Keys > Remapping and choose Check status to refresh the helper permission.'
echo 'Leave native remapping stopped until the live checks are ready.'
