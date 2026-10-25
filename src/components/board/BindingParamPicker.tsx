import { useState, useRef, useMemo } from 'react'
import { Popover } from '@/components/ui'

export default function BindingParamPicker({
  options, value, onChange, label = "Choose a value", allowCustom = true, hint = "Modifier wraps work: LG(A)=⌘A · LS=⇧ · LC=⌃ · LA=⌥ — nestable",
}: { options: string[]; value: string; onChange: (v: string) => void; label?: string; allowCustom?: boolean; hint?: string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState({ x: 0, y: 0, top: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 40)
    const q = query.toLowerCase()
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 40)
  }, [query, options])

  function handleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setAnchor({ x: r.left, y: r.bottom + 4, top: r.top - 4 })
    }
    setOpen(v => !v)
  }

  const display = value || '—'

  return (
    <div style={{ display: 'inline-block', minWidth: 90 }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="btn btn-secondary btn-sm"
        style={{
          fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', maxWidth: 160,
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        title={value}
        aria-label={label}
        aria-expanded={open}
      >
        {display} ▾
      </button>
      {open && (
        <Popover
          anchor={anchor}
          width={220}
          layer="menu"
          noBackdrop
          label={label}
          onClose={() => setOpen(false)}
          onOutsideMouseDown={(t) => { if (!btnRef.current?.contains(t)) setOpen(false) }}
        >
        <div style={{ maxHeight: 260, display: 'flex', flexDirection: 'column' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label={`Search ${label}`}
            placeholder={allowCustom ? "Search or type any keycode…" : "Search…"}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault(); e.stopPropagation()
                // Prefer exact/filtered match, else accept the raw text —
                // covers modifier wraps like LG(LS(N4)) and uncommon codes
                const pick = filtered.length > 0 && !query ? filtered[0]
                  : filtered.find(o => o.toLowerCase() === query.toLowerCase()) ?? (allowCustom ? query.trim() || filtered[0] : filtered[0])
                if (pick) { onChange(pick); setOpen(false); setQuery('') }
              }
            }}
            style={{ margin: 6, fontSize: 11 }}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Raw entry: whatever was typed is always usable */}
            {allowCustom && query.trim() && !filtered.some(o => o.toLowerCase() === query.trim().toLowerCase()) && (
              <button type="button"
                onClick={() => { onChange(query.trim()); setOpen(false); setQuery('') }}
                style={{
                  padding: '5px 10px', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'var(--font-mono)', color: 'var(--accent)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                Use “{query.trim()}”
              </button>
            )}
            {filtered.map(opt => (
              <button type="button"
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); setQuery('') }}
                className="menu-item"
                aria-pressed={opt === value}
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
              >
                {opt}
              </button>
            ))}
          </div>
          {hint && <div style={{ padding: '5px 10px', fontSize: 9.5, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            {hint}
          </div>}
        </div>
        </Popover>
      )}
    </div>
  )
}
