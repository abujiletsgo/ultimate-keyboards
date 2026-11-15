import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from '../io'
import { KEY_TEMPLATES } from './index'
import { videoHref } from './video'

/** Same query string once the start-time `t` is set aside, so a video id or page id must match too. */
function sameQuery(a: URL, b: URL): boolean {
  const strip = (u: URL) => { const p = new URLSearchParams(u.search); p.delete('t'); p.sort(); return p.toString() }
  return strip(a) === strip(b)
}

/** The only links a template screen opens: each template's video and source page, as the catalog lists them. */
export function isCatalogLink(url: string): boolean {
  try {
    const target = new URL(url)
    if (target.protocol !== 'https:') return false
    return KEY_TEMPLATES.some(t => [t.video.url, t.source.url].some(known => {
      const k = new URL(known)
      return k.hostname === target.hostname && k.pathname === target.pathname && sameQuery(k, target)
    }))
  } catch { return false }
}

/**
 * Open a catalog link in the default browser (a video at its start time). Desktop uses the app's
 * `open_template_link` command, which must allow only catalog hosts; when it rejects, the caller shows
 * "Couldn't open the video. Copy the link instead."
 */
export async function openTemplateLink(link: { url: string; startSeconds?: number }): Promise<void> {
  const href = videoHref(link)
  if (!isCatalogLink(href)) throw new Error('That link is not in the template list.')
  if (IS_TAURI) await invoke('open_template_link', { url: href })
  else window.open(href, '_blank', 'noopener,noreferrer')
}
