import type { CSSProperties } from 'react'
import { Keyboard, Command, MousePointer2, Settings, Plus, Laptop } from 'lucide-react'
import LogoMark from '@/components/ui/LogoMark'
import type { KeyboardDef } from '@/lib/registry/types'
import { sameSection, type Section } from '@/lib/nav'

interface Props {
  keyboards: KeyboardDef[]
  active: Section
  onNavigate: (s: Section) => void
}

const HOST_NAV: { section: Section; label: string; icon: typeof Command }[] = [
  { section: { kind: 'karabiner' }, label: 'MacBook Keys', icon: Command },
  { section: { kind: 'mouse' }, label: 'Scroll & Mouse', icon: MousePointer2 },
]

function GroupLabel({ children }: { children: string }) {
  return (
    <div style={{
      padding: '14px 16px 6px',
      fontSize: 'var(--text-11)',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
    }}>
      {children}
    </div>
  )
}

export default function Sidebar({ keyboards, active, onNavigate }: Props) {
  let i = 0
  const item = (section: Section, label: string, Icon: typeof Command, extra?: CSSProperties, badge?: string) => {
    const isActive = sameSection(section, active)
    const idx = i++
    return (
      <button
        key={label + idx}
        onClick={() => onNavigate(section)}
        className={`nav-item${isActive ? ' active' : ''}`}
        style={{ '--i': idx, ...extra } as CSSProperties}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon size={15} strokeWidth={isActive ? 1.9 : 1.6} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>{label}</span>
        {badge && <span className={`fw-badge fw-${badge.toLowerCase()}`}>{badge}</span>}
      </button>
    )
  }

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
      <div data-tauri-drag-region style={{ height: 'var(--titlebar-h)', flexShrink: 0 }} />

      <div style={{ padding: '10px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="logo-mark"><LogoMark size={16} color="#fff" accent="#0a0c16" /></span>
        <span style={{ fontSize: 'var(--text-13)', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Ultimate Keyboards
        </span>
      </div>

      <nav className="anim-stagger" style={{ padding: '2px 10px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1, overflowY: 'auto' }}>
        <GroupLabel>Keyboards</GroupLabel>
        {keyboards.length === 0 && (
          <div style={{ padding: '4px 8px 6px', fontSize: 'var(--text-11)', color: 'var(--text-muted)' }}>
            No keyboards yet.
          </div>
        )}
        {keyboards.map(kb => item({ kind: 'keyboard', id: kb.id }, kb.name, Keyboard, undefined, kb.firmware.toUpperCase()))}
        {item({ kind: 'settings', add: 'find' }, 'Add keyboard…', Plus, { color: 'var(--text-muted)' })}

        <GroupLabel>This Mac</GroupLabel>
        {HOST_NAV.map(h => item(h.section, h.label, h.icon))}

        <GroupLabel>App</GroupLabel>
        {item({ kind: 'settings' }, 'Settings', Settings)}
      </nav>

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
        <Laptop size={12} strokeWidth={1.6} style={{ opacity: 0.6 }} />
        v{__APP_VERSION__}
      </div>
    </aside>
  )
}
