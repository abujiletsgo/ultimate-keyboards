/**
 * Browser fixture for the any-custom-keyboard screens, with Tauri IPC mocked:
 * an in-memory folder tree, a fake VIA keyboard on raw HID and stubbed QMK
 * downloads. ?view=find | find-offline | add-qmk | add-download | add-error | build-qmk | build-via
 * Open any-keyboard-frames.html?view=… to see phone, tablet and desktop widths side by side.
 */
import { mockIPC } from '@tauri-apps/api/mocks'
import { FakeRawHid } from '../helpers/fakeRawHid'
import '../../src/styles/globals.css'
import '../../src/styles/ui.css'

const view = new URLSearchParams(location.search).get('view') ?? 'find'

const INFO = JSON.stringify({ keyboard_name: 'Q1', layouts: { LAYOUT_ansi_82: { layout: Array.from({ length: 82 }, (_, i) => ({ x: i % 16, y: Math.floor(i / 16), matrix: [Math.floor(i / 16), i % 16] })) } } })
const PLANCK = { keyboards: { 'planck/rev6': { keyboard_name: 'Planck', layouts: { LAYOUT_ortho_4x12: { layout: Array.from({ length: 48 }, (_, i) => ({ x: i % 12, y: Math.floor(i / 12), matrix: [Math.floor(i / 12), i % 12] })) } } } } }
const km = '/Users/me/qmk_userspace/keyboards/keychron/q1v2/ansi_encoder/keymaps/me'
const FILES: Record<string, string> = {
  '/Users/me/qmk_userspace/qmk.json': '{}',
  '/Users/me/qmk_userspace/keyboards/keychron/q1v2/info.json': INFO,
  [`${km}/keymap.json`]: JSON.stringify({ keyboard: 'keychron/q1v2/ansi_encoder', keymap: 'me', layout: 'LAYOUT_ansi_82', layers: [Array(82).fill('KC_A'), Array(82).fill('KC_TRNS')] }),
  [`${km}/keymap.c`]: '',
  '/Users/me/planck/keymap.json': JSON.stringify({ keyboard: 'planck/rev6', layout: 'LAYOUT_ortho_4x12', layers: [Array(48).fill('KC_A')] }),
  '/Users/me/crkbd/keyboards/crkbd/rev1/keymaps/tom/keymap.c': '',
}
// fake VIA keyboard: 2 rows × 3 cols, 2 layers
const DEF = { name: 'Tiny60', matrix: { rows: 2, cols: 3 }, layouts: { keymap: [['0,0', '0,1', '0,2'], ['1,0', '1,1', '1,2']] } }
const hid = new FakeRawHid([[[4, 5, 6], [0x29, 0x2b, 0x2c]], [[1, 1, 1], [1, 1, 1]]])
FILES['/Users/me/Documents/Ultimate Keyboards/Tiny60/keymap.json'] = JSON.stringify({ keyboard: 'tiny60', layout: 'LAYOUT', layers: [['KC_Q', 'KC_B', 'KC_C', 'KC_ESC', 'KC_TAB', 'LSFT_T(KC_SPC)'], Array(6).fill('KC_TRNS')] })

const enc = (s: string) => Array.from(new TextEncoder().encode(s))
function list(path: string) {
  const prefix = path.replace(/\/$/, '') + '/'
  const seen = new Map<string, boolean>()
  for (const f of Object.keys(FILES)) if (f.startsWith(prefix)) { const r = f.slice(prefix.length).split('/'); seen.set(r[0], (seen.get(r[0]) ?? false) || r.length > 1) }
  return [...seen].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory, isSymlink: false }))
}
const DIALOG: Record<string, string> = { 'add-qmk': '/Users/me/qmk_userspace', 'add-download': '/Users/me/planck', 'add-error': '/Users/me/crkbd' }

mockIPC(async (cmd, args: any) => {
  switch (cmd) {
    case 'plugin:dialog|open': return DIALOG[view] ?? null
    case 'plugin:fs|read_dir': return list(args.path)
    case 'plugin:fs|read_text_file': if (args.path in FILES) return enc(FILES[args.path]); throw new Error(`not found: ${args.path}`)
    case 'plugin:fs|exists': return args.path in FILES
    case 'plugin:path|resolve_directory': return '/Users/me/Documents'
    case 'plugin:path|join': return args.paths.join('/').replace(/\/+/g, '/')
    case 'plugin:fs|mkdir': case 'plugin:fs|write_text_file': return null
    case 'list_usb_keyboards': return [{ vid: 0x1234, pid: 0x5678, product: 'Tiny60', manufacturer: null, serial: null, serialPort: null, rawHidPath: 'hid0', isZmk: false, isVial: false, hasKeyboardInterface: true, pointerReports: false }]
    case 'hid_open': return 1
    case 'hid_transact': return Array.from(await hid.transact(args.report))
    case 'hid_close': return null
    default: console.warn('unmocked', cmd, args); return null
  }
})

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes('keyboards.qmk.fm')) {
    if (view === 'find-offline') throw new TypeError('Failed to fetch')
    if (url.endsWith('keyboard_list.json')) return new Response(JSON.stringify({ keyboards: ['keychron/q1v2/ansi_encoder', 'keychron/q1v2/iso_encoder', 'keychron/q1v2/jis_encoder', 'keychron/q2/ansi', 'gmmk/pro/rev1/ansi', 'planck/rev6', 'crkbd/rev1'] }))
    if (url.includes('planck/rev6')) return new Response(JSON.stringify(PLANCK))
    return new Response('{}', { status: 404 })
  }
  return realFetch(input, init)
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { ToastProvider } = await import('../../src/components/ui/Toast')
const FindKeyboard = (await import('../../src/components/Settings/FindKeyboard')).default
const AddKeyboard = (await import('../../src/components/Settings/AddKeyboard')).default
const QmkBuildPanel = (await import('../../src/components/Keyboard/QmkBuildPanel')).default

const layout = { name: 'LAYOUT', keys: Array.from({ length: 6 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3) })), source: 'kle' } as any
const kbs: Record<string, any> = {
  'build-qmk': { id: 'q', name: 'Planck', firmware: 'qmk', keymapPath: '/Users/me/planck/keymap.json', shield: 'planck/rev6', layout, pointing: [], createdAt: '' },
  'build-via': { id: 'v', name: 'Tiny60', firmware: 'qmk', keymapPath: '/Users/me/Documents/Ultimate Keyboards/Tiny60/keymap.json', layout, pointing: [], createdAt: '', device: { protocol: 'via', vid: 0x1234, pid: 0x5678, definition: DEF } },
}

function Fixture() {
  const [added, setAdded] = React.useState<string | null>(null)
  const onAdd = (d: any) => setAdded(`Added ${d.name} (${d.firmware}, ${d.layout.keys.length} keys)`)
  let body: React.ReactNode
  if (view.startsWith('find')) body = <FindKeyboard onAdd={onAdd} />
  else if (view.startsWith('add')) body = <AddKeyboard mode="folder" existingNames={[]} onAdd={onAdd} onCancel={() => setAdded('cancelled')} />
  else body = <QmkBuildPanel keyboard={kbs[view]} />
  return <div style={{ padding: 16 }}>{body}{added && <output style={{ display: 'block', marginTop: 12 }}>{added}</output>}</div>
}
createRoot(document.getElementById('root')!).render(<ToastProvider><Fixture /></ToastProvider>)
