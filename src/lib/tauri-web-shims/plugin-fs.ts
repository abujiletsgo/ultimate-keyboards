// Browser implementation of @tauri-apps/plugin-fs backed by the
// File System Access API. Files picked via the dialog shim register their
// FileSystemFileHandle here under a `web://` pseudo-path, so read/write
// round-trips work against the user's real local file in Chrome/Edge.
// Absolute OS paths (desktop auto-load) are not reachable from a browser —
// those throw a friendly error telling the user to use Open.

import { getHandle, getFile } from './fs-handles'

// Injected by vite `define` (dev server only); undefined in production builds.
declare const __DEV_FS_TOKEN__: string | undefined

export async function readTextFile(path: string): Promise<string> {
  const handle = getHandle(path)
  if (handle) {
    const file = await handle.getFile()
    return file.text()
  }
  const roFile = getFile(path)
  if (roFile) return roFile.text()
  // Dev server: vite serves absolute paths through /@fs/ (fs.allow gated)
  if (import.meta.env.DEV && path.startsWith('/')) {
    const res = await fetch(`/@fs${path}`)
    if (res.ok) return res.text()
  }
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
  // Dev server: write back to disk via the dev-only /__fs/write endpoint
  if (import.meta.env.DEV && path.startsWith('/')) {
    const res = await fetch('/__fs/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-Fs-Token': typeof __DEV_FS_TOKEN__ === 'string' ? __DEV_FS_TOKEN__ : '',
      },
      body: JSON.stringify({ path, contents }),
    })
    if (res.ok) return
    throw new Error(`Dev save failed: ${res.status} ${await res.text()}`)
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

// The atomic-save helpers in lib/io.ts only call these on desktop; in the
// browser there is no rename/copy, so saves write in place.
export async function exists(_path: string): Promise<boolean> {
  return false
}
export async function rename(_from: string, _to: string): Promise<void> {
  throw new Error('rename is not available in browser mode')
}
export async function copyFile(_from: string, _to: string): Promise<void> {
  throw new Error('copyFile is not available in browser mode')
}
export async function remove(_path: string): Promise<void> {
  throw new Error('remove is not available in browser mode')
}
