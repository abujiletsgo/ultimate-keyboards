import { describe, expect, test } from 'bun:test'
import { drillFor, judge, type KeyLike, type Step } from '../src/lib/practice'
import { DEFAULT_COMBOS, DEFAULT_RULES, HYPER_CAPS_RULE } from '../src/lib/macDefaults'

const key = (k: string, code: string, mods: Partial<KeyLike> = {}): KeyLike =>
  ({ key: k, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe('practice drills', () => {
  test('K+L Enter: a short word, then the combo', () => {
    const drill = drillFor(DEFAULT_COMBOS[0])!
    expect(drill.steps.map(s => s.kind === 'letter' ? s.char : s.kind)).toEqual(['h', 'i', 'combo'])
    const combo = drill.steps[2]
    expect(judge(combo, key('Enter', 'Enter'))).toBe('ok')
    // the remapper let both letters through: pressed too far apart
    expect(judge(combo, key('k', 'KeyK'))).toBe('split')
    expect(judge(combo, key('x', 'KeyX'))).toBe('wrong')
  })

  test('the word avoids the trigger keys (I+O Backspace does not use "hi")', () => {
    const drill = drillFor(DEFAULT_COMBOS[1])!
    const word = drill.steps.filter(s => s.kind === 'letter').map(s => (s as { char: string }).char).join('')
    expect(word).toBe('yes')
  })

  test('home-row F = Command: type a word with f, then hold F and tap U', () => {
    const f = DEFAULT_RULES.find(r => r.type === 'homerow_mod' && r.fromKey === 'f')!
    const drill = drillFor(f)!
    expect(drill.steps.map(s => s.kind === 'letter' ? s.char : s.kind)).toEqual(['f', 'a', 'd', 'hold'])
    const hold = drill.steps[3]
    expect(judge(hold, key('u', 'KeyU', { metaKey: true }))).toBe('ok')
    expect(judge(hold, key('f', 'KeyF'))).toBe('short')
    expect(judge(hold, key('Meta', 'MetaLeft', { metaKey: true }))).toBe('ignore')
    expect(judge(hold, key('u', 'KeyU'))).toBe('wrong')
  })

  test('right-hand keys pair with a left-hand partner; Option still counts by key position', () => {
    const l = DEFAULT_RULES.find(r => r.type === 'homerow_mod' && r.fromKey === 'l')!
    const hold = drillFor(l)!.steps.at(-1)!
    expect(hold).toMatchObject({ kind: 'hold', partner: 'e', mod: 'alt' })
    // ⌥E is a dead key: `key` is "Dead", the position still says E
    expect(judge(hold, key('Dead', 'KeyE', { altKey: true }))).toBe('ok')
  })

  test('letters: a held modifier is not a plain letter, Shift is fine', () => {
    const step: Step = { kind: 'letter', char: 'h' }
    expect(judge(step, key('H', 'KeyH', { shiftKey: true }))).toBe('ok')
    expect(judge(step, key('h', 'KeyH', { metaKey: true }))).toBe('wrong')
  })

  test('no drill when the page could not see the result', () => {
    expect(drillFor(HYPER_CAPS_RULE)).toBeNull()
    expect(drillFor({ type: 'combo', description: '', fromKeys: ['j', 'k'], toKey: 'mission_control' })).toBeNull()
  })
})
