import { afterEach, expect, test } from 'bun:test'
import { detectHostOS, hostOS, localizeKeys, modifierName, modifierPrefix, modifierText, setHostOS, termsFor } from '../src/lib/platform'
import { LAPTOP_LAYOUT, MACBOOK_LAYOUT, WINDOWS_LAPTOP_LAYOUT, boardSize, laptopLayout } from '../src/lib/macbookLayout'
import { bindingLabel, keycodeLabel } from '../src/lib/keyLabel'
import { macKeyFace, macModifierLabel } from '../src/lib/macKeymapView'
import { HOMEROW_PRESETS, homerowRules } from '../src/lib/macDefaults'
import type { Rule } from '../src/lib/karabinerGenerator'

afterEach(() => setHostOS('mac'))

test('Windows is detected from the user agent; everything else keeps the Mac screens', () => {
  expect(detectHostOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120')).toBe('windows')
  expect(detectHostOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')).toBe('mac')
  expect(detectHostOS('Bun/1.3.9')).toBe('mac')
  expect(detectHostOS('Mozilla/5.0 (Macintosh)', '?os=windows')).toBe('windows')
  expect(hostOS()).toBe('mac')
})

test('Mac words stay as they were; Windows says PC, Laptop keys, Win, Alt and Ctrl', () => {
  expect(termsFor('mac')).toMatchObject({ thisHost: 'This Mac', laptopKeys: 'MacBook Keys', laptop: 'MacBook' })
  expect(termsFor('windows')).toMatchObject({ thisHost: 'This PC', laptopKeys: 'Laptop keys', laptop: 'Laptop', laptopKeyboard: 'laptop keyboard' })
  expect(modifierPrefix(['control', 'shift'], 'mac')).toBe('⌃⇧')
  expect(modifierPrefix(['control', 'shift'], 'windows')).toBe('Ctrl+Shift+')
  expect(modifierText(['left_command', 'option'], 'windows')).toBe('Win+Alt')
  expect(modifierName('right_option', 'windows')).toBe('Alt')
  expect(modifierName('right_option', 'mac')).toBe('⌥')
})

test('localizeKeys rewrites Mac symbols in sentences for Windows only', () => {
  const text = 'A=⌃ S=⌥ D=⇧ F=⌘  •  Hyper (⌃⌥⇧⌘), Layer1 d → ⌃←, u+i → ⌥+Backspace'
  expect(localizeKeys(text, 'mac')).toBe(text)
  expect(localizeKeys(text, 'windows')).toBe('A=Ctrl S=Alt D=Shift F=Win  •  Hyper (Ctrl+Alt+Shift+Win), Layer1 d → Ctrl+←, u+i → Alt+Backspace')
})

test('the Windows laptop drawing is 15u wide with Ctrl, Fn, Win, Alt along the bottom and no Touch ID', () => {
  expect(laptopLayout('mac')).toBe(MACBOOK_LAYOUT)
  expect(LAPTOP_LAYOUT).toBe(MACBOOK_LAYOUT) // tests run as a Mac
  const layout = WINDOWS_LAPTOP_LAYOUT
  expect(layout.some(k => k.code === 'power')).toBe(false)
  const bottom = layout.filter(k => k.y === layout.find(c => c.code === 'spacebar')!.y && k.code !== 'up_arrow' && k.code !== 'down_arrow')
  expect(bottom.map(k => k.label).filter(Boolean)).toEqual(['Ctrl', 'Fn', 'Win', 'Alt', 'Alt', 'Ctrl', '←', '→'])
  expect(layout.find(k => k.code === 'fn')?.fixed).toBeTruthy()
  // Every full row ends at 15u, so the board is a clean rectangle.
  const rows = new Map<number, number>()
  for (const k of layout.filter(k => !k.small && (k.h ?? 1) === 1)) rows.set(k.y, Math.max(rows.get(k.y) ?? 0, k.x + (k.w ?? 1)))
  expect([...rows.values()]).toEqual([15, 15, 15, 15, 15])
  const codes = layout.map(k => k.code)
  expect(new Set(codes).size).toBe(codes.length)
  expect(boardSize(MACBOOK_LAYOUT).width).toBe(14.5 * 50)
  // Rules use the same key codes on both computers.
  for (const code of ['left_command', 'left_option', 'left_control', 'right_option', 'right_control', 'caps_lock', 'return_or_enter']) expect(codes).toContain(code)
})

test('key labels, home-row sub-labels and rule text use Win / Alt / Ctrl on Windows', () => {
  expect(keycodeLabel('LG(LS(N4))')).toBe('⌘⇧4')
  expect(keycodeLabel('LGUI')).toBe('CMD')
  setHostOS('windows')
  expect(keycodeLabel('LG(LS(N4))')).toBe('Win+Shift+4')
  expect(keycodeLabel('LGUI')).toBe('WIN')
  expect(keycodeLabel('LCTRL')).toBe('CTRL')
  expect(bindingLabel('&mt LCTRL A')).toBe('A')
  expect(macModifierLabel(['control', 'shift'])).toBe('Ctrl+Shift+')
  const rules: Rule[] = [{ type: 'homerow_mod', description: 'x', fromKey: 'f', tapKey: 'f', modKey: 'left_command', holdBehavior: 'hold_preferred', holdThresholdMs: 200 }]
  expect(macKeyFace(rules, MACBOOK_LAYOUT.find(k => k.code === 'f')!, null).sub).toBe('Win') // Windows drops 'hold': the words don't fit after it; the mod-tap colour says hold
  expect(homerowRules(HOMEROW_PRESETS[0])[3].description).toBe('F: hold → Win, tap → f')
})
