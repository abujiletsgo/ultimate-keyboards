/**
 * Files for a brand-new zmk-config made from ZMK's official template: the
 * build matrix for the chosen keyboard, its default keymap, and the ZMK
 * revision pinned to `main` (the catalogue's source) instead of the
 * template's older release. Pure text; the UI writes them.
 */
import type { ZmkCatalogueKeyboard } from './index'

export interface Controller { id: string; label: string; board: string; exposes: string }

/** Controllers for shields; ids verified against zmkfirmware/zmk main (2026-09-25). */
export const CONTROLLERS: Controller[] = [
  { id: 'nice_nano', label: 'nice!nano v2 (most common)', board: 'nice_nano//zmk', exposes: 'pro_micro' },
  { id: 'xiao_ble', label: 'Seeed XIAO nRF52840', board: 'xiao_ble//zmk', exposes: 'seeed_xiao' },
]

export function controllersFor(kb: ZmkCatalogueKeyboard): Controller[] {
  if (kb.type === 'board') return []
  const fits = CONTROLLERS.filter(c => kb.requires.includes(c.exposes))
  return fits.length ? fits : CONTROLLERS.slice(0, 1)
}

export interface NewConfigOptions {
  keyboard: ZmkCatalogueKeyboard
  controller: Controller | null
  /** add the Studio snippet to the central half so the keyboard can be read and edited live over USB */
  studio: boolean
}

export function buildYaml({ keyboard, controller, studio }: NewConfigOptions): string {
  const halves = keyboard.siblings.length ? keyboard.siblings : [keyboard.id]
  const lines = [
    '# Written by Ultimate Keyboards for ' + keyboard.name + '.',
    '# Each entry is one firmware file built by GitHub Actions.',
    '---',
    'include:',
  ]
  halves.forEach((half, i) => {
    const central = i === 0
    if (keyboard.type === 'board') lines.push(`  - board: ${half}`)
    else lines.push(`  - board: ${controller?.board ?? 'nice_nano//zmk'}`, `    shield: ${half}`)
    if (studio && keyboard.studio && central) {
      lines.push('    snippet: studio-rpc-usb-uart', '    cmake-args: -DCONFIG_ZMK_STUDIO=y')
    }
  })
  if (keyboard.type === 'shield') lines.push(`  - board: ${controller?.board ?? 'nice_nano//zmk'}`, '    shield: settings_reset')
  return lines.join('\n') + '\n'
}

/** Pin the template's `revision: v0.3` default to main. */
export function pinWestToMain(west: string): string {
  return west.replace(/(^[ \t]*revision:[ \t]*)v[\d.]+[ \t]*$/m, '$1main')
}

/** Workflow: use the reusable build workflow from main to match the pinned ZMK. */
export function pinWorkflowToMain(workflow: string): string {
  return workflow.replace(/(build-user-config\.yml)@v[\d.]+/, '$1@main')
}

/** Where the keymap goes in the new repo: config/<keyboard id>.keymap (ZMK looks it up by shield/board name). */
export function keymapFileName(kb: ZmkCatalogueKeyboard): string {
  return `${kb.id.replace(/\/\/.*$/, '')}.keymap`
}
