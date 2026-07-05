import React, { useMemo } from 'react'
import { useKarabinerStore } from '@/stores/karabinerStore'
import type { HomerowModRule } from '@/lib/karabinerGenerator'

// Standard homerow positions: left hand = A S D F, right hand = J K L ;
const HOMEROW_KEYS: { key: string; label: string; hand: 'left' | 'right' }[] = [
  { key: 'a', label: 'A', hand: 'left' },
  { key: 's', label: 'S', hand: 'left' },
  { key: 'd', label: 'D', hand: 'left' },
  { key: 'f', label: 'F', hand: 'left' },
  { key: 'j', label: 'J', hand: 'right' },
  { key: 'k', label: 'K', hand: 'right' },
  { key: 'l', label: 'L', hand: 'right' },
  { key: 'semicolon', label: ';', hand: 'right' },
]

// Mod key options shown in the picker
const MOD_OPTIONS: { modKey: string; label: string; sym: string }[] = [
  { modKey: 'left_control', label: 'Control', sym: '⌃' },
  { modKey: 'left_option', label: 'Option', sym: '⌥' },
  { modKey: 'left_shift', label: 'Shift', sym: '⇧' },
  { modKey: 'left_command', label: 'Command', sym: '⌘' },
  { modKey: 'right_control', label: 'Control', sym: '⌃' },
  { modKey: 'right_option', label: 'Option', sym: '⌥' },
  { modKey: 'right_shift', label: 'Shift', sym: '⇧' },
  { modKey: 'right_command', label: 'Command', sym: '⌘' },
]

// Preset layouts
const PRESETS: { label: string; desc: string; mods: Record<string, string> }[] = [
  {
    label: 'GACS / SCAG',
    desc: 'A=⌃ S=⌥ D=⇧ F=⌘  •  J=⌘ K=⇧ L=⌥ ;=⌃',
    mods: {
      a: 'left_control', s: 'left_option', d: 'left_shift', f: 'left_command',
      j: 'right_command', k: 'right_shift', l: 'right_option', semicolon: 'right_control',
    },
  },
  {
    label: 'CAGS / SGAC',
    desc: 'A=⌘ S=⌥ D=⇧ F=⌃  •  J=⌃ K=⇧ L=⌥ ;=⌘',
    mods: {
      a: 'left_command', s: 'left_option', d: 'left_shift', f: 'left_control',
      j: 'right_control', k: 'right_shift', l: 'right_option', semicolon: 'right_command',
    },
  },
  {
    label: 'Miryoku',
    desc: 'A=⌘ S=⌥ D=⌃ F=⇧  •  J=⇧ K=⌃ L=⌥ ;=⌘',
    mods: {
      a: 'left_command', s: 'left_option', d: 'left_control', f: 'left_shift',
      j: 'right_shift', k: 'right_control', l: 'right_option', semicolon: 'right_command',
    },
  },
]

const s = {
  btn: (active = false, danger = false): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
    backgroundColor: danger
      ? 'rgba(255,80,80,0.15)'
      : active ? 'var(--accent, #7c6aff)' : 'var(--bg-secondary, #2a2a2a)',
    color: danger ? '#ff6b6b' : active ? '#fff' : 'var(--text-secondary, #aaa)',
  }),
  select: {
    background: 'var(--bg-tertiary, #2a2a2a)',
    border: '1px solid var(--border, #3a3a3a)',
    borderRadius: 6,
    color: 'var(--text-primary, #eee)',
    padding: '3px 6px',
    fontSize: 11,
    cursor: 'pointer',
    outline: 'none',
  } as React.CSSProperties,
}

export const HomerowModEditor: React.FC = () => {
  const { rules, addRule, removeRule, updateRule } = useKarabinerStore()

  // Index all current homerow mod rules by their fromKey
  const modsByKey = useMemo(() => {
    const map = new Map<string, { rule: HomerowModRule; idx: number }>()
    rules.forEach((r, i) => {
      if (r.type === 'homerow_mod') map.set(r.fromKey, { rule: r as HomerowModRule, idx: i })
    })
    return map
  }, [rules])

  const isEnabled = (key: string) => modsByKey.has(key)

  function toggle(hk: { key: string; label: string }) {
    if (isEnabled(hk.key)) {
      const entry = modsByKey.get(hk.key)!
      removeRule(entry.idx)
    } else {
      // Default mod assignment: left hand → GACS, right hand → SCAG mirror
      const defaultMod = PRESETS[0].mods[hk.key] ?? 'left_control'
      addRule({
        type: 'homerow_mod',
        description: `${hk.label}: hold → ${defaultMod.replace('left_', '⌃⌥⇧⌘'[['left_control','left_option','left_shift','left_command'].indexOf(defaultMod)] ?? '?').replace('right_', '')}, tap → ${hk.label.toLowerCase()}`,
        fromKey: hk.key,
        tapKey: hk.key === 'semicolon' ? 'semicolon' : hk.key,
        modKey: defaultMod,
      })
    }
  }

  function setMod(hk: { key: string; label: string }, modKey: string) {
    const entry = modsByKey.get(hk.key)
    if (!entry) return
    const sym = MOD_OPTIONS.find(m => m.modKey === modKey)?.sym ?? modKey
    updateRule(entry.idx, {
      ...entry.rule,
      modKey,
      description: `${hk.label}: hold → ${sym}, tap → ${hk.label.toLowerCase()}`,
    })
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    // Remove all existing homerow mod rules first
    const toRemove = [...modsByKey.values()].map(e => e.idx).sort((a, b) => b - a)
    toRemove.forEach(idx => removeRule(idx))
    // Add new ones from preset
    HOMEROW_KEYS.forEach(hk => {
      const modKey = preset.mods[hk.key]
      if (!modKey) return
      const sym = MOD_OPTIONS.find(m => m.modKey === modKey)?.sym ?? modKey
      addRule({
        type: 'homerow_mod',
        description: `${hk.label}: hold → ${sym}, tap → ${hk.label.toLowerCase()}`,
        fromKey: hk.key,
        tapKey: hk.key === 'semicolon' ? 'semicolon' : hk.key,
        modKey,
      })
    })
  }

  function clearAll() {
    const toRemove = [...modsByKey.values()].map(e => e.idx).sort((a, b) => b - a)
    toRemove.forEach(idx => removeRule(idx))
  }

  const enabledCount = modsByKey.size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary, #eee)' }}>
            Homerow Mods {enabledCount > 0 && <span style={{ color: 'var(--accent,#7c6aff)', fontSize: 12 }}>({enabledCount} active)</span>}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted, #666)' }}>
            Hold a homerow key to send a modifier. Tap it normally to type the letter.
          </p>
        </div>
        {enabledCount > 0 && (
          <button style={s.btn(false, true)} onClick={clearAll}>Clear all</button>
        )}
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary, #aaa)' }}>Presets</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button key={p.label} style={s.btn()} onClick={() => applyPreset(p)}
              title={p.desc}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Per-key controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['left', 'right'].map(hand => (
          <div key={hand} style={{
            flex: 1, minWidth: 200,
            background: 'var(--bg-secondary, #1e1e1e)',
            border: '1px solid var(--border, #3a3a3a)',
            borderRadius: 8, padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #666)', textTransform: 'uppercase', letterSpacing: 1 }}>
              {hand} hand
            </span>
            {HOMEROW_KEYS.filter(hk => hk.hand === hand).map(hk => {
              const entry = modsByKey.get(hk.key)
              const active = !!entry
              const modKey = entry?.rule.modKey ?? ''
              const modOpts = MOD_OPTIONS.filter(m => m.modKey.startsWith(hand === 'left' ? 'left_' : 'right_'))

              return (
                <div key={hk.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: active ? 1 : 0.5,
                  transition: 'opacity 0.15s',
                }}>
                  {/* Toggle */}
                  <div
                    onClick={() => toggle(hk)}
                    style={{
                      width: 32, height: 20, borderRadius: 10, cursor: 'pointer',
                      background: active ? 'var(--accent, #7c6aff)' : 'var(--bg-tertiary, #333)',
                      position: 'relative', transition: 'background 0.15s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, left: active ? 14 : 2,
                      width: 16, height: 16, borderRadius: 8,
                      background: '#fff', transition: 'left 0.15s',
                    }} />
                  </div>

                  {/* Key label */}
                  <span style={{
                    fontSize: 13, fontFamily: 'monospace', fontWeight: 600,
                    color: active ? 'var(--text-primary, #eee)' : 'var(--text-muted, #666)',
                    width: 16, textAlign: 'center',
                  }}>
                    {hk.label}
                  </span>

                  <span style={{ fontSize: 11, color: 'var(--text-muted, #555)' }}>hold →</span>

                  {/* Modifier picker */}
                  <select
                    disabled={!active}
                    style={{ ...s.select, opacity: active ? 1 : 0.3 }}
                    value={modKey}
                    onChange={e => setMod(hk, e.target.value)}
                  >
                    <option value="">—</option>
                    {modOpts.map(m => (
                      <option key={m.modKey} value={m.modKey}>{m.sym} {m.label}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Hint */}
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted, #555)', lineHeight: 1.5 }}>
        Tap threshold: 120ms — typing normally won't trigger mods.
        Works best with touch-typing. Conflicts with combos that use the same keys.
      </p>
    </div>
  )
}

export default HomerowModEditor
