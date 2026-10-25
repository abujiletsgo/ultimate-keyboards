import { useState, type ReactNode } from 'react'
import BindingEditorShell, { type BindingBehavior } from '@/components/board/BindingEditorShell'
import BindingParamPicker from '@/components/board/BindingParamPicker'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { macLayerNames } from '@/lib/macLayerEditing'
import { nativeShiftedSymbol, isShiftModifier } from '@/lib/nativeSymbols'
import { macKeyFace, macModifierLabel } from '@/lib/macKeymapView'
import { MACBOOK_LAYOUT } from '@/lib/macbookLayout'
import { applyNativeBinding, readNativeBinding, nativeBindingError, nativeBindingContextError, NATIVE_KEYS, NATIVE_KEY_CHOICES, nativeKeyChoice, selectNativeKeyChoice, NATIVE_HOLD_MODIFIERS, type NativeBehavior, type NativeBinding } from '@/lib/nativeBinding'

const BEHAVIORS: BindingBehavior[] = [
  { code: 'key', label: 'Key', title: 'Regular keypress', color: 'rgba(255,255,255,0.09)' },
  { code: 'mo', label: 'Hold Layer', title: 'Layer active while key is held', color: 'rgba(96,165,250,0.25)' },
  { code: 'lt', label: 'Tap/Hold', title: 'Tap=key, Hold=layer', color: 'rgba(96,165,250,0.18)' },
  { code: 'mt', label: 'Mod-tap', title: 'Tap=key, Hold=modifier', color: 'rgba(251,146,60,0.2)' },
  { code: 'trans', label: 'Pass-thru', title: 'Remove direct overrides for this key', color: 'rgba(255,255,255,0.04)' },
]
function ParamRow({ label, children }: { label: string; children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
    <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 52, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>{children}
  </div>
}
export default function MacBindingEditor({ keyCode, layerName, anchorX, anchorY, anchorTop, onClose }:
  { keyCode: string; layerName: string | null; anchorX: number; anchorY: number; anchorTop?: number; onClose(): void }) {
  const rules = useKarabinerStore(s => s.rules)
  const names = useKarabinerStore(s => s.layerNames)
  const layers = macLayerNames(rules, names)
  const [binding, setBinding] = useState<NativeBinding>(() => readNativeBinding(rules, keyCode, layerName))
  const [saveError, setSaveError] = useState('')
  const update = (patch: Partial<NativeBinding>) => { setSaveError(''); setBinding(current => ({ ...current, ...patch })) }
  const error = nativeBindingContextError(rules, keyCode) ?? nativeBindingError(binding, keyCode, layerName)
  const readOnly = !NATIVE_KEYS.includes(keyCode)
  const physical = MACBOOK_LAYOUT.find(key => key.code === keyCode)
  const face = physical ? macKeyFace(rules, physical, layerName) : null
  const symbol = nativeShiftedSymbol(binding.key, binding.modifiers)
  const preview = binding.behavior === 'trans' ? (layerName === null ? 'Original key' : 'Pass → Base')
    : binding.behavior === 'key' ? symbol ? `${macModifierLabel(binding.modifiers.filter(mod => !isShiftModifier(mod)))}${symbol.symbol}` : [...binding.modifiers, binding.key].join(' + ')
    : binding.behavior === 'mo' ? `Hold ${binding.layer}`
    : `Tap ${binding.key} · Hold ${binding.behavior === 'mt' ? binding.modifier : binding.layer}`
  return <BindingEditorShell anchor={{ x: anchorX, y: anchorY, top: anchorTop }} label={`Edit binding ${keyCode}`}
    behaviors={readOnly ? [] : BEHAVIORS.filter(item => layerName === null || ['key', 'trans'].includes(item.code))}
    selected={binding.behavior} onSelect={code => update({ behavior: code as NativeBehavior, layer: binding.layer || layers[0] || '' })}
    onCancel={onClose} preview={preview} disabled={!!error} onApply={() => {
      try {
        const store = useKarabinerStore.getState()
        store.replaceRules(applyNativeBinding(store.rules, keyCode, layerName, binding))
        onClose()
      } catch (cause) { setSaveError(cause instanceof Error ? cause.message : String(cause)) }
    }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>Layer: {layerName ?? 'Base'}</div>
      {!readOnly && <>
        {['mo', 'lt'].includes(binding.behavior) && <ParamRow label="Layer">
          {layers.length ? <BindingParamPicker options={layers} value={binding.layer} label="Layer" allowCustom={false} hint="" onChange={layer => update({ layer })} />
            : <span style={{ fontSize: 11 }}>Add a layer in the layer strip first.</span>}
        </ParamRow>}
        {binding.behavior === 'mt' && <ParamRow label="Mod"><BindingParamPicker options={NATIVE_HOLD_MODIFIERS} value={binding.modifier} label="Hold modifier" allowCustom={false} hint="" onChange={modifier => update({ modifier })} /></ParamRow>}
        {['key', 'lt', 'mt'].includes(binding.behavior) && <ParamRow label={binding.behavior === 'key' ? 'Key' : 'Tap key'}>
          <BindingParamPicker options={binding.behavior === 'key' ? NATIVE_KEY_CHOICES : NATIVE_KEYS} value={nativeKeyChoice(binding)} label="Key" allowCustom={false}
            hint={binding.behavior === 'key' ? 'US ANSI symbols include Shift. Choose the symbol’s raw base key to remove Shift.' : ''}
            onChange={choice => update(selectNativeKeyChoice(binding, choice))} />
        </ParamRow>}
        {binding.behavior === 'key' && <ParamRow label="Mods"><div className="seg-ctrl" role="group" aria-label="Output modifiers" style={{ flexWrap: 'wrap', minWidth: 0 }}>
          {[...new Set(['command', 'option', 'control', 'shift', ...binding.modifiers])].map(mod => <button type="button" className={`seg-btn${binding.modifiers.includes(mod) ? ' active' : ''}`} key={mod} aria-pressed={binding.modifiers.includes(mod)}
            aria-label={mod.replace(/_/g, ' ')} title={mod.replace(/_/g, ' ')} style={{ padding: '4px 8px' }}
            onClick={() => update({ modifiers: binding.modifiers.includes(mod) ? binding.modifiers.filter(value => value !== mod) : [...binding.modifiers, mod] })}>{({ command: 'CMD', option: 'ALT', control: 'CTL', shift: 'SFT' } as Record<string, string>)[mod] ?? mod.replace('left_', 'L ').replace('right_', 'R ').replace('command', 'CMD').replace('option', 'ALT').replace('control', 'CTL').replace('shift', 'SFT')}</button>)}
        </div></ParamRow>}
        {binding.behavior === 'mo' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Immediate while held; release returns to the previous layer.</div>}
        {binding.behavior === 'lt' && <fieldset style={{ border: 0, padding: 0, margin: 0, fontSize: 11 }}><legend style={{ marginBottom: 6 }}>Native layer timing</legend>
          {([['balanced', 'Balanced', 'Resolve when another key is tapped.'], ['hold_preferred', 'Fast chord', 'Activate on another key press; rolling taps can become layer chords.'], ['tap_preferred', 'Timed', 'Wait for the hold threshold.']] as const).map(([value, label, description]) =>
            <label key={value} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0' }}><input type="radio" name="native-layer-timing" value={value} checked={binding.holdBehavior === value} onChange={() => update({ holdBehavior: value })} /><span>{label}<span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10 }}>{description}</span></span></label>)}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Native only. Karabiner export keeps its legacy timing.</div>
        </fieldset>}
        {binding.behavior === 'trans' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{layerName === null ? 'Remove all direct Base overrides. Conditional mappings and combos remain.' : 'Remove this layer’s overrides and use Base. Other layers stay unchanged.'}</div>}
      </>}
      {face?.shadowedBy !== undefined && <div role="status" style={{ fontSize: 11, color: 'var(--warning)' }}>An earlier Base rule can override this layer binding. Adjust its order in the rule list.</div>}
      {face?.conditional && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Conditional mappings and combos also apply; edit them in their own controls.</div>}
      {(saveError || error) && <div role="alert" style={{ fontSize: 11, color: 'var(--warning)' }}>{saveError || error}</div>}
    </div>
  </BindingEditorShell>
}
