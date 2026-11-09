import { expect, test } from 'bun:test'
import { qmkBuildRoute, shellQuote } from '../src/lib/qmkBuild'

test('QMK Build tab route by keymap kind', () => {
  expect(qmkBuildRoute({ keyboard: 'planck/rev6', layout: 'LAYOUT_ortho_4x12', keyCount: 48, perLayoutKey: true }, '/Users/me/Documents/qmk-planck/keymap.json'))
    .toEqual({ kind: 'keymap-json', keyboard: 'planck/rev6', compile: 'qmk compile /Users/me/Documents/qmk-planck/keymap.json', flash: 'qmk flash /Users/me/Documents/qmk-planck/keymap.json' })
  expect(qmkBuildRoute({ keyCount: 96, perLayoutKey: false }, '/x/via.json')).toEqual({ kind: 'via-export' })
  expect(qmkBuildRoute({ layout: 'LAYOUT', keyCount: 4, perLayoutKey: true }, '/x/k.json')).toEqual({ kind: 'keymap-json-no-keyboard' })
  expect(qmkBuildRoute(null, '/x').kind).toBe('unreadable')
})

test('paths with spaces or quotes are shell-quoted', () => {
  expect(shellQuote('/Users/me/Ultimate Keyboards/keymap.json')).toBe(`'/Users/me/Ultimate Keyboards/keymap.json'`)
  expect(shellQuote(`/a/it's.json`)).toBe(`'/a/it'\\''s.json'`)
})
