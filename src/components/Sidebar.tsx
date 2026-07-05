import type { CSSProperties } from 'react'
import { Keyboard, Command, Dumbbell, Settings } from 'lucide-react'
import type { Section } from '@/App'

const NAV = [
  { id: 'zmk' as Section, label: 'ZMK / QMK', icon: Keyboard },
  { id: 'karabiner' as Section, label: 'MacBook Keys', icon: Command },
  { id: 'training' as Section, label: 'Training', icon: Dumbbell },
  { id: 'settings' as Section, label: 'Settings', icon: Settings },
]

interface Props { active: Section; onNavigate: (s: Section) => void }

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      minWidth: 'var(--sidebar-w)',
      height: '100vh',
      background: 'var(--bg-sidebar)',
      backdropFilter: 'var(--blur-sidebar)',
      WebkitBackdropFilter: 'var(--blur-sidebar)',
      borderRight: '1px solid var(--glass-border)',
      boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.02)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
      zIndex: 20,
    }}>
      {/* Drag region for native traffic lights */}
      <div
        data-tauri-drag-region
        style={{ height: 'var(--titlebar-h)', flexShrink: 0 }}
      />

      {/* App name */}
      <div style={{
        padding: '10px 14px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span className="logo-mark">
          <Keyboard size={14} strokeWidth={2} />
        </span>
        <span style={{
          fontSize: 'var(--text-13)',
          fontWeight: 600,
          color: 'var(--text)',
          letterSpacing: '-0.02em',
        }}>
          Ultimate Keyboards
        </span>
      </div>

      {/* Section label */}
      <div style={{
        padding: '14px 16px 6px',
        fontSize: 'var(--text-11)',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        Keyboards
      </div>

      {/* Nav items */}
      <nav className="anim-stagger" style={{ padding: '2px 10px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {NAV.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`nav-item${id === active ? ' active' : ''}`}
            style={{ '--i': i } as CSSProperties}
          >
            <Icon size={15} strokeWidth={id === active ? 1.9 : 1.6} />
            {label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        fontSize: 'var(--text-11)',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
        letterSpacing: '0.01em',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: 3,
          background: 'var(--success)',
          boxShadow: '0 0 6px rgba(74,222,128,0.6)',
          display: 'inline-block',
        }} />
        v0.1.0
      </div>
    </aside>
  )
}
