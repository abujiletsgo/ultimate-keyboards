import { describe, expect, test } from 'bun:test'
import type { Rule } from './karabinerGenerator'
import { DEFAULT_RULES } from './macDefaults'
import { createKarabinerStore } from '../stores/karabinerStore'
import {
  countSwapped, parseProfile, profileForHost, serializeProfile, swapDescription, swapModifierName, swapProfile, swapRule,
} from './profileTransfer'
import { importMessage } from '../components/KarabinerEditor/ProfileTransfer'

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }

const RULES: Rule[] = [
  { type: 'homerow_mod', description: 'A: tap is a, hold is Command', fromKey: 'a', tapKey: 'a', modKey: 'left_command', holdThresholdMs: 220 },
  { type: 'homerow_mod', description: 'S: hold is Control', fromKey: 's', tapKey: 's', modKey: 'left_control' },
  { type: 'homerow_mod', description: 'D: hold is Option', fromKey: 'd', tapKey: 'd', modKey: 'left_option' },
  { type: 'combo', description: 'u+i → ⌥+Backspace', fromKeys: ['u', 'i'], toKey: 'delete_or_backspace', toModifiers: ['option'] },
  { type: 'layer_binding', description: 'Layer1 c → ⌘C (copy)', layerName: 'layer1', fromKey: 'c', toKey: 'c', toModifiers: ['command'] },
  { type: 'simple', description: 'Left Cmd → Ctrl', fromKey: 'left_command', toKey: 'left_control' },
  { type: 'simple', description: '⌃H → Backspace', fromKey: 'h', fromModifiers: ['control'], toKey: 'delete_or_backspace' },
  { type: 'layer_activator', description: 'Space: hold → layer1', fromKey: 'spacebar', layerName: 'layer1', tapKey: 'spacebar' },
]
const PROFILE = { profileTitle: 'My keys', rules: RULES, layerNames: ['layer1', 'empty'] }

describe('Command <-> Control swap', () => {
  test('modifier names swap, sides kept, others untouched', () => {
    expect(['command', 'control', 'left_command', 'right_control', 'option', 'shift', 'fn', 'c'].map(swapModifierName))
      .toEqual(['control', 'command', 'left_control', 'right_command', 'option', 'shift', 'fn', 'c'])
  })

  test('descriptions say the other key', () => {
    expect(swapDescription('hold is Command; ⌘C; Ctrl+Z; ⌃←; Controller')).toBe('hold is Control; ⌃C; Cmd+Z; ⌘←; Controller')
  })

  test('output side swaps, the physical key a change starts from does not', () => {
    const [a, s, d, combo, copy, cmdKey, ctrlH, space] = RULES.map(swapRule)
    expect(a).toMatchObject({ fromKey: 'a', modKey: 'left_control', holdThresholdMs: 220, description: 'A: tap is a, hold is Control' })
    expect(s).toMatchObject({ modKey: 'left_command' })
    expect(d).toEqual(RULES[2])
    expect(combo).toMatchObject({ fromKeys: ['u', 'i'], toModifiers: ['option'] })
    expect(copy).toMatchObject({ fromKey: 'c', toModifiers: ['control'], description: 'Layer1 c → ⌃C (copy)' })
    expect(cmdKey).toMatchObject({ fromKey: 'left_command', toKey: 'left_command' })
    expect(ctrlH).toMatchObject({ fromKey: 'h', fromModifiers: ['command'] })
    expect(space).toEqual(RULES[7])
  })

  test('swapping twice gives back the original profile', () => {
    expect(swapProfile(swapProfile(PROFILE))).toEqual(PROFILE)
    expect(swapProfile(PROFILE)).not.toEqual(PROFILE)
  })

  test('counts only changes the swap touches', () => {
    expect(countSwapped(PROFILE)).toBe(5)
    expect(countSwapped({ ...PROFILE, rules: [RULES[2], RULES[3]] })).toBe(0)
  })

  test('the default profile (home-row mods) swaps its Command keys', () => {
    const p = { profileTitle: 'x', rules: DEFAULT_RULES, layerNames: [] }
    const mods = (rules: readonly Rule[]) => rules.flatMap(r => r.type === 'homerow_mod' ? [r.modKey] : [])
    expect(mods(swapProfile(p).rules)).toEqual(mods(DEFAULT_RULES).map(swapModifierName))
  })
})

describe('profile file', () => {
  test('round trip keeps title, rules, empty layers and origin', () => {
    const parsed = parseProfile(serializeProfile(PROFILE, 'mac'))
    expect(parsed.from).toBe('mac')
    expect(parsed.profile).toEqual(PROFILE)
  })

  test('import swaps only across systems and only when asked', () => {
    const fromMac = parseProfile(serializeProfile(PROFILE, 'mac'))
    expect(profileForHost(fromMac, 'windows', true)).toEqual(swapProfile(PROFILE))
    expect(profileForHost(fromMac, 'windows', false)).toEqual(PROFILE)
    expect(profileForHost(fromMac, 'mac', true)).toEqual(PROFILE)
    const fromWin = parseProfile(serializeProfile(swapProfile(PROFILE), 'windows'))
    expect(profileForHost(fromWin, 'mac', true)).toEqual(PROFILE)
  })

  test('refuses files that are not a profile, with a reason a person can read', () => {
    const file = (patch: object) => JSON.stringify({ ...JSON.parse(serializeProfile(PROFILE, 'mac')), ...patch })
    expect(() => parseProfile('not json')).toThrow('isn’t JSON')
    expect(() => parseProfile('{"rules":[]}')).toThrow('isn’t an Ultimate Keyboards profile')
    expect(() => parseProfile(file({ version: 99 }))).toThrow('newer version')
    expect(() => parseProfile(file({ os: 'linux' }))).toThrow('which computer')
    expect(() => parseProfile(file({ profile: { rules: [{ type: 'teleport' }] } }))).toThrow('Change 1 has an unknown kind')
    expect(() => parseProfile(file({ profile: { rules: [{ type: 'homerow_mod', fromKey: 'a', tapKey: 'a' }] } }))).toThrow('missing modKey')
    expect(() => parseProfile(file({ profile: { rules: [{ type: 'combo', fromKeys: ['a'], toKey: 'b' }] } }))).toThrow('missing fromKeys')
  })

  test('fills a missing title and layer list from the rules', () => {
    const parsed = parseProfile(JSON.stringify({ format: 'ultimate-keyboards/laptop-keys', version: 1, os: 'windows', profile: { rules: [RULES[4]] } }))
    expect(parsed.profile.profileTitle).toBe('Imported profile')
    expect(parsed.profile.layerNames).toEqual(['layer1'])
  })
})

describe('import into the store', () => {
  test('replaces the draft as an unsaved, undoable edit', () => {
    const store = createKarabinerStore(memory())
    const before = store.getState().rules
    store.getState().importProfile(swapProfile(PROFILE))
    expect(store.getState()).toMatchObject({ profileTitle: 'My keys', isDirty: true })
    expect(store.getState().rules).toEqual(swapProfile(PROFILE).rules)
    store.getState().undo()
    expect(store.getState().rules).toEqual(before)
  })
})

describe('import message', () => {
  test('says where it came from and what the swap does', () => {
    const fromMac = parseProfile(serializeProfile(PROFILE, 'mac'))
    expect(importMessage(fromMac, 'windows')).toBe('Replace your keys with “My keys” (8 changes)? It was made on a Mac. Swap Cmd for Ctrl in 5 of them so shortcuts like copy and paste still work here.')
    expect(importMessage(fromMac, 'mac')).toBe('Replace your keys with “My keys” (8 changes)?')
    const plain = parseProfile(serializeProfile({ ...PROFILE, rules: [RULES[2]] }, 'windows'))
    expect(importMessage(plain, 'mac')).toBe('Replace your keys with “My keys” (1 change)? It was made on Windows; nothing in it uses Cmd or Ctrl.')
  })
})
