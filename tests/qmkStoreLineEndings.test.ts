import { describe, expect, mock, test } from 'bun:test'

// In-memory disk behind lib/io (not Tauri, so saveText writes in place).
const disk = new Map<string, string>()
mock.module('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (p: string) => disk.get(p) ?? Promise.reject(new Error(`no file ${p}`)),
  writeTextFile: async (p: string, c: string) => { disk.set(p, c) },
  exists: async (p: string) => disk.has(p),
  copyFile: async () => {}, remove: async () => {}, rename: async () => {},
}))
const { useQMKStore } = await import('../src/stores/qmkStore')

const base = { name: 'corne', vendorProductId: 1, layers: [['KC_A', 'KC_B'], ['KC_C', 'KC_D']] }
const lf = JSON.stringify(base, null, 2)
const crlf = (s: string) => s.replace(/\n/g, '\r\n')

async function editAndSave(text: string): Promise<string> {
  const path = `/k-${Math.random()}.json`
  disk.set(path, text)
  const s = useQMKStore.getState()
  await s.load(path)
  expect(useQMKStore.getState().loadError).toBeNull()
  useQMKStore.getState().updateLayerKey(0, 0, 'KC_Z')
  await useQMKStore.getState().save()
  return disk.get(path)!
}

describe('QMK/VIA keymap save keeps line endings', () => {
  test('CRLF with final newline stays CRLF with final newline', async () => {
    const out = await editAndSave(crlf(lf + '\n'))
    expect(out).toContain('"KC_Z"')
    expect(out.endsWith('}\r\n')).toBe(true)
    expect(/(^|[^\r])\n/.test(out)).toBe(false)
    expect(out).toBe(crlf(JSON.stringify({ ...base, layers: [['KC_Z', 'KC_B'], ['KC_C', 'KC_D']] }, null, 2) + '\n'))
  })
  test('CRLF without final newline gets none', async () => {
    const out = await editAndSave(crlf(lf))
    expect(out.endsWith('}')).toBe(true)
    expect(out).toContain('\r\n')
    expect(/(^|[^\r])\n/.test(out)).toBe(false)
  })
  test('LF with final newline stays LF with final newline', async () => {
    const out = await editAndSave(lf + '\n')
    expect(out.endsWith('}\n')).toBe(true)
    expect(out).not.toContain('\r')
  })
  test('LF without final newline is unchanged in shape', async () => {
    const out = await editAndSave(lf)
    expect(out).toBe(JSON.stringify({ ...base, layers: [['KC_Z', 'KC_B'], ['KC_C', 'KC_D']] }, null, 2))
  })
})
