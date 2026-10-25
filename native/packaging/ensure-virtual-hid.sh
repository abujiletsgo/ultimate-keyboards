#!/bin/bash
# Bootstrap only the canonical upstream label. Never restart a shared broker.
set -eu
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
label='org.pqrs.service.daemon.Karabiner-VirtualHIDDevice-Daemon'
daemon='/Library/Application Support/org.pqrs/Karabiner-DriverKit-VirtualHIDDevice/Applications/Karabiner-VirtualHIDDevice-Daemon.app'
if launchctl print "system/$label" >/dev/null 2>&1; then exit 0; fi
# Also preserve brokers managed outside the canonical launchd job.
if pgrep -f '^/Library/Application Support/org[.]pqrs/Karabiner-DriverKit-VirtualHIDDevice/Applications/Karabiner-VirtualHIDDevice-Daemon[.]app/Contents/MacOS/Karabiner-VirtualHIDDevice-Daemon($| )' >/dev/null; then exit 0; fi
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$daemon/Contents/Info.plist")
case "$version" in 8.5.0|8.6.0) ;; *) echo 'Unknown shared driver version; refusing to launch.' >&2; exit 1;; esac
codesign --verify --strict --deep -R='anchor apple generic and certificate leaf[subject.OU] = "G43BCU2T37" and identifier "org.pqrs.Karabiner-VirtualHIDDevice-Daemon"' "$daemon"
# launchd label registration is atomic; a competing canonical registration wins
# without either job being stopped. Upstream has no separate process lock.
if ! launchctl bootstrap system '/Library/Application Support/com.ultimatekeyboards.app/Native/virtual-hid-daemon.plist'; then
  launchctl print "system/$label" >/dev/null 2>&1 || exit 1
fi
