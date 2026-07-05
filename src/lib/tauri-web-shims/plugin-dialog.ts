// Browser implementation of @tauri-apps/plugin-dialog.
// Uses the File System Access API (Chrome/Edge) so the returned pseudo-path
// carries a writable FileSystemFileHandle — Save writes back to the real file.
// Falls back to <input type=file> (read-only + download-on-save) elsewhere.

import { registerHandle, registerFile } from './fs-handles'

interface OpenOptions {
  multiple?: boolean
  filters?: Array<{ name: string; extensions: string[] }>
}

function toAcceptTypes(filters?: OpenOptions['filters']) {
  if (!filters?.length) return undefined
  return filters.map(f => ({
    description: f.name,
    accept: { 'text/plain': f.extensions.map(e => `.${e}` as `.${string}`) },
  }))
}

export async function open(options?: OpenOptions): Promise<string | null> {
  // Modern path: real handle, enables in-place save
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        multiple: false,
        types: toAcceptTypes(options?.filters),
        excludeAcceptAllOption: false,
      })
      return handle ? registerHandle(handle) : null
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null
      throw err
    }
  }

  // Fallback: hidden input, read-only
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    const exts = options?.filters?.flatMap(f => f.extensions.map(e => `.${e}`))
    if (exts?.length) input.accept = exts.join(',')
    input.onchange = () => {
      const file = input.files?.[0]
      resolve(file ? registerFile(file) : null)
    }
    // Cancel detection (no change event fires)
    window.addEventListener('focus', () => setTimeout(() => {
      if (!input.files?.length) resolve(null)
    }, 300), { once: true })
    input.click()
  })
}

export async function save(_options?: unknown): Promise<string | null> {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker()
      return handle ? registerHandle(handle) : null
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return null
      throw err
    }
  }
  throw new Error('Save dialog not supported in this browser')
}
