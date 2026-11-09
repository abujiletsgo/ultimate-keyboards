/** Device keymap backups: Documents/Ultimate Keyboards/device-backups/<name>-<time>.json */
import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs'
import { documentDir, join } from '@tauri-apps/api/path'
import type { DeviceSnapshot } from './snapshot'

export async function saveDeviceBackup(name: string, snap: DeviceSnapshot): Promise<string> {
  const dir = await join(await documentDir(), 'Ultimate Keyboards', 'device-backups')
  await mkdir(dir, { recursive: true })
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'keyboard'
  const path = await join(dir, `${safe}-${snap.takenAt.replace(/[:.]/g, '-')}.json`)
  await writeTextFile(path, JSON.stringify(snap, null, 2) + '\n')
  return path
}
