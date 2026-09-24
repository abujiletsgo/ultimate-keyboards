/**
 * Keyboard registry — the user's keyboards, each a self-contained descriptor
 * that every section (keymap, combos, pointing, build) reads from. Persisted
 * per install (tauri-plugin-store on desktop, localStorage on the web).
 */
import type { PhysicalLayout } from '@/lib/layout'

export type Firmware = 'zmk' | 'qmk'

export interface PointingDescriptor {
  id: string
  /** e.g. "Trackpad", "Trackball" */
  name: string
  /** e.g. "Azoteq IQS5XX", "Pixart PMW3610" */
  chip: string
  /** devicetree `compatible` of the sensor node */
  compatible: string
  /** overlay file holding the sensor + listener nodes */
  overlayPath: string
  /** regex source for the sensor node opener, e.g. `trackpad\s*:\s*iqs5xx@74\s*\{` */
  sensorNodeRe: string
  /** regex source for the input-listener node opener */
  listenerNodeRe: string
  supports: {
    cursorScaler: boolean
    chipSensitivity: boolean
    cpi: boolean
    invertXY: boolean
    smartMode: boolean
    scrollToggles: boolean
    gestures: boolean
    advancedAzoteq: boolean
    snipe: boolean
    scrollLayer: boolean
  }
}

export interface KeyboardDef {
  id: string
  name: string
  firmware: Firmware
  /** Config repo root (the folder the user granted), when known. */
  repoPath?: string
  /** ZMK: the .keymap file. QMK: the VIA/keymap layout JSON. */
  keymapPath: string
  /** QMK only: keymap.c for the combo editor, when present. */
  keymapCPath?: string
  /** Shield / keyboard name from build.yaml or the folder, for display + catalogue matching. */
  shield?: string
  layout: PhysicalLayout
  pointing: PointingDescriptor[]
  createdAt: string
}

export interface RegistryData {
  version: 1
  keyboards: KeyboardDef[]
  selectedId: string | null
}

export const EMPTY_REGISTRY: RegistryData = { version: 1, keyboards: [], selectedId: null }

export function newKeyboardId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'keyboard'
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`
}
