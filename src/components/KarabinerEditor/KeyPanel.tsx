import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import BindingParamPicker from '@/components/board/BindingParamPicker'
import { macLayerNames } from '@/lib/macLayerEditing'
import { hyperName, modifierLong, modifierName } from '@/lib/platform'
import { NATIVE_KEYS, NATIVE_KEY_CHOICES, nativeKeyChoice } from '@/lib/nativeBinding'
import type { Rule } from '@/lib/karabinerGenerator'
import {
  addCombo, clearLayerTap, holdChoices, holdModifierFor, keyName, modifierFamily, pickOutput, readKeyActions, removeCombo,
  setComboOutput, setKeyHold, setKeyTap, toggleModifier, type Hold,
} from '@/lib/keyActions'
import { drillFor, drillId, triedIds } from '@/lib/practice'
import PracticeCard from './PracticeCard'
import './KeyPanel.css'

/** Add-combo flow, owned by the editor so the keyboard picture can answer "click the other key". */
export interface AddingCombo { partner: string | null; error?: string }

/** Plain keys first so the list opens on letters and Enter, not symbols. */
const TAP_OPTIONS = [...NATIVE_KEYS, ...NATIVE_KEY_CHOICES.filter(choice => !NATIVE_KEYS.includes(choice))]
const PLAIN_MODS = ['command', 'option', 'control', 'shift']
const keyText = (choice: string) => NATIVE_KEYS.includes(choice) ? keyName(choice) : choice
const modText = (family: string) => family === 'hyper' ? hyperName() : modifierName(family)
const modSpoken = (family: string) => family === 'hyper' ? 'Hyper, all four modifiers' : modifierLong(family)

/** Left/right arrows move between the buttons of a row; Tab, Enter and Space work as usual. */
function arrowRow(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  event.preventDefault()
  buttons[(at + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length].focus()
}

function Chip({ on, label, spoken, disabled, onClick, children }: { on: boolean; label?: string; spoken?: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="kp-chip" aria-pressed={on} aria-label={spoken ?? label} title={spoken ?? label} disabled={disabled} onClick={onClick}>{children}</button>
}

export default function KeyPanel({ code, layer, adding, onAdding, onClose, onTurnOn }: {
  code: string; layer: string | null; adding: AddingCombo | null; onAdding: (next: AddingCombo | null) => void; onClose: () => void; onTurnOn: () => void
}) {
  const rules = useKarabinerStore(s => s.rules)
  const layerNames = useKarabinerStore(s => s.layerNames)
  const [error, setError] = useState('')
  const [practice, setPractice] = useState<Rule | null>(null)
  const panel = useRef<HTMLElement>(null)
  const supported = NATIVE_KEYS.includes(code)
  const { tap, hold, combos } = readKeyActions(rules, code, layer)
  const layers = macLayerNames(rules, layerNames)

  // A different key is a fresh panel: clear leftovers.
  useEffect(() => { setError(''); setPractice(null) }, [code, layer])
  // Esc: cancel adding a combo first, then close. A picker that is open handles its own Esc.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (adding) onAdding(null); else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [adding, onAdding, onClose])

  const change = (make: (current: readonly Rule[]) => Rule[]) => {
    try {
      const store = useKarabinerStore.getState()
      store.replaceRules(make(store.rules))
      setError('')
      return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false }
  }
  const setHold = (next: Hold) => change(current => setKeyHold(current, code, next))
  const holdFamily = hold.kind === 'modifier' ? modifierFamily(hold.modifier) : null

  const holdRule = rules.find(rule => rule.type === 'homerow_mod' && rule.fromKey === code)
  const target = [holdRule, ...combos.map(combo => rules[combo.index])].find(rule => rule && drillFor(rule))
  const comboLabel = (keys: readonly string[]) => keys.map(keyName).join(' + ')

  return (
    <section ref={panel} className="key-panel glass-strong" aria-label={`Settings for ${keyName(code)}`}>
      <header className="kp-head">
        <h3>{keyName(code)}{layer !== null && <span className="kp-layer"> on {layer}</span>}</h3>
        <button type="button" className="btn btn-ghost btn-sm kp-close" onClick={onClose} aria-label="Close"><X size={14} aria-hidden="true" /></button>
      </header>

      {!supported ? <p className="kp-hint">This key can’t be changed.</p> : <>
        <div className="kp-row">
          <span className="kp-label" id="kp-tap">Tap</span>
          <div className="kp-controls" role="group" aria-labelledby="kp-tap" onKeyDown={arrowRow}>
            <BindingParamPicker options={TAP_OPTIONS} value={nativeKeyChoice({ behavior: 'key', key: tap.key, modifiers: tap.modifiers, layer: '', modifier: '', holdBehavior: 'balanced' })}
              label="Tap key" allowCustom={false} hint="" format={keyText}
              onChange={choice => change(current => setKeyTap(current, code, layer, pickOutput({ key: tap.key, modifiers: tap.modifiers }, choice)))} />
            {hold.kind === 'none' && PLAIN_MODS.map(family => (
              <Chip key={family} on={tap.modifiers.includes(family)} label={`Also press ${modifierLong(family)}`} spoken={`Also press ${modifierLong(family)}`}
                onClick={() => change(current => setKeyTap(current, code, layer, { key: tap.key, modifiers: toggleModifier(tap.modifiers, family) }))}>{modText(family)}</Chip>
            ))}
            {layer !== null && tap.custom && <button type="button" className="btn btn-ghost btn-sm" onClick={() => change(current => clearLayerTap(current, code, layer))}>Use Base key</button>}
          </div>
        </div>

        {layer === null && <>
          <div className="kp-row">
            <span className="kp-label" id="kp-hold">Hold</span>
            <div className="kp-controls" role="group" aria-labelledby="kp-hold" onKeyDown={arrowRow}>
              <Chip on={hold.kind === 'none'} label="Nothing on hold" onClick={() => setHold({ kind: 'none' })}>None</Chip>
              {holdChoices(code, hold).map(family => (
                <Chip key={family} on={holdFamily === family} spoken={`Hold for ${modSpoken(family)}`}
                  onClick={() => setHold({ kind: 'modifier', modifier: holdModifierFor(code, family, hold.kind === 'modifier' ? hold.modifier : undefined) })}>{modText(family)}</Chip>
              ))}
              <Chip on={hold.kind === 'layer'} disabled={layers.length === 0 && hold.kind !== 'layer'} spoken="Hold for a layer"
                onClick={() => setHold({ kind: 'layer', layer: hold.kind === 'layer' ? hold.layer : layers[0] })}>Layer</Chip>
              {hold.kind === 'layer' && (layers.length > 1
                ? <BindingParamPicker options={layers} value={hold.layer} label="Layer to hold" allowCustom={false} hint="" onChange={next => setHold({ kind: 'layer', layer: next })} />
                : <span className="kp-note">{hold.layer}</span>)}
            </div>
            {layers.length === 0 && hold.kind !== 'layer' && <p className="kp-hint">Add a layer above to hold for it.</p>}
          </div>

          <div className="kp-row">
            <span className="kp-label" id="kp-combo">Combo</span>
            <div className="kp-controls kp-combos" role="group" aria-labelledby="kp-combo">
              {combos.map(combo => (
                <div className="kp-combo" key={combo.index}>
                  <span className="kp-keys">{comboLabel(combo.keys)}</span><span aria-hidden="true">→</span>
                  <BindingParamPicker options={TAP_OPTIONS} value={nativeKeyChoice({ behavior: 'key', key: combo.toKey, modifiers: combo.toModifiers, layer: '', modifier: '', holdBehavior: 'balanced' })}
                    label={`What ${comboLabel(combo.keys)} types`} allowCustom={false} hint="" format={keyText}
                    onChange={choice => { const out = pickOutput({ key: combo.toKey, modifiers: combo.toModifiers }, choice); change(current => setComboOutput(current, combo.index, out.key, out.modifiers)) }} />
                  <button type="button" className="btn btn-ghost btn-sm kp-remove" aria-label={`Remove combo ${comboLabel(combo.keys)}`} onClick={() => change(current => removeCombo(current, combo.index))}><X size={14} aria-hidden="true" /></button>
                </div>
              ))}
              {adding === null
                ? <button type="button" className="btn btn-secondary btn-sm kp-add" onClick={() => onAdding({ partner: null })}><Plus size={13} aria-hidden="true" />Add combo</button>
                : <div className="kp-combo kp-adding" role="status">
                    {adding.partner === null
                      ? <strong>Click the other key</strong>
                      : <><span className="kp-keys">{comboLabel([code, adding.partner])}</span><span aria-hidden="true">→</span>
                        <BindingParamPicker options={TAP_OPTIONS} value="" placeholder="Pick a key" label="What the combo types" allowCustom={false} hint="" format={keyText}
                          onChange={choice => {
                            const out = pickOutput({ key: choice, modifiers: [] }, choice)
                            const partner = adding.partner!
                            if (!change(current => addCombo(current, code, partner, out.key, out.modifiers))) return
                            onAdding(null)
                            const made = useKarabinerStore.getState().rules.at(-1)
                            if (made && drillFor(made) && !triedIds().has(drillId(made))) setPractice(made)
                          }} /></>}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAdding(null)}>Cancel</button>
                  </div>}
              {adding?.error && <p className="kp-error" role="alert">{adding.error}</p>}
            </div>
          </div>
        </>}

        {error && <p className="kp-error" role="alert">{error}</p>}
        {target && !practice && <div className="kp-foot"><button type="button" className="btn btn-primary btn-sm" onClick={() => setPractice(target)}>Try it</button></div>}
      </>}
      {practice && <PracticeCard key={drillId(practice)} rule={practice} onClose={() => setPractice(null)} onTurnOn={onTurnOn} />}
    </section>
  )
}
