import type React from 'react'

export interface CorneProcyonKey {
  pos: number
  x: number
  y: number
  w?: number
  h?: number
  isEncoder?: boolean
  /** firmware position with no physical key (the outer thumb slot on this board) */
  hidden?: boolean
}

export const KEY_UNIT = 46
export const KEY_GAP = 4
export const KEY_RADIUS = 7

// Column stagger y-offsets in key-units (index finger col = 0), from the
// physical RGB matrix positions in keyboard.json. Left outer → inner.
const LS = [0.91, 0.91, 0.36, 0.00, 0.27, 0.36]
const LX = [0, 1, 2, 3, 4, 5]
/** Total width: left half 0–6, 0.8u gap, right half 6.8–12.8. The right half is an exact mirror. */
const W = 12.8
const mirrorX = (x: number, w = 1) => W - x - w

// Left thumbs, outer → inner: encoder, LALT, GUI_SEARCH, LT(1,SPC)
const LT = [
  { x: 1.5, y: 3.85, hidden: true }, // outer slot: in the firmware layout, no key on the board
  { x: 2.6, y: 4.05 },
  { x: 3.7, y: 4.25 },
  { x: 4.8, y: 4.60 },
]

function row(r: number, firstPos: number): CorneProcyonKey[] {
  const left = LX.map((x, c) => ({ pos: firstPos + c, x, y: r + LS[c] }))
  // right half in layout order inner → outer is the mirror of left inner → outer
  const right = [5, 4, 3, 2, 1, 0].map((c, i) => ({ pos: firstPos + 6 + i, x: mirrorX(LX[c]), y: r + LS[c] }))
  return [...left, ...right]
}

export const CORNE_PROCYON_LAYOUT: CorneProcyonKey[] = [
  ...row(0, 0),
  ...row(1, 12),
  ...row(2, 24),
  // left thumbs (pos 36-39), then right thumbs (pos 40-43) inner → outer, mirrored
  ...LT.map((t, i) => ({ pos: 36 + i, ...t })),
  ...[3, 2, 1, 0].map((j, i) => ({ pos: 40 + i, ...LT[j], x: mirrorX(LT[j].x) })),
]

export const BOARD_WIDTH  = W * (KEY_UNIT + KEY_GAP)
export const BOARD_HEIGHT = 6.0  * (KEY_UNIT + KEY_GAP)

// Divider x: between left col5 end and right col0 start
export const DIVIDER_X = 6.4 * (KEY_UNIT + KEY_GAP)

export function getKeyStyle(key: CorneProcyonKey): React.CSSProperties {
  const w = key.w ?? 1
  const h = key.h ?? 1
  return {
    position: 'absolute' as const,
    left:   key.x * (KEY_UNIT + KEY_GAP),
    top:    key.y * (KEY_UNIT + KEY_GAP),
    width:  w * KEY_UNIT + (w - 1) * KEY_GAP,
    height: h * KEY_UNIT + (h - 1) * KEY_GAP,
    borderRadius: KEY_RADIUS,
  }
}
