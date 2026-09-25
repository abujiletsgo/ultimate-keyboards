/** Open a GitHub page in the default browser (desktop: a GitHub-only Rust command; web: a new tab). */
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from '@/lib/io'

export async function openGithub(url: string): Promise<void> {
  if (IS_TAURI) await invoke('open_github_url', { url })
  else window.open(url, '_blank', 'noopener,noreferrer')
}
