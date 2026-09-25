import { FolderOpen, Search, Usb } from 'lucide-react'
import LogoMark from '@/components/ui/LogoMark'
import type { HubTab } from '@/components/Settings/AddKeyboardHub'

interface Props {
  onStart: (tab: HubTab) => void
}

const CHOICES: { tab: HubTab; icon: typeof Usb; title: string; text: string; primary?: boolean }[] = [
  { tab: 'find', icon: Search, title: 'I just got a keyboard', text: 'Find it in the list of popular split keyboards and start from its default keymap.', primary: true },
  { tab: 'usb', icon: Usb, title: 'It is plugged in', text: 'Read the keymap that is on the keyboard now (ZMK Studio, Vial or VIA firmware).' },
  { tab: 'folder', icon: FolderOpen, title: 'I have a config folder', text: 'Open your zmk-config repo or QMK keymap folder.' },
]

/** First-run screen: shown while the registry has no keyboards. */
export default function Onboarding({ onStart }: Props) {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div className="section-header">
        <span className="section-title">Welcome</span>
      </div>
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="glass anim-fade-up" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="logo-mark" style={{ width: 36, height: 36 }}><LogoMark size={24} color="#fff" accent="#0a0c16" /></span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Set up your keyboard</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Pick whichever fits. You can add more keyboards later.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {CHOICES.map(c => (
              <button key={c.tab} className={`btn ${c.primary ? 'btn-primary' : 'btn-secondary'}`} onClick={() => onStart(c.tab)}
                style={{ justifyContent: 'flex-start', padding: 14, height: 'auto', alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                <c.icon size={18} />
                <span style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 400, whiteSpace: 'normal' }}>{c.text}</div>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
