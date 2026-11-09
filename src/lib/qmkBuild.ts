/**
 * What the Build tab can offer a QMK keyboard. The app does not compile QMK
 * itself, so it says exactly how this keymap reaches the keyboard: the QMK CLI
 * or QMK Configurator for a keymap.json, live writes for a VIA / Vial
 * keyboard, and a .uf2 copy for boards with a UF2 bootloader.
 */
import type { QmkKeymapFacts } from '@/lib/registry/detect'

export type QmkBuildRoute =
  | { kind: 'keymap-json'; keyboard: string; compile: string; flash: string }
  | { kind: 'keymap-json-no-keyboard' }
  | { kind: 'via-export' }
  | { kind: 'unreadable'; reason: string }

/** Shell-quote a path for the commands shown on screen. */
export function shellQuote(p: string): string {
  return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`
}

export function qmkBuildRoute(facts: QmkKeymapFacts | null, keymapPath: string): QmkBuildRoute {
  if (!facts) return { kind: 'unreadable', reason: 'The keymap file is not a QMK keymap JSON (no "layers" list).' }
  if (!facts.perLayoutKey) return { kind: 'via-export' }
  if (!facts.keyboard) return { kind: 'keymap-json-no-keyboard' }
  const q = shellQuote(keymapPath)
  return { kind: 'keymap-json', keyboard: facts.keyboard, compile: `qmk compile ${q}`, flash: `qmk flash ${q}` }
}
