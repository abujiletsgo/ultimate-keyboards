/**
 * Which .conf files a ZMK build merges for each part of a keyboard, read from
 * disk (lib/zmkSleep does the text logic).
 *
 * For each build.yaml shield `S` of this keyboard, Zephyr merges
 * `boards/shields/<dir>/S.conf`, then ZMK merges the user config
 * `config/<base>.conf` (shared by every part) and `config/S.conf`. Nothing
 * else: a `<base>.conf` inside the shield folder is never read.
 */
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { readText } from '@/lib/io'
import type { KeyboardDef } from '@/lib/registry/types'
import type { ConfFile, Part } from './zmkSleep'
import { parseBuildTargets, partBase } from '@/lib/registry/parts'

const join = (...p: string[]) => p.join('/').replace(/\/+/g, '/')

async function names(path: string): Promise<{ name: string; dir: boolean }[]> {
  try { return (await readDir(path)).map(e => ({ name: e.name, dir: !!e.isDirectory })) } catch { return [] }
}

async function conf(path: string): Promise<ConfFile> {
  if (!(await exists(path).catch(() => false))) return { path, text: null }
  return { path, text: await readText(path) }
}

export async function loadSleepParts(kb: KeyboardDef): Promise<Part[]> {
  if (kb.firmware !== 'zmk' || !kb.repoPath) return []
  const root = await names(kb.repoPath)
  const configDir = root.some(e => e.name === 'config' && e.dir) ? join(kb.repoPath, 'config') : kb.repoPath

  const buildYaml = await readText(join(kb.repoPath, 'build.yaml')).catch(() => '')
  // shields, or boards with the controller built in (a board's user config is config/<board>.conf the same way)
  const all = parseBuildTargets(buildYaml).map(t => t.name)
  const base = kb.shield ?? (all[0] ? partBase(all[0]) : undefined)
  if (!base) return []
  let shields = all.filter(s => s === base || partBase(s) === base)
  if (shields.length === 0) shields = [base]

  const shieldsDir = join(configDir, 'boards', 'shields')
  const dirs = (await names(shieldsDir)).filter(e => e.dir).map(e => e.name)
  const dir = dirs.find(d => d === base) ?? dirs.find(d => shields.some(s => s.startsWith(d)))

  const parts: Part[] = []
  for (const s of shields) {
    const chain: string[] = []
    if (dir) chain.push(join(shieldsDir, dir, `${s}.conf`))
    if (base !== s) chain.push(join(configDir, `${base}.conf`))
    chain.push(join(configDir, `${s}.conf`))
    parts.push({ name: s, chain: await Promise.all(chain.map(conf)) })
  }
  return parts
}
