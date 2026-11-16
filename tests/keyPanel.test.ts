import { afterEach, describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import KeyPanel from '../src/components/KarabinerEditor/KeyPanel'
import { keyName } from '../src/lib/keyActions'
import { setHostOS } from '../src/lib/platform'

const JARGON = /native|karabiner|\brule|behavior|mod-tap|pass-through|balanced|hold_preferred/i
const noop = () => {}
const render = (code: string, layer: string | null = null, adding = null as { partner: string | null } | null) =>
  renderToStaticMarkup(createElement(KeyPanel, { code, layer, adding, onAdding: noop, onClose: noop, onTurnOn: noop }))

afterEach(() => setHostOS('mac'))

describe('key panel', () => {
  test('shows Tap, Hold and Combo rows in plain words, with the key’s current hold and combo', () => {
    // Server rendering reads the store's starting rules: K holds Shift and K + L types Enter.
    const html = render('k')
    for (const word of ['Tap', 'Hold', 'Combo', 'Add combo', 'Try it', 'K + L', 'Enter']) expect(html).toContain(word)
    expect(html).toContain('aria-label="Hold for Shift" title="Hold for Shift"')
    expect(html).toMatch(/aria-pressed="true" aria-label="Hold for Shift"/)
    expect(html).not.toMatch(JARGON)
  })
  test('on a layer only Tap is shown', () => {
    const html = render('k', 'nav')
    expect(html).toContain('Tap')
    expect(html).not.toContain('>Hold<')
    expect(html).not.toContain('>Combo<')
  })
  test('Windows shows Ctrl / Alt / Shift / Win', () => {
    setHostOS('windows')
    const html = render('k')
    for (const word of ['>Win<', '>Alt<', '>Ctrl<', '>Shift<']) expect(html).toContain(word)
    expect(html).not.toMatch(/[⌘⌥⌃⇧]/)
  })
  test('Caps Lock offers Hyper; other keys do not unless already set', () => {
    expect(render('caps_lock')).toContain('Hold for Hyper')
    expect(render('k')).not.toContain('Hyper')
  })
  test('key names read as words', () => {
    expect(keyName('return_or_enter')).toBe('Enter')
    expect(keyName('k')).toBe('K')
    expect(keyName('left_control')).toBe('Left Control')
    expect(keyName('delete_or_backspace')).toBe('Delete')
    setHostOS('windows')
    expect(keyName('delete_or_backspace')).toBe('Backspace')
    expect(keyName('left_option')).toBe('Left Alt')
  })
})
