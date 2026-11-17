import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { downloadDir, join } from '@tauri-apps/api/path'
import { basename } from '@/lib/paths'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { ConfirmBanner, useToast } from '@/components/ui'
import { IS_TAURI, readText, saveText } from '@/lib/io'
import { hostOS } from '@/lib/platform'
import { cloneMacProfile } from '@/lib/macLayerEditing'
import { countSwapped, exportFileName, osName, parseProfile, profileForHost, serializeProfile, type ParsedProfile } from '@/lib/profileTransfer'

const FILTERS = [{ name: 'Keyboard profile', extensions: ['json'] }]

/** The words for a swap on this computer: "Cmd for Ctrl" on Windows, "Ctrl for Cmd" on a Mac. */
export function swapWords(host = hostOS()): string {
  return host === 'windows' ? 'Cmd for Ctrl' : 'Ctrl for Cmd'
}

/** What the import banner says before anything changes. */
export function importMessage(parsed: ParsedProfile, host = hostOS()): string {
  const n = parsed.profile.rules.length
  const base = `Replace your keys with “${parsed.profile.profileTitle}” (${n} ${n === 1 ? 'change' : 'changes'})?`
  if (parsed.from === host) return base
  const swapped = countSwapped(parsed.profile)
  if (swapped === 0) return `${base} It was made on ${parsed.from === 'mac' ? 'a Mac' : 'Windows'}; nothing in it uses Cmd or Ctrl.`
  return `${base} It was made on ${parsed.from === 'mac' ? 'a Mac' : 'Windows'}. Swap ${swapWords(host)} in ${swapped} of them so shortcuts like copy and paste still work here.`
}

/**
 * Export and import for the laptop-keys profile. `buttons` go in the action bar; `banner` (the confirm
 * step before an import replaces the keys) goes on its own row under it.
 */
export function useProfileTransfer() {
  const toast = useToast()
  const [pending, setPending] = useState<ParsedProfile | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const host = hostOS()

  const exportProfile = async () => {
    const text = serializeProfile(cloneMacProfile(useKarabinerStore.getState()), host)
    const name = exportFileName(host)
    try {
      if (!IS_TAURI) {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
        Object.assign(document.createElement('a'), { href: url, download: name }).click()
        URL.revokeObjectURL(url)
        return
      }
      const dir = await downloadDir().catch(() => '')
      const target = await saveDialog({ defaultPath: dir ? await join(dir, name) : name, filters: FILTERS })
      if (!target) return
      await saveText(target, text)
      toast.success(`Exported ${basename(target)}`)
    } catch (error) { toast.error(`Export failed: ${error instanceof Error ? error.message : error}`) }
  }

  const readFile = (text: string) => {
    try { setPending(parseProfile(text)) } catch (error) { toast.error(error instanceof Error ? error.message : String(error)) }
  }

  const importProfile = async () => {
    if (!IS_TAURI) { fileInput.current?.click(); return }
    try {
      const picked = await openDialog({ multiple: false, directory: false, filters: FILTERS })
      if (typeof picked !== 'string') return
      readFile(await readText(picked))
    } catch (error) { toast.error(`Import failed: ${error instanceof Error ? error.message : error}`) }
  }

  const apply = (swap: boolean) => {
    if (!pending) return
    useKarabinerStore.getState().importProfile(profileForHost(pending, host, swap))
    const swapped = swap && pending.from !== host && countSwapped(pending.profile) > 0
    setPending(null)
    toast.success(`Imported${swapped ? ` with ${swapWords(host)} swapped` : ''}. Save to keep it.`)
  }

  const crossOS = pending !== null && pending.from !== host && countSwapped(pending.profile) > 0
  const buttons = <>
    <button className="btn btn-ghost btn-sm" title={`Save these keys to a file you can import on a ${host === 'mac' ? 'Windows PC' : 'Mac'} or another ${osName(host)}`} onClick={exportProfile}>
      <Download size={13} /> Export
    </button>
    <button className="btn btn-ghost btn-sm" title="Load keys from an exported file" onClick={importProfile}>
      <Upload size={13} /> Import
    </button>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-hidden="true" tabIndex={-1}
      onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) readFile(await file.text()) }} />
  </>
  const banner = pending && <ConfirmBanner message={importMessage(pending, host)}
    confirmLabel={crossOS ? 'Import and swap' : 'Import'}
    extra={crossOS ? <button className="btn btn-secondary btn-sm" onClick={() => apply(false)}>Import as is</button> : undefined}
    onConfirm={() => apply(true)} onCancel={() => setPending(null)} />
  return { buttons, banner }
}
