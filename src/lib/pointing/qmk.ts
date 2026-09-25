/**
 * QMK pointing-device flags: `rules.mk` (POINTING_DEVICE_ENABLE / _DRIVER) and
 * `config.h` (rotation, invert, CPI). Text-level edits that keep the user's
 * formatting: an existing line is rewritten in place, a missing one is
 * appended, a cleared flag is removed.
 */

export const QMK_DRIVERS = ['pmw3360', 'pmw3389', 'pmw3320', 'adns5050', 'adns9800', 'analog_joystick', 'azoteq_iqs5xx', 'cirque_pinnacle_i2c', 'cirque_pinnacle_spi', 'paw3204', 'pimoroni_trackball', 'custom'] as const
export type QmkDriver = typeof QMK_DRIVERS[number]
export type Rotation = 0 | 90 | 180 | 270

export interface QmkPointing {
  enabled: boolean
  driver: string | null
  rotation: Rotation
  invertX: boolean
  invertY: boolean
  /** PMW33XX_CPI / other `*_CPI` define, when present */
  cpi: number | null
  cpiDefine: string | null
}

const CPI_DEFINES = ['PMW33XX_CPI', 'PMW3360_CPI', 'PMW3389_CPI', 'ADNS9800_CPI', 'PAW3204_CPI', 'POINTING_DEVICE_CPI']

// ── rules.mk ─────────────────────────────────────────────────────────────────

function mkVar(text: string, name: string): string | null {
  const m = new RegExp(`^[ \\t]*${name}[ \\t]*[:?+]?=[ \\t]*(.*?)[ \\t]*$`, 'm').exec(text)
  return m ? m[1].replace(/#.*$/, '').trim() : null
}

export function setMkVar(text: string, name: string, value: string | null): string {
  const re = new RegExp(`^[ \\t]*${name}[ \\t]*[:?+]?=.*(?:\\r?\\n|$)`, 'm')
  if (value === null) return text.replace(re, '')
  if (re.test(text)) return text.replace(re, (line) => `${name} = ${value}${line.endsWith('\n') ? '\n' : ''}`)
  const base = text.length === 0 || text.endsWith('\n') ? text : text + '\n'
  return `${base}${name} = ${value}\n`
}

// ── config.h ─────────────────────────────────────────────────────────────────

function hasDefine(text: string, name: string): boolean {
  return new RegExp(`^[ \\t]*#[ \\t]*define[ \\t]+${name}\\b`, 'm').test(text)
}
function defineValue(text: string, name: string): string | null {
  const m = new RegExp(`^[ \\t]*#[ \\t]*define[ \\t]+${name}[ \\t]+([^\\s/]+)`, 'm').exec(text)
  return m ? m[1] : null
}

/** Set (`value` = '' for a bare define), replace, or remove (`null`) a #define. Appended before a trailing #endif when the header uses include guards. */
export function setDefine(text: string, name: string, value: string | null): string {
  const re = new RegExp(`^[ \\t]*#[ \\t]*define[ \\t]+${name}\\b.*(?:\\r?\\n|$)`, 'm')
  if (value === null) return text.replace(re, '')
  const line = value === '' ? `#define ${name}` : `#define ${name} ${value}`
  if (re.test(text)) return text.replace(re, (old) => `${line}${old.endsWith('\n') ? '\n' : ''}`)
  const guard = /^[ \t]*#[ \t]*endif[^\n]*\n?[ \t]*$/m.exec(text)
  if (guard && guard.index !== undefined) {
    return text.slice(0, guard.index) + line + '\n' + text.slice(guard.index)
  }
  // a brand-new config.h starts with the conventional include guard
  const base = text.length === 0 ? '#pragma once\n\n' : text.endsWith('\n') ? text : text + '\n'
  return `${base}${line}\n`
}

// ── model ────────────────────────────────────────────────────────────────────

export function parseQmkPointing(rules: string, config: string): QmkPointing {
  const en = mkVar(rules, 'POINTING_DEVICE_ENABLE')
  const rotation: Rotation = hasDefine(config, 'POINTING_DEVICE_ROTATION_90') ? 90 : hasDefine(config, 'POINTING_DEVICE_ROTATION_180') ? 180 : hasDefine(config, 'POINTING_DEVICE_ROTATION_270') ? 270 : 0
  let cpi: number | null = null, cpiDefine: string | null = null
  for (const d of CPI_DEFINES) {
    const v = defineValue(config, d)
    if (v && /^\d+$/.test(v)) { cpi = parseInt(v, 10); cpiDefine = d; break }
  }
  return {
    enabled: en !== null && /^(yes|true|1)$/i.test(en),
    driver: mkVar(rules, 'POINTING_DEVICE_DRIVER'),
    rotation,
    invertX: hasDefine(config, 'POINTING_DEVICE_INVERT_X'),
    invertY: hasDefine(config, 'POINTING_DEVICE_INVERT_Y'),
    cpi, cpiDefine,
  }
}

export function applyQmkPointing(rules: string, config: string, before: QmkPointing, after: QmkPointing): { rules: string; config: string } {
  let r = rules, c = config
  if (after.enabled !== before.enabled) r = setMkVar(r, 'POINTING_DEVICE_ENABLE', after.enabled ? 'yes' : 'no')
  if (after.driver !== before.driver) r = setMkVar(r, 'POINTING_DEVICE_DRIVER', after.driver)
  if (after.rotation !== before.rotation) {
    // rewrite an existing rotation define in place (keeps its position), else append / remove
    const existing = /^[ \t]*#[ \t]*define[ \t]+POINTING_DEVICE_ROTATION_(90|180|270)\b.*(?:\r?\n|$)/m
    if (existing.test(c) && after.rotation !== 0) c = c.replace(existing, (old) => `#define POINTING_DEVICE_ROTATION_${after.rotation}${old.endsWith('\n') ? '\n' : ''}`)
    else for (const deg of [90, 180, 270]) c = setDefine(c, `POINTING_DEVICE_ROTATION_${deg}`, after.rotation === deg ? '' : null)
  }
  if (after.invertX !== before.invertX) c = setDefine(c, 'POINTING_DEVICE_INVERT_X', after.invertX ? '' : null)
  if (after.invertY !== before.invertY) c = setDefine(c, 'POINTING_DEVICE_INVERT_Y', after.invertY ? '' : null)
  if (after.cpi !== before.cpi) {
    const d = after.cpiDefine ?? before.cpiDefine ?? 'PMW33XX_CPI'
    c = setDefine(c, d, after.cpi === null ? null : String(after.cpi))
  }
  return { rules: r, config: c }
}
