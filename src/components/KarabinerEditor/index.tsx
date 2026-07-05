import { useState, useCallback } from 'react'
import { Download, Copy, Check } from 'lucide-react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import { RuleList } from './RuleList'
import MacbookKeyboard from './MacbookKeyboard'
import MacComboEditor from './MacComboEditor'
import HomerowModEditor from './HomerowModEditor'

export default function KarabinerEditor() {
  const { profileTitle, setTitle, exportJSON, rules } = useKarabinerStore()
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showInstall, setShowInstall] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleExportAndInstall = useCallback(() => {
    const json = exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ultimate-keyboards.json'
    a.click()
    URL.revokeObjectURL(url)
    setShowInstall(true)
  }, [exportJSON])

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div className="toolbar">
        <span className="toolbar-title">MacBook Keys</span>
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
          <button className="btn btn-primary" onClick={handleExportAndInstall}>
            <Download size={13} />
            Download JSON
          </button>
        </div>
      </div>

      {showInstall && (
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
              Downloaded! Run this in Terminal to install:
            </span>
            <button
              onClick={() => setShowInstall(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code className="mono" style={{ flex: 1, userSelect: 'all', wordBreak: 'break-all' }}>
              cp ~/Downloads/ultimate-keyboards.json ~/.config/karabiner/assets/complex_modifications/
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
            Then open Karabiner-Elements → Complex Modifications → Add rule → enable "Ultimate Keyboards"
          </span>
        </div>
      )}

      {/* MacBook keyboard visual — click any key to open binding popover */}
      <div className="anim-fade-up" style={{
        padding: '20px 28px 0',
        borderBottom: '.5px solid var(--border)',
        background: 'var(--bg-grouped)',
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

      {/* Toast */}
      {toast && (
        <div className="toast">
          <span style={{ color: 'var(--success)', marginRight: 8 }}>✓</span>
          {toast}
        </div>
      )}
    </div>
  )
}
