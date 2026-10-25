#!/bin/bash
# Explicit native-only uninstall. App, personal rules, and shared pqrs components stay.
set -eu
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

# Return 1 only for the known absent-job response; inspection failures are not absence.
uk_uninstall_job_exists() {
  local target=$1 output result
  if output=$(launchctl print "$target" 2>&1); then
    return 0
  else
    result=$?
    if [ "$result" -eq 113 ] && [[ "$output" == *"Could not find service \"${target#*/}\" in domain for system"* ]]; then
      return 1
    fi
    printf 'Cannot inspect %s (launchctl exit %s): %s\n' "$target" "$result" "$output" >&2
    return 2
  fi
}
uk_uninstall_pause() { sleep 0.1; }
uk_uninstall_stop_job() {
  local target=$1 timeout=$2 result deadline
  if uk_uninstall_job_exists "$target"; then
    if launchctl bootout "$target"; then :; else
      result=$?
      printf 'Shutdown of %s failed (launchctl exit %s); native files preserved.\n' "$target" "$result" >&2
      return 21
    fi
  else
    result=$?
    [ "$result" -eq 1 ] && return 0
    return 20
  fi
  deadline=$((SECONDS + timeout))
  while :; do
    if uk_uninstall_job_exists "$target"; then
      if [ "$SECONDS" -ge "$deadline" ]; then
        printf 'Timed out waiting for %s removal; native files preserved.\n' "$target" >&2
        return 22
      fi
      uk_uninstall_pause
    else
      result=$?
      [ "$result" -eq 1 ] && return 0
      return 20
    fi
  done
}
uk_uninstall_native() {
  [ "$#" -eq 0 ] || { echo 'Usage: uninstall.sh (native components only; app and personal rules are preserved).' >&2; return 2; }
  [ "$(id -u)" = 0 ] || { echo 'Run this uninstaller as an administrator.' >&2; return 1; }
  # Observe completed removal of BOTH own jobs before deleting ANY payload files.
  uk_uninstall_stop_job system/com.ultimatekeyboards.remapper 20 || return $?
  uk_uninstall_stop_job system/com.ultimatekeyboards.virtual-hid-launcher 20 || return $?
  rm -f '/Library/LaunchDaemons/com.ultimatekeyboards.remapper.plist' \
    '/Library/LaunchDaemons/com.ultimatekeyboards.virtual-hid-launcher.plist' \
    '/Library/LaunchAgents/com.ultimatekeyboards.app.plist' || return $?
  # Never stop/remove the canonical shared broker, its driver, or its Manager.
  # Runtime state is ours; the main application and its personal rules stay.
  rm -rf '/Library/Application Support/com.ultimatekeyboards.app/Native' || return $?
  if pkgutil --forget com.ultimatekeyboards.native-helper >/dev/null 2>&1; then :; else
    echo 'Native files removed; no helper package receipt was forgotten.' >&2
  fi
  echo 'Ultimate Keyboards native components removed. App, personal rules, and shared driver preserved.'
}
# Sourcing defines functions only, for isolated tests. Executing uses fixed paths.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  uk_uninstall_native "$@"
fi
