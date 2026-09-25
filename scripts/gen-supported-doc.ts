// Regenerate docs/user/supported.md from src/lib/supported.ts.
import { writeFileSync } from 'fs'
import { join } from 'path'
import { supportMarkdown } from '../src/lib/supported'

writeFileSync(join(import.meta.dir, '..', 'docs', 'user', 'supported.md'), supportMarkdown())
console.log('wrote docs/user/supported.md')
