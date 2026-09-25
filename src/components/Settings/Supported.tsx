/** Settings › What is supported — rendered from lib/supported (same source as docs/user/supported.md). */
import { useMemo } from 'react'
import { LEVEL_LABEL, supportMatrix, type Level } from '@/lib/supported'

const COLOR: Record<Level, string> = { yes: 'var(--success)', partial: 'var(--warning)', no: 'var(--text-muted)' }

export default function Supported() {
  const groups = useMemo(() => supportMatrix(), [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(g => (
        <div key={g.title}>
          <div className="field-label" style={{ marginBottom: 6 }}>{g.title}</div>
          <table className="support-table">
            <tbody>
              {g.rows.map(r => (
                <tr key={r.feature}>
                  <th scope="row">{r.feature}</th>
                  <td style={{ color: COLOR[r.level], fontWeight: 600, whiteSpace: 'nowrap' }}>{LEVEL_LABEL[r.level]}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
