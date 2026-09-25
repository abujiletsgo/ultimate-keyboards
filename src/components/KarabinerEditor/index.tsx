import { useState, useCallback } from 'react'
import { Download, Copy, Check } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from '@/lib/io'
import { useToast } from '@/components/ui'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { RuleList } from './RuleList'
import MacbookKeyboard from './MacbookKeyboard'
import MacComboEditor from './MacComboEditor'
import HomerowModEditor from './HomerowModEditor'

export default function KarabinerEditor() {
  const { profileTitle, setTitle, exportJSON, rules } = useKarabinerStore()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [installedPath, setInstalledPath] = useState<string | null>(null)

  const handleExportAndInstall = useCallback(async () => {
    const json = exportJSON()
    if (IS_TAURI) {
      try {
        const path = await invoke<string>('install_karabiner_rules', { title: profileTitle || 'Ultimate Keyboards', json })
        setInstalledPath(path)
        toast.success('Installed — enable it in Karabiner-Elements → Complex Modifications → Add rule')
      } catch (e) {
        toast.error(`Install failed: ${e}`)
      }
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ultimate-keyboards.json'
    a.click()
    URL.revokeObjectURL(url)
    setInstalledPath('download')
  }, [exportJSON, profileTitle, toast])

  const handleCopyJSON = useCallback(async () => {
    const json = exportJSON()
    try {
      await navigator.clipboard.writeText(json)
    } catch {
      const el = document.createElement('textarea')
      el.value = json
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [exportJSON])
  const showToast = (m: string) => toast.success(m)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div className="section-header">
        <span className="section-title">MacBook Keys</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            value={profileTitle}
            onChange={e => setTitle(e.target.value)}
            placeholder="Profile name…"
            style={{ width: 200 }}
          />
          <button className="btn btn-secondary" onClick={handleCopyJSON}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <button className="btn btn-primary" onClick={handleExportAndInstall} disabled={rules.length === 0}>
            <Download size={13} />
            {IS_TAURI ? 'Install to Karabiner' : 'Download JSON'}
          </button>
        </div>
      </div>

      {installedPath && (
        <div className="panel-inset anim-fade-up" style={{
          margin: '0 20px',
          padding: '12px 16px',
          background: 'rgba(74,222,128,0.08)',
          borderColor: 'rgba(74,222,128,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
              {installedPath === 'download' ? 'Downloaded! Run this in Terminal to install:' : 'Installed. Now enable it in Karabiner-Elements:'}
            </span>
            <button
              aria-label="Dismiss"
              onClick={() => setInstalledPath(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code className="mono" style={{ flex: 1, userSelect: 'all', wordBreak: 'break-all' }}>
              {installedPath === 'download' ? 'cp ~/Downloads/ultimate-keyboards.json ~/.config/karabiner/assets/complex_modifications/' : installedPath}
            </code>
            <button
              className="btn btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText('cp ~/Downloads/ultimate-keyboards.json ~/.config/karabiner/assets/complex_modifications/')
                  .catch(() => {})
                showToast('Command copied!')
              }}
              style={{ flexShrink: 0 }}
            >
              <Copy size={13} />
              Copy
            </button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Open Karabiner-Elements → Complex Modifications → Add rule → enable "{profileTitle || 'Ultimate Keyboards'}". Re-install after every change here.
          </span>
        </div>
      )}

      {/* MacBook keyboard visual — click any key to open binding popover */}
      <div className="anim-fade-up" style={{
        padding: '20px 28px 0',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        <MacbookKeyboard rules={rules} />
      </div>

      {/* Rule list + editors */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px 20px' }}>
        <div className="glass anim-fade-up" style={{ overflow: 'hidden' }}>
          <RuleList />
        </div>
        <div className="glass anim-fade-up" style={{ padding: '16px 20px' }}>
          <HomerowModEditor />
        </div>
        <div className="glass anim-fade-up" style={{ padding: '16px 20px' }}>
          <MacComboEditor />
        </div>
      </div>

    </div>
  )
}
