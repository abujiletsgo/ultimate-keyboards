/**
 * Which .conf files a ZMK build merges for each part of a keyboard, read from
 * disk (lib/zmkSleep does the text logic).
 *
 * For each build.yaml shield `S` of this keyboard, Zephyr merges
 * `boards/shields/<dir>/S.conf`, then ZMK merges the user config
 * `config/<base>.conf` (shared by every part) and `config/S.conf`. Nothing
 * else: a `<base>.conf` inside the shield folder is never read. Boards with
 * the controller built in (Glove80, nice!60) merge `config/<base>.conf` and
 * `config/<board>.conf` the same way, without a shield folder.
 */
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { readText } from '@/lib/io'
import type { KeyboardDef } from '@/lib/registry/types'
import type { ConfFile, Part } from './zmkSleep'
import { parseBuildTargets, partBase, type BuildTarget } from '@/lib/registry/parts'

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
  const shieldsDir = join(configDir, 'boards', 'shields')
  const dirs = (await names(shieldsDir)).filter(e => e.dir).map(e => e.name)
  const plan = sleepConfChains(parseBuildTargets(buildYaml), kb.shield, configDir, dirs)
  return Promise.all(plan.map(async p => ({ name: p.name, chain: await Promise.all(p.chain.map(conf)) })))
}

/**
 * The .conf chain for each part, in merge order (pure; see the header).
 * Boards with the controller built in follow ZMK's post_boards_shields.cmake:
 * `config/<board folder>.conf` then `config/<BOARD>.conf`, e.g.
 * `config/glove80.conf` then `config/glove80_lh.conf`. A board has no
 * shield folder, so none is read for it.
 */
export function sleepConfChains(targets: BuildTarget[], shield: string | undefined, configDir: string, shieldDirs: string[]): { name: string; chain: string[] }[] {
  const base = shield ?? (targets[0] ? partBase(targets[0].name) : undefined)
  if (!base) return []
  let mine = targets.filter(t => t.name === base || partBase(t.name) === base)
  if (mine.length === 0) mine = [{ name: base, kind: 'shield' }]

  const shieldsDir = join(configDir, 'boards', 'shields')
  const dir = shieldDirs.find(d => d === base) ?? shieldDirs.find(d => mine.some(s => s.name.startsWith(d)))

  return mine.map(t => {
    const chain: string[] = []
    if (dir && t.kind === 'shield') chain.push(join(shieldsDir, dir, `${t.name}.conf`))
    if (base !== t.name) chain.push(join(configDir, `${base}.conf`))
    chain.push(join(configDir, `${t.name}.conf`))
    return { name: t.name, chain }
  })
}
