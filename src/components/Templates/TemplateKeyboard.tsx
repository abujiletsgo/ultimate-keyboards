import type { CSSProperties } from 'react'
import { LAPTOP_LAYOUT, getKeyStyle, boardSize, KEY_UNIT, KEY_GAP } from '@/lib/macbookLayout'
import type { KeyMark } from '@/lib/templates'
import ScaledBoard from '@/components/ScaledBoard'

/** The four lower rows (Tab row to arrows): every template's keys are inside them. */
const FIRST_ROW_Y = 1.75
const KEYS = LAPTOP_LAYOUT.filter(key => key.y >= FIRST_ROW_Y)
const TOP = FIRST_ROW_Y * (KEY_UNIT + KEY_GAP)
const WIDTH = boardSize(LAPTOP_LAYOUT).width - KEY_GAP
const HEIGHT = Math.max(...KEYS.map(key => key.y * (KEY_UNIT + KEY_GAP) + (key.h ?? 1) * KEY_UNIT + ((key.h ?? 1) - 1) * KEY_GAP)) - TOP

interface Props {
  marks: ReadonlyMap<string, KeyMark>
  /** Screen-reader text. Omit on a card, where the card button already says it. */
  label?: string
}

/** The laptop's keys at real size, scaled as one picture; the label sizes are set before the scale. */
export default function TemplateKeyboard({ marks, label }: Props) {
  return (
    <div className="tpl-board" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <ScaledBoard width={WIDTH} height={HEIGHT} maxScale={1}>
        {KEYS.map(key => {
          const mark = marks.get(key.code)
          // --chars lets long labels (Windows 'Shift', 'Ctrl') shrink to fit; one glyph keeps its full size.
          const style = { ...getKeyStyle(key), top: key.y * (KEY_UNIT + KEY_GAP) - TOP, '--chars': [...(mark?.mark ?? '')].length || 1 } as CSSProperties
          return (
            <div key={key.code} className={`tpl-key${mark ? ` tpl-key--${mark.role}` : ''}`} style={style} data-key={key.code} data-role={mark?.role}>
              {mark && <span className="tpl-key-label">{mark.mark}</span>}
            </div>
          )
        })}
      </ScaledBoard>
    </div>
  )
}
