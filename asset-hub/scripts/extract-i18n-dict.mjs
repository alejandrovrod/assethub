// One-off helper: extracts the inline `const translations = { ... }` object from a
// page component and writes es/en namespace JSON files under src/locales.
//
//   node scripts/extract-i18n-dict.mjs <file.tsx> <namespace> [rootKey] [startLine] [endLine]
//
// `rootKey` nests the dictionary under that key so several pages can share one
// namespace without their key names colliding. Lines are 1-based and inclusive;
// when omitted the block is located by searching for `const translations = {`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [file, namespace, rootKey, startArg, endArg] = process.argv.slice(2)
if (!file || !namespace) {
  console.error('usage: extract-i18n-dict.mjs <file> <namespace> [rootKey] [startLine] [endLine]')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '../src/frontend/apps/web')
const absolute = resolve(process.cwd(), file)
const source = readFileSync(absolute, 'utf8')
const lines = source.split(/\r?\n/)

let start, end
if (startArg && endArg) {
  start = Number(startArg) - 1
  end = Number(endArg) - 1
} else {
  start = lines.findIndex((l) => l.includes('const translations = {'))
  if (start < 0) throw new Error('translations block not found')
  end = lines.findIndex((l, i) => i > start && l.trimStart() === '};')
  if (end < 0) throw new Error('translations block end not found')
}

const block = lines.slice(start, end + 1).join('\n')
const eq = block.indexOf('{')
const objectLiteral = block.slice(eq, block.lastIndexOf('}') + 1)

// The dictionary is a plain object literal, so evaluating it as an expression is
// safe here and guarantees we emit byte-identical content.
const dict = new Function(`return (${objectLiteral})`)()

for (const lang of ['es', 'en']) {
  if (!dict[lang]) throw new Error(`missing "${lang}" in ${file}`)
  const dir = resolve(webRoot, 'src/locales', lang)
  mkdirSync(dir, { recursive: true })
  const target = resolve(dir, `${namespace}.json`)

  const payload = rootKey ? { [rootKey]: dict[lang] } : dict[lang]
  let merged = payload
  if (existsSync(target)) {
    const existing = JSON.parse(readFileSync(target, 'utf8'))
    merged = { ...existing, ...payload }
  }

  writeFileSync(target, JSON.stringify(merged, null, 2) + '\n', 'utf8')
  console.log(`wrote ${target} (${Object.keys(merged).length} top-level keys)`)
}
