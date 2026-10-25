import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import BindingEditor from '../../src/components/ZMKEditor/BindingEditor'
import SplitKeyboard from '../../src/components/ZMKEditor/SplitKeyboard'
import '../../src/styles/globals.css'
import '../../src/styles/ui.css'
function Fixture() {
  const [editing, setEditing] = useState<'zmk' | 'qmk' | null>(null)
  const [zmk, setZmk] = useState('&lt 1 SPACE')
  const [qmk, setQmk] = useState('LT(1,KC_SPC)')
  return <div style={{ padding: 24 }}><div className="glass" style={{ padding: 20 }}>
    <button onClick={() => setEditing('zmk')}>Edit ZMK</button><button onClick={() => setEditing('qmk')}>Edit QMK</button>
    <output aria-label="ZMK binding">{zmk}</output><output aria-label="QMK binding">{qmk}</output>
    <SplitKeyboard layer={{ name: 'Base', keys: Array.from({ length: 42 }, (_, i) => i === 0 ? '&mt LCTRL A' : i === 1 ? zmk : '&kp A') } as any} onBindingChange={(_, binding) => setZmk(binding)} />
  </div>{editing && <BindingEditor firmware={editing} currentBinding={editing === 'zmk' ? zmk : qmk} anchorX={120} anchorY={100} anchorTop={60}
    onUpdate={binding => { (editing === 'zmk' ? setZmk : setQmk)(binding); setEditing(null) }} onCancel={() => setEditing(null)} />}</div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
