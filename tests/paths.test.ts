import { expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { basename, dirname, segments, tail, toPosix } from '../src/lib/paths'

test('basename, dirname and tail read both separators and mixed paths', () => {
  expect(basename('/Users/a/zmk-config/config/corne.keymap')).toBe('corne.keymap')
  expect(basename('C:\\Users\\a\\zmk-config\\config\\corne.keymap')).toBe('corne.keymap')
  expect(basename('C:\\Users\\a\\zmk-config/config/corne.keymap')).toBe('corne.keymap')
  expect(basename('C:\\Users\\a\\zmk-config\\')).toBe('zmk-config')
  expect(basename('/')).toBe('')
  expect(basename('')).toBe('')

  expect(dirname('/Users/a/b.txt')).toBe('/Users/a')
  expect(dirname('C:\\Users\\a\\b.txt')).toBe('C:\\Users\\a')
  expect(dirname('C:\\b.txt')).toBe('C:\\')
  expect(dirname('/b.txt')).toBe('/')
  expect(dirname('b.txt')).toBe('')
  expect(dirname('C:\\Users\\a\\')).toBe('C:\\Users')

  expect(tail('/a/b/c/d.txt', 3)).toBe('b/c/d.txt')
  expect(tail('C:\\a\\b\\c\\d.txt', 3)).toBe('b/c/d.txt')
  expect(tail('d.txt', 3)).toBe('d.txt')

  expect(segments('C:\\a//b\\c')).toEqual(['C:', 'a', 'b', 'c'])
  expect(toPosix('C:\\a\\b/c')).toBe('C:/a/b/c')
})

/** Every .ts/.tsx file under src except the helper itself. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

test("no code in src splits a path on '/' (Windows paths use backslashes; use src/lib/paths.ts)", () => {
  const src = join(import.meta.dir, '..', 'src')
  const offenders: string[] = []
  for (const file of sources(src)) {
    if (relative(src, file).replace(/\\/g, '/') === 'lib/paths.ts') continue
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\.split\(\s*(['"`]\/['"`]|\/\\\/\/)/.test(line)) offenders.push(`${relative(src, file)}:${i + 1}: ${line.trim()}`)
    })
  }
  expect(offenders).toEqual([])
})
