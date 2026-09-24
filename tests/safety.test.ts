import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseKeymapText } from '../src/lib/zmkParser'
import { useZMKStore } from '../src/stores/zmkStore'
import { saveText, ValidationError, MAX_FILE_BYTES } from '../src/lib/io'

const src = readFileSync(join(import.meta.dir, 'fixtures', 'corne_tp.keymap'), 'utf8')

describe('zmkStore edit guard', () => {
  test('an out-of-range key position is ignored and does not dirty the keymap', () => {
    useZMKStore.getState().setKeymap(parseKeymapText(src), '/tmp/x.keymap')
    const before = useZMKStore.getState().keymap!
    const n = before.layers[0].keys.length
    useZMKStore.getState().updateLayerKey(0, n + 5, '&kp A')
    const after = useZMKStore.getState()
    expect(after.isDirty).toBe(false)
    expect(after.keymap!.layers[0].keys.length).toBe(n)
    // in-range edit still works
    useZMKStore.getState().updateLayerKey(0, 0, '&kp F24')
    expect(useZMKStore.getState().isDirty).toBe(true)
    expect(useZMKStore.getState().keymap!.layers[0].keys[0]).toBe('&kp F24')
  })
})

describe('saveText validation', () => {
  test('a rejecting validator throws ValidationError before anything is written', async () => {
    let called = 0
    await expect(
      saveText('/definitely/not/written.keymap', 'abc', {
        validate: (out) => { called++; return out === 'abc' ? 'refused on purpose' : null },
      }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(called).toBe(1)
  })

  test('oversized output is refused', async () => {
    await expect(saveText('/definitely/not/written.keymap', 'x'.repeat(MAX_FILE_BYTES + 1))).rejects.toBeInstanceOf(ValidationError)
  })
})
