import { describe, expect, test } from 'bun:test'
import { createKarabinerStore } from '../src/stores/karabinerStore'
import { createNativeProfile } from '../src/lib/nativeRemapping'
import { macLayerNames, MAC_HISTORY_LIMIT } from '../src/lib/macLayerEditing'
import type { Rule } from '../src/lib/karabinerGenerator'
const simple: Rule = { type: 'simple', description: 'A B', fromKey: 'a', toKey: 'b' }
const binding = { type: 'layer_binding' as const, description: 'Nav H', layerName: 'nav', fromKey: 'h', toKey: 'left_arrow', editorMetadata: { note: 'keep', nested: [1, 2] } }
const activator: Rule = { type: 'layer_activator', description: 'Space nav', fromKey: 'spacebar', layerName: 'nav', tapKey: 'spacebar' }
function memory(seed?: object) {
  let value = seed ? JSON.stringify({ state: seed, version: 0 }) : null
  let fail = false
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { if (fail) throw new Error('Storage full'); value = next }, removeItem: () => { value = null } }
  return { storage, read: () => value && JSON.parse(value).state, fail: () => { fail = true } }
}
const setup = (seed?: object) => { const mem = memory(seed); const store = createKarabinerStore(mem.storage); return { mem, store, state: store.getState } }

describe('Mac keymap local editing and retained drafts', () => {
  test('legacy profile migrates as saved without changing unknown rule fields or order', () => {
    const { state } = setup({ rules: [simple, binding, activator], profileTitle: 'My legacy profile' })
    expect(state().rules).toEqual([simple, binding, activator])
    expect(state().savedSnapshot).toEqual({ rules: [simple, binding, activator], profileTitle: 'My legacy profile', layerNames: [] })
    expect(state().isDirty).toBe(false); expect(state().past).toEqual([])
    expect(macLayerNames(state().rules, state().layerNames)).toEqual(['nav'])
  })
  test('empty layers survive reload as dirty draft; Save baseline stays unchanged and history is ephemeral', () => {
    const { state, mem } = setup()
    expect(state().addLayer('empty')).toBeNull()
    expect(state().isDirty).toBe(true)
    const reload = createKarabinerStore(mem.storage).getState()
    expect(reload.layerNames).toEqual(['empty']); expect(reload.savedSnapshot.layerNames).toEqual([])
    expect(reload.isDirty).toBe(true); expect(reload.past).toEqual([]); expect(reload.future).toEqual([])
    expect(Object.keys(mem.read()).sort()).toEqual(['layerNames', 'profileTitle', 'rules', 'savedSnapshot'])
  })
  test('rename is one atomic undo step updating every layer reference and preserving unknown metadata/order', () => {
    const other = { ...binding, layerName: 'other' }
    const { state } = setup({ rules: [simple, binding, activator, other], profileTitle: 'Legacy' })
    expect(state().renameLayer('nav', 'navigation')).toBeNull()
    expect(state().rules).toEqual([simple, { ...binding, layerName: 'navigation' }, { ...activator, layerName: 'navigation' }, other])
    expect(state().layerNames).toEqual(['navigation', 'other']); expect(state().past).toHaveLength(1)
    state().undo(); expect(state().rules).toEqual([simple, binding, activator, other]); expect(state().isDirty).toBe(false)
    state().redo(); expect(state().rules[1]).toEqual({ ...binding, layerName: 'navigation' })
  })
  test('duplicate/invalid layer names and fixed Base fail without history or data mutation', () => {
    const { state } = setup({ rules: [binding], profileTitle: 'Test' })
    for (const name of ['nav', '', 'with spaces', ' name ', 'x'.repeat(81)]) expect(state().addLayer(name)).not.toBeNull()
    expect(state().renameLayer(null, 'new')).not.toBeNull(); expect(state().deleteLayer(null)).not.toBeNull()
    expect(state().past).toHaveLength(0); expect(state().isDirty).toBe(false)
  })
  test('delete rejects activator references; deleting binding-only layer is atomic and undoable', () => {
    const { state } = setup({ rules: [simple, binding, activator], profileTitle: 'Test' })
    expect(state().deleteLayer('nav')).toContain('spacebar'); expect(state().rules).toEqual([simple,binding,activator])
    state().removeRule(2); state().saveProfile()
    expect(state().deleteLayer('nav')).toBeNull(); expect(state().rules).toEqual([simple]); expect(state().layerNames).toEqual([])
    state().undo(); expect(state().rules).toEqual([simple,binding]); expect(state().isDirty).toBe(false)
  })
  test('Save commits a cloned snapshot; Revert restores rules/title/empty layers and clears history', () => {
    const { state, mem } = setup()
    state().addRule(binding); state().addLayer('empty'); state().setTitle('Saved title'); state().saveProfile()
    expect(state().isDirty).toBe(false); expect(state().past).toHaveLength(0)
    state().updateRule(0, { ...binding, toKey: 'up_arrow' }); state().setTitle('Draft'); state().addLayer('draft')
    expect(mem.read().savedSnapshot.profileTitle).toBe('Saved title')
    state().revertProfile()
    expect(state().rules).toEqual([binding]); expect(state().profileTitle).toBe('Saved title'); expect(state().layerNames).toEqual(['nav','empty'])
    expect(state().isDirty).toBe(false); expect(state().past).toEqual([]); expect(state().future).toEqual([])
    expect(createKarabinerStore(mem.storage).getState().isDirty).toBe(false)
  })
  test('Undo/Redo restores ordered mappings and a new edit discards redo branch', () => {
    const { state } = setup({ rules: [simple,binding], profileTitle:'Test' })
    state().moveRule(1,-1); expect(state().rules).toEqual([binding,simple])
    state().undo(); expect(state().rules).toEqual([simple,binding]); state().redo(); expect(state().rules).toEqual([binding,simple])
    state().undo(); state().setTitle('New branch'); expect(state().future).toEqual([])
  })
  test('history is bounded and inputs are deep-cloned', () => {
    const { state } = setup()
    const input=structuredClone(binding); state().addRule(input); input.editorMetadata.nested.push(9)
    expect((state().rules[0] as typeof binding).editorMetadata.nested).toEqual([1,2])
    for(let i=0;i<80;i++) state().setTitle(`Title ${i}`)
    expect(state().past).toHaveLength(MAC_HISTORY_LIMIT)
    for(let i=0;i<80;i++) state().undo()
    expect(state().profileTitle).toBe('Title 29')
  })
  test('atomic replace removes duplicate overrides in one undo step without changing unrelated rules', () => {
    const duplicate={...simple,toKey:'c'}; const { state }=setup({rules:[simple,binding,duplicate,activator],profileTitle:'Test'})
    state().replaceRules([binding,activator]);expect(state().past).toHaveLength(1)
    state().undo();expect(state().rules).toEqual([simple,binding,duplicate,activator])
  })
  test('failed local Save keeps draft dirty and prior saved baseline/history', () => {
    const { state,mem }=setup();state().addRule(simple);const before=structuredClone(state().savedSnapshot);mem.fail()
    expect(()=>state().saveProfile()).toThrow('Storage full')
    expect(state().isDirty).toBe(true);expect(state().savedSnapshot).toEqual(before);expect(state().past).toHaveLength(1)
  })
  test('empty layer metadata and history never enter the native profile payload', () => {
    const { state }=setup();state().addLayer('empty');state().addRule(simple)
    const profile=createNativeProfile(state().profileTitle,state().rules)
    expect(Object.keys(profile).sort()).toEqual(['comboWindowMs','holdThresholdMs','rules','title','version'])
    expect(profile.rules).toEqual([simple]);expect(JSON.stringify(profile)).not.toContain('empty')
  })
})
