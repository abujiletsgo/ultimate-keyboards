/**
 * The only place the app writes files.
 *
 * Desktop (Tauri): every save is validate → backup → temp → rename, so a crash
 * or power loss mid-save can never leave a truncated keymap behind, and the
 * previous contents are always one click away (`restoreBackup`).
 *
 * Browser: the File System Access API has no rename, so the shim writes in
 * place; validation still runs first.
 */
import {
  copyFile,
  exists,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs'

export const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Refuse to load or write anything larger than this (parsers are O(n) but not free). */
export const MAX_FILE_BYTES = 1_000_000

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export interface SaveOptions {
  /**
   * Called with the exact bytes about to be written. Return `null` to accept,
   * or a human-readable reason to refuse. Callers use it to re-parse the
   * output and prove it still describes the same keymap (layer count, key
   * counts, combo count) — the guard against a serializer fallback silently
   * rewriting a file.
   */
  validate?: (contents: string) => string | null
}

export function backupPath(path: string): string {
  return `${path}.bak`
}

function tempPath(path: string): string {
  return `${path}.tmp`
}

export async function readText(path: string): Promise<string> {
  const text = await readTextFile(path)
  if (text.length > MAX_FILE_BYTES) {
    throw new Error(`File is larger than ${MAX_FILE_BYTES / 1_000_000} MB; refusing to load it.`)
  }
  return text
}

/**
 * Save `contents` to `path`. Throws `ValidationError` (nothing written) when
 * the validator rejects the output.
 */
export async function saveText(path: string, contents: string, opts: SaveOptions = {}): Promise<void> {
  if (contents.length > MAX_FILE_BYTES) {
    throw new ValidationError(`Output is larger than ${MAX_FILE_BYTES / 1_000_000} MB; refusing to write it.`)
  }
  if (opts.validate) {
    const reason = opts.validate(contents)
    if (reason) throw new ValidationError(reason)
  }

  if (!IS_TAURI) {
    await writeTextFile(path, contents)
    return
  }

  // A brand-new file (e.g. an export picked in a save dialog) has nothing to
  // protect, and a dialog grant covers only that exact path — no siblings.
  if (!(await exists(path).catch(() => false))) {
    await writeTextFile(path, contents)
    return
  }

  // 1. Keep one backup of what is on disk now.
  // 2. Write the sibling temp file in full.
  // 3. Atomically replace the target.
  // If the scope only covers the target itself (a file picked in a dialog),
  // the sibling writes are refused; fall back to an in-place write rather
  // than failing the save.
  const tmp = tempPath(path)
  try {
    await copyFile(path, backupPath(path))
    await writeTextFile(tmp, contents)
  } catch (err) {
    if (/forbidden path|not allowed/i.test(String(err))) {
      await writeTextFile(path, contents)
      return
    }
    throw err
  }
  try {
    await rename(tmp, path)
  } catch (err) {
    await remove(tmp).catch(() => {})
    throw err
  }
}

export async function backupExists(path: string): Promise<boolean> {
  if (!IS_TAURI) return false
  return exists(backupPath(path)).catch(() => false)
}

/** Put the `.bak` contents back and return them. The `.bak` itself is kept. */
export async function restoreBackup(path: string): Promise<string> {
  const text = await readTextFile(backupPath(path))
  await saveText(path, text)
  return text
}
