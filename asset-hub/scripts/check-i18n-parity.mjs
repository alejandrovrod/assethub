// Verifies es/en key parity across every namespace under src/locales.
// Usage: node scripts/check-i18n-parity.mjs [namespace ...]
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const locales = join(here, '..', 'src', 'frontend', 'apps', 'web', 'src', 'locales')

const only = process.argv.slice(2)
const namespaces = readdirSync(join(locales, 'es'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((ns) => only.length === 0 || only.includes(ns))

const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? flat(v, `${p}${k}.`)
      : [`${p}${k}`],
  )

let failed = false
for (const ns of namespaces) {
  const es = JSON.parse(readFileSync(join(locales, 'es', `${ns}.json`), 'utf8'))
  const en = JSON.parse(readFileSync(join(locales, 'en', `${ns}.json`), 'utf8'))
  const a = new Set(flat(es))
  const b = new Set(flat(en))
  const missingEn = [...a].filter((k) => !b.has(k))
  const missingEs = [...b].filter((k) => !a.has(k))
  const status = missingEn.length || missingEs.length ? 'MISMATCH' : 'ok'
  console.log(`${ns}: ${status} (es=${a.size} en=${b.size})`)
  if (missingEn.length) console.log(`  missing in en: ${missingEn.join(', ')}`)
  if (missingEs.length) console.log(`  missing in es: ${missingEs.join(', ')}`)
  if (missingEn.length || missingEs.length) failed = true
}
process.exit(failed ? 1 : 0)
