/**
 * QA frame probe. Off unless the desktop app was launched with
 * UK_FRAME_PROBE=<file> (src-tauri/src/frames.rs); then it records, per frame,
 * how long the main thread spends on the rendering update (style, layout,
 * paint recording: the time from the frame's rAF callback until the next task
 * runs), the interval between frames, and click-to-painted latency, and
 * writes a JSON summary to that file every 2 s. It records UI labels only,
 * never keymap or user content.
 */
import { invoke } from '@tauri-apps/api/core'
import { IS_TAURI } from '@/lib/io'

type Sample = { work: number; interval: number }
const pct = (xs: number[], p: number) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return +s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))].toFixed(2)
}
const stats = (xs: number[]) => ({ n: xs.length, p50: pct(xs, 0.5), p90: pct(xs, 0.9), p99: pct(xs, 0.99), max: pct(xs, 1) })

export async function startFrameProbeIfRequested(): Promise<void> {
  if (!IS_TAURI) return
  const target = await invoke<string | null>('frame_probe_target').catch(() => null)
  if (!target) return

  const frames = new Map<string, Sample[]>()
  const clicks: { label: string; ms: number; at: string }[] = []
  let place = 'start'
  let lastInput = 0
  let lastTs = 0
  const channel = new MessageChannel()
  let pending: { t0: number; interval: number } | null = null

  const where = () => {
    const nav = document.querySelector('.nav-item.active')?.textContent?.trim() ?? '?'
    const tab = document.querySelector('[role=tablist][aria-label="Keyboard sections"] [aria-selected=true]')?.textContent?.trim()
    return tab ? `${nav} / ${tab}` : nav
  }
  setInterval(() => { place = where() }, 250)

  channel.port1.onmessage = () => {
    if (!pending) return
    const work = performance.now() - pending.t0
    const kind = performance.now() - lastInput < 200 ? 'input' : 'idle'
    const key = `${place} [${kind}]`
    let list = frames.get(key)
    if (!list) frames.set(key, (list = []))
    list.push({ work, interval: pending.interval })
    if (list.length > 6000) list.splice(0, list.length - 6000)
    pending = null
  }
  const frame = (ts: number) => {
    const interval = lastTs ? ts - lastTs : 0
    lastTs = ts
    pending = { t0: performance.now(), interval }
    channel.port2.postMessage(0)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  for (const type of ['wheel', 'pointerdown', 'keydown'] as const) {
    addEventListener(type, () => { lastInput = performance.now() }, { capture: true, passive: true })
  }
  addEventListener('click', e => {
    const el = (e.target as HTMLElement | null)?.closest('button,[role=tab],a')
    const label = (el?.getAttribute('aria-label') || el?.textContent || '?').trim().slice(0, 40)
    const start = e.timeStamp
    requestAnimationFrame(() => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => {
        clicks.push({ label, ms: +(performance.now() - start).toFixed(2), at: where() })
        if (clicks.length > 200) clicks.shift()
      }
      ch.port2.postMessage(0)
    })
  }, { capture: true })

  const pacing = await invoke('frame_pacing_status').catch(e => ({ error: String(e) }))
  const write = () => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of frames) {
      const iv = v.map(s => s.interval).filter(x => x > 0)
      const med = pct(iv, 0.5) ?? 0
      out[k] = { work_ms: stats(v.map(s => s.work)), interval_ms: stats(iv), long_intervals: iv.filter(x => x > med * 1.5).length }
    }
    const report = { at: new Date().toISOString(), pacing, devicePixelRatio, viewport: [innerWidth, innerHeight], frames: out, clicks }
    invoke('frame_probe_write', { report: JSON.stringify(report, null, 1) }).catch(() => {})
  }
  setInterval(write, 2000)
}
