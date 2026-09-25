import { expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { supportMarkdown, supportMatrix } from '../src/lib/supported'
import { TEMPLATES } from '../src/lib/pointing/templates'

test('docs/user/supported.md matches src/lib/supported.ts (run scripts/gen-supported-doc.ts)', () => {
  expect(readFileSync(join(import.meta.dir, '..', 'docs', 'user', 'supported.md'), 'utf8')).toBe(supportMarkdown())
})

test('every pointing template appears, untested ones as partial', () => {
  const rows = supportMatrix().flatMap(g => g.rows)
  for (const t of TEMPLATES) {
    const r = rows.find(r => r.feature.startsWith(`Add ${t.name.replace(/ — untested$/, '')}`))
    expect(r).toBeDefined()
    expect(r!.level).toBe(t.tested ? 'yes' : 'partial')
  }
})
