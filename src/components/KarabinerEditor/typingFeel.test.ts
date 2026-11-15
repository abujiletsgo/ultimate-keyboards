import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { DEFAULT_RULES } from '../../lib/macDefaults'
import type { HomerowModRule, Rule } from '../../lib/karabinerGenerator'
import { applyTypingFeel, describeTypingFeel, feelFields, isRecommendedFeel, readTypingFeel } from './typingFeel'
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

  test('hold time is clamped to the slider range', () => {
    expect(readTypingFeel(applyTypingFeel(DEFAULT_RULES, { holdThresholdMs: 5000 })).holdMs).toBe(400)
    expect(readTypingFeel(applyTypingFeel(DEFAULT_RULES, { holdThresholdMs: 1 })).holdMs).toBe(100)
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
    expect(html).toContain('Typing feel')
    expect(html).toContain('role="radiogroup"')
    expect(html).not.toContain('Hold threshold: 150 ms')
    expect(html.toLowerCase()).not.toContain('karabiner')
  })
})
