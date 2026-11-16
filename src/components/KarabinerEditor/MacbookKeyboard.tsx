import { LAPTOP_LAYOUT, type MacKey } from '@/lib/macbookLayout'
import { hostTerms, modifierName } from '@/lib/platform'
import type { Rule } from '@/lib/karabinerGenerator'
import PhysicalBoard from '@/components/board/PhysicalBoard'
import { LAPTOP_PHYSICAL_LAYOUT, macKeyFace } from '@/lib/macKeymapView'
import { BoardLegend } from '@/components/ui'
import { Fingerprint } from 'lucide-react'
import { semanticKeyVisual, type KeyBehavior } from '@/lib/keyVisual'
import './MacbookKeyboard.css'

interface Props {
  rules: Rule[]
  selectedLayer?: string | null
  /** The key whose panel is open. */
  selectedCode?: string | null
  onKeyClick: (key: MacKey) => void
}

/**
 * The laptop keyboard picture. Key face: big label = what a tap types, small label under it = what a
 * hold does (⌃ ⇧ ⌥ ⌘ or a layer name), purple ring = the key is in a combo.
 */
export default function MacbookKeyboard({ rules, selectedLayer = null, selectedCode = null, onKeyClick }: Props) {
  const { laptopKeyboard } = hostTerms()
  const selected = new Set<number>()
  LAPTOP_LAYOUT.forEach((key, i) => { if (key.code === selectedCode) selected.add(i) })
  return (
    <div className="mac-keymap-board macbook-keyboard">
      <BoardLegend items={[
        { color: '#f2a35e', label: `${modifierName('control')} hold` }, { color: '#a48cf5', label: 'Combo' }, { color: '#5fc8ec', label: 'Layer' },
      ]} />
      <PhysicalBoard layout={LAPTOP_PHYSICAL_LAYOUT} label={laptopKeyboard.replace(/^./, c => c.toUpperCase())} showDivider={false} selected={selected}
        keyAt={position => {
          const key = LAPTOP_LAYOUT[position]
          if (key.code === 'power') return { ...semanticKeyVisual('normal', '', undefined, 'Touch ID: the system controls this key'), label: <Fingerprint size={14} aria-hidden="true" /> }
          if (key.fixed) return semanticKeyVisual('normal', key.label, undefined, `${key.label}: ${key.fixed}`)
          const face = macKeyFace(rules, key, selectedLayer)
          const behavior: KeyBehavior = face.kind === 'layer' ? 'layer-tap' : face.kind === 'homerow' ? 'mod-tap' : face.kind === 'fallback' ? 'trans' : 'normal'
          const small = key.small || (key.h ?? 1) < 1
          return { ...semanticKeyVisual(behavior, face.label, small ? undefined : face.sub, face.detail), ariaLabel: face.detail, ring: face.combo }
        }}
        onKeyClick={position => {
          const key = LAPTOP_LAYOUT[position]
          if (!key.fixed) onKeyClick(key)
        }} />
    </div>
  )
}
