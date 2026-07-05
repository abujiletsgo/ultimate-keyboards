// Crosses split keyboard layout (42 keys)
// Corne-style columnar stagger split design
// x/y in key-units, w/h default to 1

export interface CrossKey {
  pos: number  // ZMK binding slot index 0-41
  x: number    // key units from left edge
  y: number    // key units from top edge
  w?: number   // width in key units (default 1)
  h?: number   // height in key units (default 1)
}

// Uniform 1.0u column pitch on both halves, symmetric 0.2u outer margins,
// 0.7u gap between the halves (left ends 6.2, right starts 6.9).
export const CROSSES_LAYOUT: CrossKey[] = [
  // ── Left half (positions 0-5, 12-17, 24-29, 36-38) ────────────
  { pos: 0,  x: 0.2,  y: 0.75 },
  { pos: 1,  x: 1.2,  y: 0.50 },
  { pos: 2,  x: 2.2,  y: 0.30 },
  { pos: 3,  x: 3.2,  y: 0.10 },
  { pos: 4,  x: 4.2,  y: 0.30 },
  { pos: 5,  x: 5.2,  y: 0.50 },

  // ── Right half (positions 6-11) ──────────────────────────────
  { pos: 6,  x: 6.9,  y: 0.50 },
  { pos: 7,  x: 7.9,  y: 0.30 },
  { pos: 8,  x: 8.9,  y: 0.10 },
  { pos: 9,  x: 9.9,  y: 0.30 },
  { pos: 10, x: 10.9, y: 0.50 },
  { pos: 11, x: 11.9, y: 0.75 },

  // ── Left half row 2 (positions 12-17) ────────────────────────
  { pos: 12, x: 0.2,  y: 1.75 },
  { pos: 13, x: 1.2,  y: 1.50 },
  { pos: 14, x: 2.2,  y: 1.30 },
  { pos: 15, x: 3.2,  y: 1.10 },
  { pos: 16, x: 4.2,  y: 1.30 },
  { pos: 17, x: 5.2,  y: 1.50 },

  // ── Right half row 2 (positions 18-23) ───────────────────────
  { pos: 18, x: 6.9,  y: 1.50 },
  { pos: 19, x: 7.9,  y: 1.30 },
  { pos: 20, x: 8.9,  y: 1.10 },
  { pos: 21, x: 9.9,  y: 1.30 },
  { pos: 22, x: 10.9, y: 1.50 },
  { pos: 23, x: 11.9, y: 1.75 },

  // ── Left half row 3 (positions 24-29) ────────────────────────
  { pos: 24, x: 0.2,  y: 2.75 },
  { pos: 25, x: 1.2,  y: 2.50 },
  { pos: 26, x: 2.2,  y: 2.30 },
  { pos: 27, x: 3.2,  y: 2.10 },
  { pos: 28, x: 4.2,  y: 2.30 },
  { pos: 29, x: 5.2,  y: 2.50 },

  // ── Right half row 3 (positions 30-35) ───────────────────────
  { pos: 30, x: 6.9,  y: 2.50 },
  { pos: 31, x: 7.9,  y: 2.30 },
  { pos: 32, x: 8.9,  y: 2.10 },
  { pos: 33, x: 9.9,  y: 2.30 },
  { pos: 34, x: 10.9, y: 2.50 },
  { pos: 35, x: 11.9, y: 2.75 },

  // ── Bottom thumb keys (positions 36-41) ──────────────────────
  { pos: 36, x: 2.6,  y: 3.55 },
  { pos: 37, x: 3.7,  y: 3.75 },
  { pos: 38, x: 4.8,  y: 3.75 },
  { pos: 39, x: 7.2,  y: 3.75 },
  { pos: 40, x: 8.3,  y: 3.75 },
  { pos: 41, x: 9.4,  y: 3.55 },
]

export const KEY_UNIT = 46   // px per 1u
export const KEY_GAP = 4     // px gap between keys
export const KEY_RADIUS = 7  // px border radius

export function getKeyStyle(key: CrossKey): React.CSSProperties {
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

// Total board width/height for the container
// (right edge 11.9 + 1u key + 0.2u margin = 13.1u — mirrors the 0.2u left margin)
export const BOARD_WIDTH  = 13.1 * (KEY_UNIT + KEY_GAP)
export const BOARD_HEIGHT = 5.0 * (KEY_UNIT + KEY_GAP)
