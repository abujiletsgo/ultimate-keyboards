/** Native releases must update the app and privileged keyboard components together. */
export const COMPLETE_INSTALLER_RELEASES_URL = 'https://github.com/abujiletsgo/ultimate-keyboards/releases/latest'
export function requiresCompleteInstaller(version: string): boolean {
  const parsed = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version)
  if (!parsed) return true // Unknown versions must never take the app-only path.
  return Number(parsed[1]) > 0 || Number(parsed[2]) >= 3
}
export function appOnlyUpdateAllowed(current: string, target: string): boolean {
  return !requiresCompleteInstaller(current) && !requiresCompleteInstaller(target)
}
