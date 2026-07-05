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
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>
            Homerow Mods {enabledCount > 0 && <span style={{ color: 'var(--accent)', fontSize: 12 }}>({enabledCount} active)</span>}
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Hold a homerow key to send a modifier. Tap it normally to type the letter.
          </p>
        </div>
        {enabledCount > 0 && (
          <button className="btn btn-danger btn-sm" onClick={clearAll}>Clear all</button>
        )}
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Presets</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button key={p.label} className="btn btn-secondary btn-sm" onClick={() => applyPreset(p)}
              title={p.desc}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Per-key controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['left', 'right'].map(hand => (
          <div key={hand} className="panel-inset" style={{
            flex: 1, minWidth: 200,
            padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
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
                  transition: 'opacity var(--dur-1) var(--ease-out)',
                }}>
                  {/* Toggle */}
                  <div
                    onClick={() => toggle(hk)}
                    style={{
                      width: 32, height: 20, borderRadius: 10, cursor: 'pointer',
                      background: active ? 'var(--accent-grad)' : 'var(--bg-tertiary)',
                      position: 'relative', transition: 'background var(--dur-1) var(--ease-out)', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 2, left: active ? 14 : 2,
                      width: 16, height: 16, borderRadius: 8,
                      background: '#fff', transition: 'left var(--dur-1) var(--ease-out)',
                    }} />
                  </div>

                  {/* Key label */}
                  <span style={{
                    fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    color: active ? 'var(--text)' : 'var(--text-muted)',
                    width: 16, textAlign: 'center',
                  }}>
                    {hk.label}
                  </span>

                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>hold →</span>

                  {/* Modifier picker */}
                  <select
                    disabled={!active}
                    style={{ height: 26, fontSize: 11, opacity: active ? 1 : 0.3 }}
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
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Tap threshold: 120ms — typing normally won't trigger mods.
        Works best with touch-typing. Conflicts with combos that use the same keys.
      </p>
    </div>
  )
}

export default HomerowModEditor
