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
      boxShadow: '1px 0 0 var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Drag region for native traffic lights */}
      <div
        data-tauri-drag-region
        style={{ height: 'var(--titlebar-h)', flexShrink: 0 }}
      />

      {/* App name */}
      <div style={{
        padding: '10px 14px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <Keyboard size={15} strokeWidth={1.5} style={{ color: 'var(--accent)', flexShrink: 0 }} />
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
        padding: '12px 14px 4px',
        fontSize: 'var(--text-11)',
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        Keyboards
      </div>

      {/* Nav items */}
      <nav style={{ padding: '2px 8px', display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: '28px',
                padding: '0 8px',
                borderRadius: 'var(--r-sm)',
                fontSize: 'var(--text-13)',
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                background: isActive
                  ? 'rgba(255,255,255,0.10)'
                  : 'transparent',
                boxShadow: isActive
                  ? '0 0 0 .5px rgba(255,255,255,0.07)'
                  : 'none',
                letterSpacing: '-0.01em',
                width: '100%',
                textAlign: 'left',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color = 'var(--text)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
            >
              <Icon
                size={14}
                strokeWidth={isActive ? 1.75 : 1.5}
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}
              />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '10px 14px',
        fontSize: 'var(--text-11)',
        color: 'var(--text-muted)',
        borderTop: '.5px solid var(--border)',
        letterSpacing: '0.01em',
      }}>
        v0.1.0
      </div>
    </aside>
  )
}
