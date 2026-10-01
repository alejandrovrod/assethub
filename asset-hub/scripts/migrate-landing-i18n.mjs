// One-shot: convert `t.x.y` object access -> i18next t('x.y') calls in LandingPage.
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
let src = readFileSync(file, 'utf8')

// 1. Strip the inline `translations` dictionary (from the banner comment to its closing `};`).
const dictStart = src.indexOf('// --- TRANSLATIONS')
const dictEnd = src.indexOf('import { useLanguageStore }')
if (dictStart === -1 || dictEnd === -1 || dictEnd < dictStart) {
  console.error('dictionary bounds not found'); process.exit(1)
}
src = src.slice(0, dictStart) + src.slice(dictEnd)

// 2. Array/object keys need returnObjects at runtime.
const objectKeys = [
  'featuresTabs.tabs',
  'multitenant.clients',
  'pricing.p1_features',
  'pricing.p2_features',
]
for (const key of objectKeys) {
  const re = new RegExp(`\\bt\\.${key.replace(/\./g, '\\.')}\\s*(?=\\.map|\\[)`, 'g')
  src = src.replace(re, `t('${key}', { returnObjects: true })`)
}

// 3. Remaining scalar keys: t.a.b -> t('a.b')
src = src.replace(/\bt\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/g, "t('$1')")

// 4. Wire up useTranslation.
src = src.replace(
  'import { useLanguageStore }',
  'import { useTranslation } from "react-i18next";\nimport { useLanguageStore }'
)
src = src.replace(
  '  const t = translations[lang];',
  "  const { t } = useTranslation('landing');"
)

writeFileSync(file, src)
console.log('done')
