// Writes the exact profile the app sends on Apply for the Windows test templates.
// Usage: bun native/service-win/e2e/make-profile.ts > profile.json
//        bun native/service-win/e2e/make-profile.ts --import exported.json > profile.json
//          (an exported laptop-keys file, imported on Windows with "Import and swap": the app's own import path)
import { readFileSync } from 'node:fs'
import { templatesFor, templateRules } from '../../../src/lib/templates'
import { createNativeProfile, serializeNativeProfile } from '../../../src/lib/nativeRemapping'
import { parseProfile, profileForHost } from '../../../src/lib/profileTransfer'

if (process.argv[2] === '--import') {
  const imported = profileForHost(parseProfile(readFileSync(process.argv[3], 'utf8')), 'windows', true)
  process.stdout.write(serializeNativeProfile(createNativeProfile(imported.profileTitle, imported.rules)))
  process.exit(0)
}

const wanted = (process.argv[2] ?? 'home-row-starter,combos-easy-reach').split(',')
const all = templatesFor('windows')
const picked = wanted.map(id => {
  const t = all.find(x => x.id === id)
  if (!t) throw new Error(`no Windows template ${id}; have: ${all.map(x => x.id).join(', ')}`)
  return t
})
process.stdout.write(serializeNativeProfile(createNativeProfile('ZenBook e2e', picked.flatMap(templateRules))))
