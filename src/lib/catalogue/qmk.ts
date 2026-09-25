/**
 * QMK keyboards, fetched at runtime from the public QMK API
 * (keyboards.qmk.fm) and the QMK Configurator's default keymaps. QMK data is
 * GPL-2.0 and the Configurator defaults carry no licence, so nothing here is
 * bundled: only the keyboard *names* below ship with the app, and details are
 * downloaded when a user opens one (cached for the session).
 */
import { parseInfoJsonLayouts, type PhysicalLayout } from '@/lib/layout'

const API = 'https://keyboards.qmk.fm/v1'
const CONFIGURATOR = 'https://raw.githubusercontent.com/qmk/qmk_configurator/master/public/keymaps'

/** Popular split keyboards (paths verified against keyboard_list.json on 2026-09-25). Hints are what the
 *  keyboard is known for; the fetched info.json is the source of truth. */
export const QMK_POPULAR: { path: string; name: string; pointing?: 'trackball' | 'trackpad' }[] = [
  { path: 'crkbd/rev1', name: 'Corne (crkbd)' },
  { path: 'lily58/rev1', name: 'Lily58' },
  { path: 'sofle/rev1', name: 'Sofle' },
  { path: 'sofle/keyhive', name: 'Sofle (keyhive)' },
  { path: 'sofle_choc', name: 'Sofle Choc' },
  { path: 'splitkb/kyria/rev3', name: 'Kyria rev3' },
  { path: 'splitkb/kyria/rev2/base', name: 'Kyria rev2' },
  { path: 'splitkb/aurora/corne/rev1', name: 'Aurora Corne' },
  { path: 'splitkb/aurora/lily58/rev1', name: 'Aurora Lily58' },
  { path: 'splitkb/aurora/sofle_v2/rev1', name: 'Aurora Sofle v2' },
  { path: 'splitkb/aurora/sweep/rev1', name: 'Aurora Sweep' },
  { path: 'splitkb/aurora/helix/rev1', name: 'Aurora Helix' },
  { path: 'splitkb/halcyon/corne/rev2', name: 'Halcyon Corne' },
  { path: 'bastardkb/charybdis/3x5/blackpill', name: 'Charybdis Nano 3x5', pointing: 'trackball' },
  { path: 'bastardkb/charybdis/3x6/blackpill', name: 'Charybdis Mini 3x6', pointing: 'trackball' },
  { path: 'bastardkb/charybdis/4x6/blackpill', name: 'Charybdis 4x6', pointing: 'trackball' },
  { path: 'bastardkb/dilemma/3x5_3', name: 'Dilemma 3x5', pointing: 'trackpad' },
  { path: 'bastardkb/dilemma/4x6_4', name: 'Dilemma Max 4x6', pointing: 'trackpad' },
  { path: 'bastardkb/scylla/blackpill', name: 'Scylla' },
  { path: 'bastardkb/skeletyl/blackpill', name: 'Skeletyl' },
  { path: 'bastardkb/tbkmini/blackpill', name: 'TBK Mini' },
  { path: 'ferris/sweep', name: 'Ferris Sweep' },
  { path: 'keebio/iris/rev8', name: 'Iris rev8' },
  { path: 'keebio/iris/rev7', name: 'Iris rev7' },
  { path: 'keebio/quefrency/rev6', name: 'Quefrency' },
  { path: 'keebio/sinc/rev3', name: 'Sinc' },
  { path: 'keebio/levinson/rev3', name: 'Levinson' },
  { path: 'redox/rev1/base', name: 'Redox' },
  { path: 'ergodox_ez/base', name: 'ErgoDox EZ' },
  { path: 'zsa/moonlander', name: 'Moonlander' },
  { path: 'zsa/voyager', name: 'Voyager' },
  { path: 'handwired/dactyl_manuform/5x6', name: 'Dactyl Manuform 5x6' },
  { path: 'handwired/dactyl_manuform/4x6', name: 'Dactyl Manuform 4x6' },
  { path: 'handwired/tractyl_manuform/5x6_right/f411', name: 'Tractyl Manuform', pointing: 'trackball' },
  { path: 'boardsource/lulu/rp2040', name: 'Lulu' },
  { path: 'boardsource/unicorne', name: 'Unicorne' },
  { path: 'kagizaraya/chidori', name: 'Chidori' },
  { path: 'jones/v1', name: 'Jones' },
  { path: 'reviung/reviung41', name: 'Reviung41' },
  { path: '0xcb/splaytoraid', name: 'Splaytoraid' },
]

export interface QmkKeyboardDetails {
  path: string
  name: string
  manufacturer?: string
  url?: string
  split: boolean
  usb?: { vid?: string; pid?: string }
  features: string[]
  layouts: { id: string; layout: PhysicalLayout }[]
}

const cache = new Map<string, Promise<unknown>>()
function getJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(async r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return r.json()
    }).catch(e => { cache.delete(url); throw new Error(`Could not download ${url.replace(/^https:\/\//, '')} (${e instanceof Error ? e.message : e}). Check your internet connection.`) }))
  }
  return cache.get(url) as Promise<T>
}

/** Every QMK keyboard name (≈3,800), for search. */
export async function qmkKeyboardList(): Promise<string[]> {
  return (await getJson<{ keyboards: string[] }>(`${API}/keyboard_list.json`)).keyboards
}

export async function qmkKeyboardDetails(path: string): Promise<QmkKeyboardDetails> {
  const data = await getJson<{ keyboards: Record<string, Record<string, unknown>> }>(`${API}/keyboards/${path}/info.json`)
  const kb = data.keyboards[path]
  if (!kb) throw new Error(`QMK has no keyboard "${path}"`)
  const feats = Object.entries((kb.features ?? {}) as Record<string, boolean>).filter(([, on]) => on).map(([k]) => k)
  if ((kb as { pointing_device?: unknown }).pointing_device) feats.push('pointing_device')
  const layouts = parseInfoJsonLayouts(JSON.stringify({ layouts: kb.layouts }), path)
  return {
    path,
    name: (kb.keyboard_name as string) ?? path,
    manufacturer: kb.manufacturer as string | undefined,
    url: kb.url as string | undefined,
    split: !!(kb.split as { enabled?: boolean } | undefined)?.enabled,
    usb: kb.usb as { vid?: string; pid?: string } | undefined,
    features: feats,
    layouts,
  }
}

/** QMK Configurator default keymap: { keyboard, keymap, layout, layers: string[][] } in LAYOUT order. */
export interface QmkConfiguratorKeymap { keyboard: string; keymap: string; layout: string; layers: string[][] }

export async function qmkDefaultKeymap(path: string): Promise<QmkConfiguratorKeymap | null> {
  const file = `${path.replace(/\//g, '_')}_default.json`
  try { return await getJson<QmkConfiguratorKeymap>(`${CONFIGURATOR}/${path[0]}/${file}`) } catch { return null }
}
