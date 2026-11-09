import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { checkRepo, checkSource, checkWebviewUncapped } from '../scripts/check-frames'

const rules = (file: string, src: string) => checkSource(file, src).map(f => f.rule)

describe('frame check (scripts/check-frames.ts)', () => {
  test('an entrance that starts hidden fails; a transform-only entrance passes', () => {
    expect(rules('a.css', '@keyframes fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; } }')).toEqual(['frame/hidden-first-keyframe'])
    expect(rules('a.css', '@keyframes pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }')).toEqual(['frame/hidden-first-keyframe'])
    expect(rules('a.tsx', "el.animate([{ opacity: 0 }, { opacity: 1 }], 200)")).toEqual(['frame/hidden-first-keyframe'])
    expect(rules('a.css', '@keyframes fade-up { from { transform: translateY(10px); } to { transform: translateY(0); } }')).toEqual([])
    expect(rules('a.css', '@keyframes dim { from { opacity: 0.6; } to { opacity: 1; } }')).toEqual([])
  })

  test('endless ambient motion and large live blur fail', () => {
    expect(rules('a.css', '#root::before { filter: blur(90px); animation: drift 26s ease-in-out infinite alternate; }').sort())
      .toEqual(['frame/endless-animation', 'frame/large-filter-blur'])
    expect(rules('a.css', '.glass { backdrop-filter: blur(24px); }')).toEqual([])
  })

  test('a 60 Hz timer fails; ordinary timers pass', () => {
    expect(rules('a.ts', 'setInterval(() => {\n  draw()\n}, 16)')).toEqual(['frame/refresh-cap'])
    expect(rules('a.ts', 'const frame = 1000 / 60')).toEqual(['frame/refresh-cap'])
    expect(rules('a.ts', 'setInterval(() => { place = where() }, 250)\nlist.splice(0, 1)')).toEqual([])
  })

  test('measuring layout after paint fails; before paint passes', () => {
    const effect = 'useEffect(() => { const r = ref.current!.getBoundingClientRect(); setW(r.width) }, [])'
    expect(rules('a.tsx', effect)).toEqual(['frame/measured-after-paint'])
    expect(rules('a.tsx', effect.replace('useEffect', 'useLayoutEffect'))).toEqual([])
  })

  test('comments are not code; frames-allow needs a reason', () => {
    expect(rules('a.css', '/* was: filter: blur(90px) */ .x { color: red; }')).toEqual([])
    expect(rules('a.css', '/* frames-allow[frame/endless-animation]: loading placeholder */\n.s { animation: shimmer 1s linear infinite; }')).toEqual([])
    expect(rules('a.css', '/* frames-allow: */\n.s { animation: shimmer 1s linear infinite; }')).toEqual(['frame/endless-animation'])
  })

  test('the desktop app must turn off the WKWebView 60 fps preference', () => {
    expect(checkWebviewUncapped(['fn main() {}'])).toBe(false)
    expect(checkWebviewUncapped(['const FEATURE: &str = "PreferPageRenderingUpdatesNear60FPSEnabled"; msg_send![prefs, _setEnabled: no, forFeature: f]'])).toBe(true)
  })

  test('the code on main before this fix fails the check (it would have caught these bugs)', () => {
    const show = (path: string) => {
      const r = Bun.spawnSync(['git', 'show', `6a3e77d:${path}`], { cwd: join(import.meta.dir, '..') })
      return r.exitCode === 0 ? r.stdout.toString() : null
    }
    const css = show('src/styles/globals.css')
    if (css === null) return // shallow clone without that commit
    const found = new Set(checkSource('src/styles/globals.css', css).map(f => f.rule))
    expect(found.has('frame/hidden-first-keyframe')).toBe(true)
    expect(found.has('frame/endless-animation')).toBe(true)
    expect(found.has('frame/large-filter-blur')).toBe(true)
    expect(checkWebviewUncapped([show('src-tauri/src/lib.rs') ?? ''])).toBe(false)
  })

  test('this repo is clean', () => {
    expect(checkRepo(join(import.meta.dir, '..'))).toEqual([])
  })
})
