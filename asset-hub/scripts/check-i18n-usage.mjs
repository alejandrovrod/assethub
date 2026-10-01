// Resolves every static t('ns:key') / t('key') literal in src/** against the
// dictionaries and reports any key that would fall back at runtime.
//
// Namespace resolution: we build a map of local t-identifiers to their default
// namespace from the `const { t: NAME } = useTranslation(...)` declarations in
// the same file, then attribute each call by its callee. Explicit `ns:key`
// literals win over the guess.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..', 'src', 'frontend', 'apps', 'web')
const src = join(web, 'src')
const locales = join(src, 'locales')

const load = (ns, lng) => JSON.parse(readFileSync(join(locales, lng, `${ns}.json`), 'utf8'))
const namespaces = readdirSync(join(locales, 'es')).map((f) => f.replace(/\.json$/, ''))

const flatten = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? flatten(v, `${p}${k}.`) : [`${p}${k}`],
  )

const dicts = {}
for (const ns of namespaces) {
  dicts[ns] = { es: new Set(flatten(load(ns, 'es'))), en: new Set(flatten(load(ns, 'en'))) }
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (name === 'node_modules' || name === 'locales') return []
    const st = statSync(full)
    if (st.isDirectory()) return walk(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })

// `const { t } = useTranslation(['a','b'])` / `const { t: tCommon } = useTranslation('common')`
const declRe =
  /const\s*\{\s*t\s*(?::\s*(\w+))?\s*\}\s*=\s*useTranslation\(\s*(\[\s*['"][\w-]+['"][^\]]*\]|['"][\w-]+['"])/g
// callee + quoted key: `tCommon('actions.save')`, `t("common:actions.save", {...})`
const callRe = /\b(\w+)\s*\(\s*(['"])((?:[a-zA-Z0-9_-]+:)?[a-zA-Z0-9_.-]+)\2/g

const missing = []
const unknown = []
let calls = 0

for (const file of walk(src)) {
  const text = readFileSync(file, 'utf8')
  const varToNs = new Map()
  for (const m of text.matchAll(declRe)) {
    const local = m[1] ?? 't'
    const arg = m[2]
    const list = [...arg.matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1])
    if (list.length) varToNs.set(local, list) // first entry = default ns
  }

  for (const m of text.matchAll(callRe)) {
    const callee = m[1]
    const raw = m[3]
    if (!raw.includes('.') && !raw.includes(':')) continue
    if (callee === 'require' || callee === 'import') continue
    const isT = varToNs.has(callee)
    const isI18nInstance = /^(i18n|instance)$/.test(callee)
    // Permission codes look like `can('assets:update')` — not i18next calls.
    if (!isT && !isI18nInstance) continue
    calls++
    const explicit = raw.includes(':') ? raw.split(':') : null
    // Bare keys resolve against the DEFAULT (first) namespace of the hook.
    const candidates = explicit ? [explicit[0]] : (varToNs.get(callee) ?? []).slice(0, 1)
    if (!candidates.length) {
      if (explicit) unknown.push(`${relative(web, file)} -> ${raw}`)
      continue
    }
    const key = explicit ? explicit[1] : raw
    for (const ns of candidates) {
      if (!dicts[ns]) continue
      for (const lng of ['es', 'en']) {
        const set = dicts[ns][lng]
        // Plural forms: `key_one` / `key_other` satisfy a `t('key', { count })` call.
        const resolved = set.has(key) || set.has(`${key}_one`) || set.has(`${key}_other`)
        if (!resolved) {
          missing.push(`${relative(web, file)} -> ${ns}:${key} (missing in ${lng}) [via ${callee}]`)
        }
      }
    }
    if (!candidates.some((ns) => dicts[ns])) unknown.push(`${relative(web, file)} -> ${raw}`)
  }
}

console.log(`static t() literals checked: ${calls}`)
if (missing.length) {
  console.log(`MISSING: ${missing.length}`)
  for (const line of [...new Set(missing)]) console.log('  ' + line)
}
if (unknown.length) {
  console.log(`unattributed (skipped): ${[...new Set(unknown)].length}`)
  for (const line of [...new Set(unknown)]) console.log('  ? ' + line)
}
if (missing.length) process.exit(1)
console.log('all resolved in both locales')
