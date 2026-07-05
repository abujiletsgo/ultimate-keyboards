import type React from 'react'

export interface CorneProcyonKey {
  pos: number
  x: number
  y: number
  w?: number
  h?: number
  isEncoder?: boolean
}

export const KEY_UNIT = 46
export const KEY_GAP = 4
export const KEY_RADIUS = 7

// Column stagger y-offsets in key-units (relative to index finger col as baseline 0)
// Derived from physical RGB matrix positions in keyboard.json
const LS = [0.91, 0.91, 0.36, 0.00, 0.27, 0.36]  // Left col 0-5 stagger
const RS = [0.36, 0.27, 0.00, 0.36, 0.91, 0.91]  // Right col 0-5 stagger (inner→outer)

const LX = [0, 1.1, 2.1, 3.1, 4.1, 5.1]          // Left col x positions
const RX = [6.8, 7.8, 8.8, 9.8, 10.8, 11.8]       // Right col x positions

export const CORNE_PROCYON_LAYOUT: CorneProcyonKey[] = [
  // ── Row 0 left (pos 0-5) ─────────────────────────────────────────
  { pos: 0,  x: LX[0], y: LS[0] },
  { pos: 1,  x: LX[1], y: LS[1] },
  { pos: 2,  x: LX[2], y: LS[2] },
  { pos: 3,  x: LX[3], y: LS[3] },
  { pos: 4,  x: LX[4], y: LS[4] },
  { pos: 5,  x: LX[5], y: LS[5] },

  // ── Row 0 right (pos 6-11) ────────────────────────────────────────
  { pos: 6,  x: RX[0], y: RS[0] },
  { pos: 7,  x: RX[1], y: RS[1] },
  { pos: 8,  x: RX[2], y: RS[2] },
  { pos: 9,  x: RX[3], y: RS[3] },
  { pos: 10, x: RX[4], y: RS[4] },
  { pos: 11, x: RX[5], y: RS[5] },

  // ── Row 1 left (pos 12-17) ────────────────────────────────────────
  { pos: 12, x: LX[0], y: 1.0 + LS[0] },
  { pos: 13, x: LX[1], y: 1.0 + LS[1] },
  { pos: 14, x: LX[2], y: 1.0 + LS[2] },
  { pos: 15, x: LX[3], y: 1.0 + LS[3] },
  { pos: 16, x: LX[4], y: 1.0 + LS[4] },
  { pos: 17, x: LX[5], y: 1.0 + LS[5] },

  // ── Row 1 right (pos 18-23) ───────────────────────────────────────
  { pos: 18, x: RX[0], y: 1.0 + RS[0] },
  { pos: 19, x: RX[1], y: 1.0 + RS[1] },
  { pos: 20, x: RX[2], y: 1.0 + RS[2] },
  { pos: 21, x: RX[3], y: 1.0 + RS[3] },
  { pos: 22, x: RX[4], y: 1.0 + RS[4] },
  { pos: 23, x: RX[5], y: 1.0 + RS[5] },

  // ── Row 2 left (pos 24-29) ────────────────────────────────────────
  { pos: 24, x: LX[0], y: 2.0 + LS[0] },
  { pos: 25, x: LX[1], y: 2.0 + LS[1] },
  { pos: 26, x: LX[2], y: 2.0 + LS[2] },
  { pos: 27, x: LX[3], y: 2.0 + LS[3] },
  { pos: 28, x: LX[4], y: 2.0 + LS[4] },
  { pos: 29, x: LX[5], y: 2.0 + LS[5] },

  // ── Row 2 right (pos 30-35) ───────────────────────────────────────
  { pos: 30, x: RX[0], y: 2.0 + RS[0] },
  { pos: 31, x: RX[1], y: 2.0 + RS[1] },
  { pos: 32, x: RX[2], y: 2.0 + RS[2] },
  { pos: 33, x: RX[3], y: 2.0 + RS[3] },
  { pos: 34, x: RX[4], y: 2.0 + RS[4] },
  { pos: 35, x: RX[5], y: 2.0 + RS[5] },

  // ── Left thumb (pos 36-39) ────────────────────────────────────────
  // Positions derived from physical RGB LED coordinates in keyboard.json
  { pos: 36, x: 1.5,  y: 3.85, isEncoder: true },  // encoder knob slot
  { pos: 37, x: 2.6,  y: 4.05 },  // LALT
  { pos: 38, x: 3.7,  y: 4.25 },  // GUI_SEARCH
  { pos: 39, x: 4.8,  y: 4.60 },  // LT(1,SPC) — inner thumb

  // ── Right thumb (pos 40-43) ───────────────────────────────────────
  { pos: 40, x: 6.9,  y: 4.60 },  // LT(1,SPC) — inner thumb
  { pos: 41, x: 8.0,  y: 4.25 },  // RGUI
  { pos: 42, x: 9.1,  y: 4.05 },  // TG(2)
  { pos: 43, x: 10.2, y: 3.85, isEncoder: true },  // encoder knob slot
]

export const BOARD_WIDTH  = 13.2 * (KEY_UNIT + KEY_GAP)
export const BOARD_HEIGHT = 6.0  * (KEY_UNIT + KEY_GAP)

// Divider x: between left col5 end and right col0 start
export const DIVIDER_X = 6.35 * (KEY_UNIT + KEY_GAP)

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
