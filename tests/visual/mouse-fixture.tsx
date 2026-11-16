import './mouse-tauri-mock'
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles/globals.css'
import '../../src/styles/ui.css'
import { setHostOS } from '../../src/lib/platform'
const q = new URLSearchParams(location.search)
setHostOS(q.get('os') === 'windows' ? 'windows' : 'mac')
if (q.get('on') !== '0') localStorage.setItem('uk.mouseConfig', JSON.stringify({ enabled: true, reverse: false, speed: 1.5 }))
else localStorage.removeItem('uk.mouseConfig')
const { default: Mouse } = await import('../../src/components/Mouse')
createRoot(document.getElementById('root')!).render(<div style={{ height: '100vh' }}><Mouse /></div>)
