import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { DEFAULT_RULES, HOMEROW_PRESETS, homerowRules } from '../../lib/macDefaults'
import { createKarabinerStore } from '../../stores/karabinerStore'
import { createNativeProfile } from '../../lib/nativeRemapping'
import type { HomerowModRule, Rule } from '../../lib/karabinerGenerator'
import {
  applyTypingFeel, chooseMode, describeHoldTime, describeTypingFeel, feelFields, holdSliderRange, holdTimeToCommit,
  isRecommendedFeel, readTypingFeel, replaceHomerowRules,
} from './typingFeel'
import HomerowModEditor from './HomerowModEditor'

const homerow = (rules: readonly Rule[]) => rules.filter((r): r is HomerowModRule => r.type === 'homerow_mod')

describe('typing feel', () => {
  test('defaults read as the recommended feel', () => {
    const feel = readTypingFeel(DEFAULT_RULES)
    expect(feel).toEqual({ count: 8, mode: 'opposite_hand', holdMs: 220 })
    expect(isRecommendedFeel(feel)).toBe(true)
  })

  test('applying a feel changes every home-row rule and nothing else', () => {
    const next = applyTypingFeel(DEFAULT_RULES, { holdBehavior: 'balanced', holdThresholdMs: 180 })
    expect(next.length).toBe(DEFAULT_RULES.length)
    for (const r of homerow(next)) expect(r).toMatchObject({ holdBehavior: 'balanced', holdThresholdMs: 180 })
    expect(next.filter(r => r.type !== 'homerow_mod')).toEqual(DEFAULT_RULES.filter(r => r.type !== 'homerow_mod'))
    expect(homerow(DEFAULT_RULES)[0]).toMatchObject({ holdBehavior: 'opposite_hand', holdThresholdMs: 220 })
  })

  test('hold time is clamped to what the engine accepts (50..1000), not to the slider', () => {
    expect(readTypingFeel(applyTypingFeel(DEFAULT_RULES, { holdThresholdMs: 5000 })).holdMs).toBe(1000)
    expect(readTypingFeel(applyTypingFeel(DEFAULT_RULES, { holdThresholdMs: 1 })).holdMs).toBe(50)
    expect(readTypingFeel(applyTypingFeel(DEFAULT_RULES, { holdThresholdMs: 600 })).holdMs).toBe(600)
  })

  test('keys that differ read as mixed, and new keys fall back to safe defaults', () => {
    const rules = DEFAULT_RULES.map((r, i) => i === 0 && r.type === 'homerow_mod' ? { ...r, holdThresholdMs: 300, holdBehavior: 'hold_preferred' as const } : r)
    const feel = readTypingFeel(rules)
    expect(feel).toMatchObject({ mode: 'mixed', holdMs: 'mixed' })
    expect(feelFields(feel)).toEqual({ holdBehavior: 'opposite_hand', holdThresholdMs: 220 })
    expect(describeTypingFeel(feel)).toContain('different settings')
  })

  test('unset fields read as the engine treats them (tap preferred, 150 ms)', () => {
    const bare: Rule[] = [{ type: 'homerow_mod', description: 'f', fromKey: 'f', tapKey: 'f', modKey: 'left_command' }]
    expect(readTypingFeel(bare)).toEqual({ count: 1, mode: 'tap_preferred', holdMs: 150 })
  })

  test('the editor renders the controls without the old fixed-threshold sentence', () => {
    const html = renderToStaticMarkup(createElement(HomerowModEditor))
    expect(html).toContain('How long is a hold?')
    expect(html).toContain('aria-label="MacBook keyboard"')
    expect(html).toContain('role="radiogroup"')
    expect(html).not.toContain('Hold threshold: 150 ms')
    expect(html.toLowerCase()).not.toContain('karabiner')
  })

  const mixedRules = (): Rule[] => DEFAULT_RULES.map((r, i) => i === 0 && r.type === 'homerow_mod' ? { ...r, holdThresholdMs: 300, holdBehavior: 'hold_preferred' as const } : r)

  test('one mode click settles a mixed hold time too, so the mixed sentence clears', () => {
    const next = chooseMode(mixedRules(), 'balanced')
    const feel = readTypingFeel(next)
    expect(feel).toEqual({ count: 8, mode: 'balanced', holdMs: 220 })
    expect(describeTypingFeel(feel)).not.toContain('different settings')
  })

  test('a mode click keeps a shared hold time', () => {
    const next = chooseMode(applyTypingFeel(DEFAULT_RULES, { holdThresholdMs: 180 }), 'tap_preferred')
    expect(readTypingFeel(next)).toEqual({ count: 8, mode: 'tap_preferred', holdMs: 180 })
  })

  test('a slider release commits the drag, and a resting thumb on a mixed time commits what it shows', () => {
    const mixed = readTypingFeel(mixedRules())
    expect(holdTimeToCommit(readTypingFeel(DEFAULT_RULES), null)).toBeNull()
    expect(holdTimeToCommit(readTypingFeel(DEFAULT_RULES), 260)).toBe(260)
    expect(holdTimeToCommit(mixed, null)).toBe(220)
    const next = applyTypingFeel(mixedRules(), { holdThresholdMs: holdTimeToCommit(mixed, null)! })
    expect(readTypingFeel(next).holdMs).toBe(220)
  })

  test('slider bounds always contain the shown value and its step grid', () => {
    expect(holdSliderRange(220, 220)).toEqual({ min: 100, max: 400, step: 10 })
    expect(holdSliderRange(600, 600)).toEqual({ min: 100, max: 600, step: 10 })
    expect(holdSliderRange(60, 60)).toEqual({ min: 60, max: 400, step: 10 })
    expect(holdSliderRange(555, 555)).toEqual({ min: 100, max: 555, step: 1 })
    expect(holdSliderRange(220, 'mixed')).toEqual({ min: 100, max: 400, step: 10 })
  })

  test('a mode click, a slider commit, a preset and Use recommended are each one undo step', () => {
    let saved: string | null = null
    const store = createKarabinerStore({ getItem: () => saved, setItem: (_k, v) => { saved = v }, removeItem: () => { saved = null } })
    const s = () => store.getState()
    const start = structuredClone(s().rules)
    s().replaceRules(chooseMode(s().rules, 'balanced'))
    expect(s().past.length).toBe(1)
    s().replaceRules(applyTypingFeel(s().rules, { holdThresholdMs: 180 }))
    expect(s().past.length).toBe(2)
    s().replaceRules(replaceHomerowRules(s().rules, homerowRules(HOMEROW_PRESETS[1])))
    expect(s().past.length).toBe(3)
    s().undo(); s().undo()
    expect(readTypingFeel(s().rules)).toMatchObject({ mode: 'balanced', holdMs: 220 })
    s().undo()
    expect(s().rules).toEqual(start)
  })

  test('switching preset keeps the chosen feel and the non-home-row rules', () => {
    const chosen = applyTypingFeel(DEFAULT_RULES, { holdBehavior: 'hold_preferred', holdThresholdMs: 170 })
    const next = replaceHomerowRules(chosen, homerowRules(HOMEROW_PRESETS[1]))
    expect(readTypingFeel(next)).toEqual({ count: 8, mode: 'hold_preferred', holdMs: 170 })
    expect(homerow(next).map(r => r.modKey)).toEqual(homerow(homerowRules(HOMEROW_PRESETS[1])).map(r => r.modKey))
    expect(next.filter(r => r.type !== 'homerow_mod')).toEqual(chosen.filter(r => r.type !== 'homerow_mod'))
    // Mixed keys fall back to the safe defaults for the new set.
    expect(readTypingFeel(replaceHomerowRules(mixedRules(), homerowRules(HOMEROW_PRESETS[1])))).toMatchObject({ mode: 'opposite_hand', holdMs: 220 })
  })

  test('status line words the home-row hold from the rules, not the profile fallback', () => {
    expect(describeHoldTime(readTypingFeel(applyTypingFeel(DEFAULT_RULES, { holdThresholdMs: 180 })))).toBe('180 ms')
    expect(describeHoldTime(readTypingFeel(mixedRules()))).toBe('differs by key')
    expect(describeHoldTime(readTypingFeel([]))).toBe('off')
    expect(createNativeProfile('x', DEFAULT_RULES).holdThresholdMs).toBe(150)
  })
})
