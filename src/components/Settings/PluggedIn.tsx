/** Plugged in — placeholder until the device layer lands (Phase 7.5–7.7). */
import type { KeyboardDef } from '@/lib/registry/types'

export default function PluggedIn(_: { onAdd: (def: Omit<KeyboardDef, 'id' | 'createdAt'>) => void }) {
  return <div className="panel-inset" style={{ padding: 14, fontSize: 12 }}>USB detection is not wired yet.</div>
}
