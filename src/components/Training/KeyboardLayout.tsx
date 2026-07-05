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
                className={`keycap${isHighlighted ? ' selected' : ''}`}
                style={{
                  width: '40px',
                  height: '40px',
                  fontSize: '14px',
                  fontWeight: isHighlighted ? 700 : 400,
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
