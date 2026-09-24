import { FolderOpen, FileText, Keyboard } from 'lucide-react'

interface Props {
  onAddFromFolder: () => void
  onAddFromFile: () => void
}

/** First-run screen: shown while the registry has no keyboards. */
export default function Onboarding({ onAddFromFolder, onAddFromFile }: Props) {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div className="section-header">
        <span className="section-title">Welcome</span>
      </div>
      <div style={{ padding: 24, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="glass anim-fade-up" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="logo-mark" style={{ width: 36, height: 36 }}><Keyboard size={18} strokeWidth={2} /></span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Add your first keyboard</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Ultimate Keyboards edits the config files you already have — nothing is uploaded, nothing is copied.
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button className="btn btn-primary" onClick={onAddFromFolder} style={{ justifyContent: 'flex-start', padding: 14, height: 'auto', alignItems: 'flex-start', gap: 10 }}>
              <FolderOpen size={18} />
              <span style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>Choose a config folder</div>
                <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>A ZMK config repo (zmk-config) or a QMK keymap folder. Layout, keymap and pointing devices are detected.</div>
              </span>
            </button>
            <button className="btn btn-secondary" onClick={onAddFromFile} style={{ justifyContent: 'flex-start', padding: 14, height: 'auto', alignItems: 'flex-start', gap: 10 }}>
              <FileText size={18} />
              <span style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>Open a single .keymap</div>
                <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>Pick the layout from the catalogue.</div>
              </span>
            </button>
          </div>
        </div>

        <div className="glass anim-fade-up" style={{ padding: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>What is supported today</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>ZMK</strong>: layers, key bindings, combos, layer management, pointing-device tuning (Azoteq, PMW3610, Cirque). Keymaps using preprocessor conditionals inside <code className="mono">keymap</code> or local includes open read-only.</li>
            <li><strong>QMK</strong>: VIA layout JSON layers and <code className="mono">keymap.c</code> combos. Other C constructs are left untouched.</li>
            <li>Every save keeps a <code className="mono">.bak</code> and is validated before it is written.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
