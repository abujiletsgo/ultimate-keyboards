// Browser implementation of @tauri-apps/plugin-fs backed by the
// File System Access API. Files picked via the dialog shim register their
// FileSystemFileHandle here under a `web://` pseudo-path, so read/write
// round-trips work against the user's real local file in Chrome/Edge.
// Absolute OS paths (desktop auto-load) are not reachable from a browser —
// those throw a friendly error telling the user to use Open.

import { getHandle, getFile } from './fs-handles'

export async function readTextFile(path: string): Promise<string> {
  const handle = getHandle(path)
  if (handle) {
    const file = await handle.getFile()
    return file.text()
  }
  const roFile = getFile(path)
  if (roFile) return roFile.text()
  throw new Error(
    'Browser mode can’t auto-load files from disk paths. Click “Open” to pick the file — editing and saving will work from there. (The desktop app auto-loads.)',
  )
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  const handle = getHandle(path)
  if (handle) {
    const writable = await handle.createWritable()
    await writable.write(contents)
    await writable.close()
    return
  }
  // No live handle (e.g. picked via <input type=file> fallback) — download instead
  const name = path.replace(/^web(-ro)?:\/\//, '').split('/').pop() || 'keymap.keymap'
  const blob = new Blob([contents], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
  // No-op in browser
}
