import { describe, expect, test } from 'bun:test'
import { ruleToKarabiner, type LayerActivatorRule } from '../src/lib/karabinerGenerator'
import { createNativeProfile, serializeNativeProfile } from '../src/lib/nativeRemapping'

const layer: LayerActivatorRule = {
  type: 'layer_activator', description: 'Space navigation layer',
  fromKey: 'spacebar', layerName: 'nav', tapKey: 'spacebar',
}

describe('native layer policy serialization', () => {
  test('omitted policy stays omitted for the native balanced default; source rule is not migrated', () => {
    const profile = createNativeProfile('Existing profile', [layer])
    expect(JSON.parse(serializeNativeProfile(profile)).rules).toEqual([layer])
    expect('holdBehavior' in profile.rules[0]).toBe(false)
    expect(profile.holdThresholdMs).toBe(150)
    expect('holdBehavior' in layer).toBe(false)
  })

  test('all native policies round-trip, retaining additional persisted fields without mutating them', () => {
    for (const holdBehavior of ['balanced', 'hold_preferred', 'tap_preferred'] as const) {
      const saved = { ...layer, holdBehavior, editorMetadata: { note: 'keep user work' } }
      const original = structuredClone(saved)
      const profile = createNativeProfile('Native', [saved])
      expect(JSON.parse(serializeNativeProfile(profile)).rules[0]).toEqual(original)
      ;(profile.rules[0] as typeof saved).editorMetadata.note = 'different'
      expect(saved).toEqual(original)
    }
  })

  test('tapless rules remain tapless; native timing does not silently change compatibility export', () => {
    const legacy = ruleToKarabiner(layer)
    for (const holdBehavior of ['balanced', 'hold_preferred', 'tap_preferred'] as const) {
      expect(ruleToKarabiner({ ...layer, holdBehavior })).toEqual(legacy)
      const momentary = { ...layer, tapKey: undefined, holdBehavior }
      expect(JSON.parse(serializeNativeProfile(createNativeProfile('Immediate', [momentary]))).rules[0].tapKey).toBeUndefined()
      expect(ruleToKarabiner(momentary)).toEqual({
        description: layer.description,
        manipulators: [{
          type: 'basic', from: { key_code: 'spacebar' },
          to_if_held_down: [{ set_variable: { name: 'nav', value: 1 } }],
          to_after_key_up: [{ set_variable: { name: 'nav', value: 0 } }],
        }],
      })
    }
  })
})
