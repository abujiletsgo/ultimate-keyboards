import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { bindingLabel, bindingSubLabel } from '../src/lib/keyLabel'
import { parseKeymapText } from '../src/lib/zmkParser'
import { useZMKStore } from '../src/stores/zmkStore'
import { checkZmkCompatibility } from '../src/lib/compat'
import { generateComplexModification, HOMEROW_HOLD_MS } from '../src/lib/karabinerGenerator'

const src = readFileSync(join(import.meta.dir, 'fixtures', 'corne_tp.keymap'), 'utf8')

describe('key labels + sub labels', () => {
  test('layer-tap shows the tap key with a hold cue', () => {
    expect(bindingLabel('&lt 1 SPACE')).toBe('SPC')
    expect(bindingSubLabel('&lt 1 SPACE')).toBe('hold L1')
    expect(bindingLabel('&mt LEFT_COMMAND C_AC_SEARCH')).toBe('SRCH')
    expect(bindingSubLabel('&mt LEFT_COMMAND C_AC_SEARCH')).toBe('hold CMD')
    expect(bindingLabel('&mo 4')).toBe('L4')
    expect(bindingSubLabel('&mo 4')).toBe('hold')
    expect(bindingLabel('&tog 2')).toBe('L2')
    expect(bindingSubLabel('&tog 2')).toBe('toggle')
    expect(bindingSubLabel('&kp A')).toBeUndefined()
    expect(bindingSubLabel('&kp LG(LS(N4))')).toBe('shortcut')
    expect(bindingSubLabel('&and_bspc')).toBe('custom')
    expect(bindingSubLabel('&trans')).toBe('pass')
  })
})

describe('zmkStore: undo / redo / layer references', () => {
  test('key edits are undoable and redoable; load clears history', () => {
    const s = useZMKStore.getState()
    s.setKeymap(parseKeymapText(src), '/tmp/x.keymap')
    const original = useZMKStore.getState().keymap!.layers[0].keys[1]
    s.updateLayerKey(0, 1, '&kp F20')
    s.updateLayerKey(0, 1, '&kp F21')
    expect(useZMKStore.getState().keymap!.layers[0].keys[1]).toBe('&kp F21')
    expect(useZMKStore.getState().past.length).toBe(2)
    s.undo()
    expect(useZMKStore.getState().keymap!.layers[0].keys[1]).toBe('&kp F20')
    s.undo()
    expect(useZMKStore.getState().keymap!.layers[0].keys[1]).toBe(original)
    expect(useZMKStore.getState().future.length).toBe(2)
    s.redo()
    expect(useZMKStore.getState().keymap!.layers[0].keys[1]).toBe('&kp F20')
    s.setKeymap(parseKeymapText(src), '/tmp/x.keymap')
    expect(useZMKStore.getState().past.length).toBe(0)
    expect(useZMKStore.getState().future.length).toBe(0)
  })

  test('layerReferences lists every key and combo that points at a layer', () => {
    const s = useZMKStore.getState()
    s.setKeymap(parseKeymapText(src), '/tmp/x.keymap')
    const refs3 = s.layerReferences(3)
    // Gesture layer 3: reached by the Space+Space combo (&mo 3) and the delete combo's layer filter
    expect(refs3.some(r => r.where.startsWith('combo "gesture"'))).toBe(true)
    expect(refs3.some(r => r.where.includes('combo "delete" layer filter'))).toBe(true)
    const refs8 = s.layerReferences(8)
    expect(refs8.some(r => r.layer === 0 && r.binding === '&lt 8 SPACE')).toBe(true)
    expect(s.layerReferences(99)).toEqual([])
    // deleting a referenced layer is refused with the same information
    expect(s.deleteLayer(8)).toContain('referenced')
  })
})

describe('compat: CST syntax errors are blocking', () => {
  test('a clean file has no issues; injected syntax errors block editing', () => {
    expect(checkZmkCompatibility(src, []).editable).toBe(true)
    const r = checkZmkCompatibility(src, [52, 75])
    expect(r.editable).toBe(false)
    expect(r.issues.filter(i => i.blocking).map(i => i.line)).toEqual([52, 75])
  })
})

describe('karabiner generator', () => {
  test('homerow mods emit the hold threshold they advertise', () => {
    const out = generateComplexModification([{ type: 'homerow_mod', description: 'F: hold → ⌘', fromKey: 'f', tapKey: 'f', modKey: 'left_command' }], 'T') as { rules: { manipulators: { parameters?: Record<string, number> }[] }[] }
    const params = out.rules[0].manipulators[0].parameters!
    expect(params['basic.to_if_held_down_threshold_milliseconds']).toBe(HOMEROW_HOLD_MS)
  })
})
