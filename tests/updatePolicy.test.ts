import { expect, test } from 'bun:test'
import { requiresCompleteInstaller, appOnlyUpdateAllowed, COMPLETE_INSTALLER_RELEASES_URL } from '../src/lib/updatePolicy'

test('native 0.3 and every later major/minor require the complete installer', () => {
  for (const version of ['0.3.0', '0.3.1', '0.4.0', '0.10.0', '1.0.0', 'v0.3.0', '0.3.0-preview.1', '0.3.0+local']) expect(requiresCompleteInstaller(version)).toBe(true)
  for (const version of ['0.1.0', '0.2.0', '0.2.99']) expect(requiresCompleteInstaller(version)).toBe(false)
})
test('legacy app-only updater cannot cross into native release or act on unknown versions', () => {
  expect(appOnlyUpdateAllowed('0.2.0', '0.2.1')).toBe(true)
  expect(appOnlyUpdateAllowed('0.2.0', '0.3.0')).toBe(false)
  expect(appOnlyUpdateAllowed('0.3.0', '0.3.1')).toBe(false)
  expect(appOnlyUpdateAllowed('0.3.0', '0.2.0')).toBe(false)
  for (const version of ['', 'unknown', '0.3', '0.2.0malformed']) {
    expect(appOnlyUpdateAllowed(version, '0.2.1')).toBe(false)
    expect(appOnlyUpdateAllowed('0.2.0', version)).toBe(false)
  }
})
test('complete installer destination is the fixed publisher GitHub release page', () => {
  const url = new URL(COMPLETE_INSTALLER_RELEASES_URL)
  expect(url.origin).toBe('https://github.com')
  expect(url.pathname).toBe('/abujiletsgo/ultimate-keyboards/releases/latest')
})
