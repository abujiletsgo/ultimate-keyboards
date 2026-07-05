interface KeyboardLayoutProps {
  highlighted: Set<string>
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

export default function KeyboardLayout({ highlighted }: KeyboardLayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      {ROWS.map((row) => (
        <div key={row} style={{ display: 'flex', gap: '6px' }}>
          {row.split('').map((key) => {
            const isHighlighted = highlighted.has(key)
            return (
              <div
                key={key}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: isHighlighted ? 700 : 400,
                  background: isHighlighted ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: isHighlighted ? 'white' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  transition: 'background 0.08s ease, color 0.08s ease',
                  userSelect: 'none',
                }}
              >
                {key}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
