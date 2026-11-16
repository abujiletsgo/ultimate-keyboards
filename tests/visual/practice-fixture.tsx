/**
 * Browser fixture for the Try-it practice card, with the native remapper mocked.
 * ?native=running | stopped | setup   ?rule=combo | hold
 * running: keys typed here are judged as if the remapper delivered them (type h, i, then Enter).
 */
import { mockIPC } from '@tauri-apps/api/mocks'
import '../../src/styles/globals.css'
import '../../src/styles/ui.css'

const q = new URLSearchParams(location.search)
const native = q.get('native') ?? 'running'
const status = (state: string, enabled: boolean, installed = true) => ({
  protocolVersion: 1, state, message: '', driverReady: true, inputMonitoringGranted: installed, helperInstalled: installed,
  enabled, capturedDevices: enabled ? 1 : 0, profileTitle: 'Ultimate Keyboards',
})
let current = native === 'running' ? status('running', true) : native === 'setup' ? status('not_installed', false, false) : status('stopped', false)
mockIPC(async cmd => {
  if (cmd === 'native_remapping_status') return current
  if (cmd === 'native_remapping_apply') { await new Promise(r => setTimeout(r, 600)); current = status('running', true); return current }
  return null
})

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { ToastProvider } = await import('../../src/components/ui/Toast')
const PracticeCard = (await import('../../src/components/KarabinerEditor/PracticeCard')).default
const { nativeRemapping } = await import('../../src/lib/nativeRemapping')
const { DEFAULT_COMBOS, DEFAULT_RULES } = await import('../../src/lib/macDefaults')

nativeRemapping.startHeartbeat()
const rule = q.get('rule') === 'hold' ? DEFAULT_RULES.find(r => r.type === 'homerow_mod' && r.fromKey === 'f')! : DEFAULT_COMBOS[0]

function Fixture() {
  const [open, setOpen] = React.useState(true)
  return <div style={{ padding: 16, maxWidth: 760 }}>
    {open ? <PracticeCard rule={rule} onClose={() => setOpen(false)} onTurnOn={() => alert('to Remapping tab')} /> : <output>closed</output>}
  </div>
}
createRoot(document.getElementById('root')!).render(<ToastProvider><Fixture /></ToastProvider>)
