import { describe, expect, test } from 'bun:test'
import { partSleep, planSleep, readKey, setKey, sleepLabel, partLabel, type Part } from '../src/lib/zmkSleep'
import { editedPaths } from '../src/lib/buildFlow'
import type { KeyboardDef } from '../src/lib/registry/types'

const S = '/r/config/boards/shields/corne_tp'
// The real cross_keyboard layout on 2026-11-09: only the right half enables sleep.
const right = `CONFIG_ZMK_POINTING=y\nCONFIG_ZMK_SLEEP=y\nCONFIG_MAIN_STACK_SIZE=8192\n`
const split = (r = right, l: string | null = ''): Part[] => [
  { name: 'corne_tp_left', chain: [{ path: `${S}/corne_tp_left.conf`, text: l }, { path: '/r/config/corne_tp.conf', text: null }, { path: '/r/config/corne_tp_left.conf', text: null }] },
  { name: 'corne_tp_right', chain: [{ path: `${S}/corne_tp_right.conf`, text: r }, { path: '/r/config/corne_tp.conf', text: null }, { path: '/r/config/corne_tp_right.conf', text: null }] },
]

describe('zmk sleep', () => {
  test('reads last assignment; "is not set" is n; comments ignored', () => {
    expect(readKey('CONFIG_ZMK_SLEEP=y\n# CONFIG_ZMK_SLEEP=n\n', 'CONFIG_ZMK_SLEEP')).toBe('y')
    expect(readKey('CONFIG_ZMK_SLEEP=y\n# CONFIG_ZMK_SLEEP is not set\n', 'CONFIG_ZMK_SLEEP')).toBe('n')
    expect(readKey('CONFIG_ZMK_SLEEP_X=y\n', 'CONFIG_ZMK_SLEEP')).toBeNull()
  })

  test('a half without CONFIG_ZMK_SLEEP never sleeps; enabled without timeout is the 15 min default', () => {
    const [l, r] = split().map(partSleep)
    expect(l).toEqual({ kind: 'never' })
    expect(r).toEqual({ kind: 'after', ms: 900_000 })
  })

  test('setting 1 hour edits each half in its own merged file', () => {
    const edits = planSleep(split(), { kind: 'after', ms: 3_600_000 })
    expect(edits.map(e => e.path).sort()).toEqual([`${S}/corne_tp_left.conf`, `${S}/corne_tp_right.conf`])
    const after = split(edits.find(e => e.path.endsWith('right.conf'))!.after, edits.find(e => e.path.endsWith('left.conf'))!.after)
    expect(after.map(partSleep)).toEqual([{ kind: 'after', ms: 3_600_000 }, { kind: 'after', ms: 3_600_000 }])
    // the existing line is replaced in place, not duplicated
    expect(edits.find(e => e.path.endsWith('right.conf'))!.after.match(/CONFIG_ZMK_SLEEP=/g)).toHaveLength(1)
  })

  test('a later user-config file that defines the key is the one edited', () => {
    const parts = split()
    parts[1].chain[2] = { path: '/r/config/corne_tp_right.conf', text: 'CONFIG_ZMK_IDLE_SLEEP_TIMEOUT=60000\n' }
    const edits = planSleep(parts, { kind: 'after', ms: 1_800_000 })
    expect(edits.find(e => e.path === '/r/config/corne_tp_right.conf')!.after).toContain('CONFIG_ZMK_IDLE_SLEEP_TIMEOUT=1800000')
    expect(edits.find(e => e.path === `${S}/corne_tp_right.conf`)).toBeUndefined()
  })

  test('never turns sleep off and leaves halves without it untouched', () => {
    const edits = planSleep(split(), { kind: 'never' })
    expect(edits).toHaveLength(1)
    expect(edits[0].after).toContain('CONFIG_ZMK_SLEEP=n')
  })

  test('single-board keyboard with no shield folder: creates the user config', () => {
    const one: Part[] = [{ name: 'planck', chain: [{ path: '/r/config/planck.conf', text: null }] }]
    const edits = planSleep(one, { kind: 'after', ms: 1_800_000 })
    expect(edits[0]).toMatchObject({ path: '/r/config/planck.conf', created: true })
    expect(partSleep({ ...one[0], chain: [{ path: '/r/config/planck.conf', text: edits[0].after }] })).toEqual({ kind: 'after', ms: 1_800_000 })
  })

  test('no-op when already set', () => {
    const r = setKey(setKey(right, 'CONFIG_ZMK_IDLE_SLEEP_TIMEOUT', '3600000'), 'CONFIG_ZMK_SLEEP', 'y')
    expect(planSleep(split(r, r), { kind: 'after', ms: 3_600_000 })).toEqual([])
  })

  test('labels', () => {
    expect(sleepLabel({ kind: 'after', ms: 3_600_000 })).toBe('1 hour')
    expect(sleepLabel({ kind: 'after', ms: 7_200_000 })).toBe('2 hours')
    expect(sleepLabel({ kind: 'after', ms: 900_000 })).toBe('15 min')
    expect(partLabel('corne_tp_left', ['corne_tp_left', 'corne_tp_right'])).toBe('Left half')
  })

  test('Build commits the setting files', () => {
    const kb = { keymapPath: '/r/config/x.keymap', pointing: [], confPaths: [`${S}/corne_tp_right.conf`] } as unknown as KeyboardDef
    expect(editedPaths(kb)).toContain(`${S}/corne_tp_right.conf`)
  })
})
