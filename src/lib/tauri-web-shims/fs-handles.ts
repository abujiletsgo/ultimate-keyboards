// Registry mapping `web://<name>` pseudo-paths to live FileSystemFileHandles,
// shared between the dialog shim (which acquires handles) and the fs shim
// (which reads/writes through them).

const handles = new Map<string, FileSystemFileHandle>()

export function registerHandle(handle: FileSystemFileHandle): string {
  const path = `web://${handle.name}`
  handles.set(path, handle)
  return path
}

export function getHandle(path: string): FileSystemFileHandle | undefined {
  return handles.get(path)
}

/** Register a plain File (from <input type=file> fallback) for read-only use. */
const files = new Map<string, File>()

export function registerFile(file: File): string {
  const path = `web-ro://${file.name}`
  files.set(path, file)
  return path
}

export function getFile(path: string): File | undefined {
  return files.get(path)
}
