// Visual fixture only: pretend to be the desktop app so the switches are live.
;(window as any).__TAURI_INTERNALS__ = { invoke: async (cmd: string) => (cmd === 'accessibility_trusted' ? true : null), transformCallback: () => 0 }
