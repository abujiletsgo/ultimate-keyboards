import { describe, expect, test } from 'bun:test'
import { parseBuildTargets, partBase, boardName } from '../src/lib/registry/parts'
import { detectKeyboard, DetectError, keyboardFromPath, qmkKeymapFacts, zmkCatalogueKeyboard, type DetectFs } from '../src/lib/registry/detect'
import { sleepConfChains } from '../src/lib/zmkSleepFiles'

/** In-memory folder tree: file path → text. Folders are implied by the paths. */
function memFs(files: Record<string, string>): DetectFs {
  return {
    async list(path) {
      const prefix = path.replace(/\/$/, '') + '/'
      const seen = new Map<string, boolean>()
      for (const f of Object.keys(files)) {
        if (!f.startsWith(prefix)) continue
        const rest = f.slice(prefix.length).split('/')
        seen.set(rest[0], (seen.get(rest[0]) ?? false) || rest.length > 1)
      }
      return [...seen].map(([name, isDirectory]) => ({ name, isDirectory }))
    },
    async read(path) { return files[path] ?? null },
  }
}

const KEYMAP = '/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };'

describe('build.yaml targets', () => {
  test('shield include list, with settings_reset dropped', () => {
    const y = `include:
  - board: nice_nano_v2
    shield: corne_left nice_view_adapter
  - board: nice_nano_v2
    shield: corne_right
  - board: nice_nano_v2
    shield: settings_reset
`
    // "corne_left nice_view_adapter" is one scalar; the first word is the keyboard
    const t = parseBuildTargets(y)
    expect(t.map(x => x.name)).toEqual(['corne_left', 'corne_right'])
    expect(t[1]).toEqual({ name: 'corne_right', kind: 'shield' })
  })

  test('board-only include list (Glove80) → board targets', () => {
    const y = `---
include:
  - board: glove80_lh
  - board: glove80_rh
`
    expect(parseBuildTargets(y)).toEqual([{ name: 'glove80_lh', kind: 'board' }, { name: 'glove80_rh', kind: 'board' }])
  })

  test('board with qualifiers and revision → bare board name', () => {
    expect(parseBuildTargets('include:\n  - board: nice60//zmk\n')).toEqual([{ name: 'nice60', kind: 'board' }])
    expect(boardName('nice_nano@2.0.0//zmk')).toBe('nice_nano')
    expect(boardName('bt60/nrf52840')).toBe('bt60')
  })

  test('older matrix form with inline and block lists', () => {
    const y = `board: [ "nice_nano_v2" ]
shield:
  - lily58_left
  - lily58_right
`
    expect(parseBuildTargets(y).map(t => t.name)).toEqual(['lily58_left', 'lily58_right'])
    expect(parseBuildTargets('board: [planck_rev6]\n')).toEqual([{ name: 'planck_rev6', kind: 'board' }])
  })

  test('comments and duplicates are ignored', () => {
    const y = `include:
  # - shield: old_left
  - board: nice_nano_v2
    shield: sofle_left
  - board: puchi_ble_v1
    shield: sofle_left
`
    expect(parseBuildTargets(y).map(t => t.name)).toEqual(['sofle_left'])
  })

  test('partBase strips every part suffix, nothing else', () => {
    expect(partBase('corne_left')).toBe('corne')
    expect(partBase('glove80_rh')).toBe('glove80')
    expect(partBase('totem_dongle')).toBe('totem')
    expect(partBase('nice60')).toBe('nice60')
    expect(partBase('left_hand')).toBe('left_hand')
  })
})

describe('ZMK catalogue match by build target', () => {
  test('Glove80 half, nice!60 board, Corne shield', () => {
    expect(zmkCatalogueKeyboard('glove80_lh')?.id).toBe('glove80')
    expect(zmkCatalogueKeyboard('nice60')?.id).toBe('nice60//zmk')
    expect(zmkCatalogueKeyboard('corne_right')?.id).toBe('corne')
    expect(zmkCatalogueKeyboard('my_handwired_thing')).toBeUndefined()
  })
})

describe('detectKeyboard: ZMK', () => {
  test('Glove80 board repo → catalogue layout and name, keymap named after the board first', async () => {
    const d = await detectKeyboard('/r/glove80-zmk-config', memFs({
      '/r/glove80-zmk-config/build.yaml': 'include:\n  - board: glove80_lh\n  - board: glove80_rh\n',
      '/r/glove80-zmk-config/config/a_other.keymap': KEYMAP,
      '/r/glove80-zmk-config/config/glove80.keymap': KEYMAP,
      '/r/glove80-zmk-config/config/west.yml': 'manifest: {}',
    }))
    expect(d?.firmware).toBe('zmk')
    expect(d?.shield).toBe('glove80')
    expect(d?.suggestedName).toBe(zmkCatalogueKeyboard('glove80')!.name)
    expect(d?.keymapCandidates[0]).toBe('/r/glove80-zmk-config/config/glove80.keymap')
    expect(d?.layoutCandidates.some(c => c.label.startsWith('Catalogue ·'))).toBe(true)
  })

  test('nice!60 single board repo', async () => {
    const d = await detectKeyboard('/r/n', memFs({
      '/r/n/build.yaml': 'include:\n  - board: nice60\n',
      '/r/n/config/nice60.keymap': KEYMAP,
    }))
    expect(d?.shield).toBe('nice60')
    expect(d?.layoutCandidates.length).toBeGreaterThan(0)
    expect(d?.layoutCandidates[0].layout.keys.length).toBe(61)
  })

  test('Corne shield repo', async () => {
    const d = await detectKeyboard('/r/c', memFs({
      '/r/c/build.yaml': 'include:\n  - board: nice_nano_v2\n    shield: corne_left\n  - board: nice_nano_v2\n    shield: corne_right\n',
      '/r/c/config/corne.keymap': KEYMAP,
    }))
    expect(d?.shield).toBe('corne')
    expect(d?.layoutCandidates[0].layout.keys.length).toBe(42)
  })

  test('a keymap folder with no build.yaml still detects as ZMK', async () => {
    const d = await detectKeyboard('/r/k', memFs({ '/r/k/my.keymap': KEYMAP }))
    expect(d?.firmware).toBe('zmk')
    expect(d?.keymapCandidates).toEqual(['/r/k/my.keymap'])
  })
})

const INFO = JSON.stringify({
  keyboard_name: 'Q1',
  layouts: {
    LAYOUT_ansi_82: { layout: [{ x: 0, y: 0, matrix: [0, 0] }, { x: 1, y: 0, matrix: [0, 1] }, { x: 2, y: 0, matrix: [0, 2] }] },
    LAYOUT_iso_83: { layout: [{ x: 0, y: 0, matrix: [0, 0] }, { x: 1, y: 0, matrix: [0, 1] }, { x: 2, y: 0, matrix: [0, 2] }, { x: 3, y: 0, matrix: [0, 3] }] },
  },
})

describe('detectKeyboard: QMK', () => {
  test('qmk_userspace with a Keychron keymap.json → keyboard path, layout macro first, keymap.c paired', async () => {
    const root = '/r/qmk_userspace'
    const km = `${root}/keyboards/keychron/q1v2/ansi_encoder/keymaps/me`
    const d = await detectKeyboard(root, memFs({
      [`${root}/qmk.json`]: '{"userspace_version":"1.0"}',
      [`${root}/README.md`]: '',
      [`${root}/keyboards/keychron/q1v2/info.json`]: INFO,
      [`${km}/keymap.json`]: JSON.stringify({ keyboard: 'keychron/q1v2/ansi_encoder', keymap: 'me', layout: 'LAYOUT_iso_83', layers: [['KC_A', 'KC_B', 'KC_C', 'KC_D']] }),
      [`${km}/keymap.c`]: '// combos',
      [`${root}/keyboards/keychron/q1v2/ansi_encoder/keymaps/default/keymap.c`]: '',
    }))
    expect(d?.firmware).toBe('qmk')
    expect(d?.shield).toBe('keychron/q1v2/ansi_encoder')
    expect(d?.suggestedName).toBe('Keychron Q1v2 Ansi Encoder')
    expect(d?.keymapCandidates).toEqual([`${km}/keymap.json`])
    expect(d?.keymapCPath).toBe(`${km}/keymap.c`)
    expect(d?.qmk).toEqual({ keyboard: 'keychron/q1v2/ansi_encoder', layout: 'LAYOUT_iso_83', keyCount: 4, perLayoutKey: true })
    expect(d?.layoutCandidates[0].layout.name).toBe('LAYOUT_iso_83')
  })

  test('VIA export at the folder root: matrix order, keyboard unknown, no layout → note', async () => {
    const d = await detectKeyboard('/r/via', memFs({
      '/r/via/gmmk-pro.json': JSON.stringify({ name: 'GMMK Pro', vendorProductId: 0x320f5044, layers: [Array(96).fill('KC_NO')] }),
    }))
    expect(d?.firmware).toBe('qmk')
    expect(d?.qmk).toEqual({ keyboard: undefined, layout: undefined, keyCount: 96, perLayoutKey: false })
    expect(d?.layoutCandidates).toEqual([])
    expect(d?.notes.join(' ')).toContain('pick a layout')
  })

  test('keymap JSON without local info.json names the keyboard to download', async () => {
    const d = await detectKeyboard('/r/m', memFs({
      '/r/m/keymap.json': JSON.stringify({ keyboard: 'planck/rev6', layout: 'LAYOUT_ortho_4x12', layers: [Array(48).fill('KC_A')] }),
    }))
    expect(d?.shield).toBe('planck/rev6')
    expect(d?.suggestedName).toBe('Planck')
    expect(d?.notes.join(' ')).toContain('downloaded from QMK')
  })

  test('keymap.c only → DetectError with the c2json command', async () => {
    const root = '/r/u'
    const p = detectKeyboard(root, memFs({ [`${root}/keyboards/crkbd/rev1/keymaps/tom/keymap.c`]: 'const uint16_t keymaps[] = {};' }))
    await expect(p).rejects.toBeInstanceOf(DetectError)
    await expect(p).rejects.toThrow('qmk c2json -kb crkbd/rev1 -km tom')
  })

  test('nothing recognisable → null', async () => {
    expect(await detectKeyboard('/r/e', memFs({ '/r/e/notes.txt': 'hi', '/r/e/package.json': '{"layers":[["x"]]}' }))).toBeNull()
  })

  test('keymap facts and keyboard-from-path', () => {
    expect(qmkKeymapFacts('not json', 'x')).toBeNull()
    expect(qmkKeymapFacts('{"layers":[]}', 'x')).toBeNull()
    expect(qmkKeymapFacts('{"layers":[[1,2]]}', 'x')).toBeNull()
    expect(keyboardFromPath('/a/keyboards/gmmk/pro/rev1/ansi/keymaps/x/keymap.json')).toBe('gmmk/pro/rev1/ansi')
    expect(keyboardFromPath('/a/keymaps/x/keymap.json')).toBeUndefined()
  })
})

describe('deep-sleep .conf chains', () => {
  test('split shield: shield folder, shared, per half', () => {
    const t = parseBuildTargets('include:\n  - shield: corne_left\n  - shield: corne_right\n')
    expect(sleepConfChains(t, 'corne', '/r/config', ['corne'])).toEqual([
      { name: 'corne_left', chain: ['/r/config/boards/shields/corne/corne_left.conf', '/r/config/corne.conf', '/r/config/corne_left.conf'] },
      { name: 'corne_right', chain: ['/r/config/boards/shields/corne/corne_right.conf', '/r/config/corne.conf', '/r/config/corne_right.conf'] },
    ])
  })

  test('Glove80 boards: config/glove80.conf then config/glove80_lh.conf (ZMK post_boards_shields.cmake), no shield folder', () => {
    const t = parseBuildTargets('include:\n  - board: glove80_lh\n  - board: glove80_rh\n')
    expect(sleepConfChains(t, undefined, '/r/config', ['glove80'])).toEqual([
      { name: 'glove80_lh', chain: ['/r/config/glove80.conf', '/r/config/glove80_lh.conf'] },
      { name: 'glove80_rh', chain: ['/r/config/glove80.conf', '/r/config/glove80_rh.conf'] },
    ])
  })

  test('single board: one part, one file', () => {
    const t = parseBuildTargets('include:\n  - board: nice60\n')
    expect(sleepConfChains(t, 'nice60', '/r/config', [])).toEqual([{ name: 'nice60', chain: ['/r/config/nice60.conf'] }])
  })

  test('no targets and no shield → nothing to set', () => {
    expect(sleepConfChains([], undefined, '/r/config', [])).toEqual([])
  })
})
