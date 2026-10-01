// Converts object-style `t.foo` access to i18next `t('login.foo')` calls
// and wires up useTranslation('auth') with keyPrefix 'login'.
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const prefix = process.argv[3] // e.g. "login"
let src = readFileSync(file, 'utf8')

// t.foo.bar -> t('login.foo.bar')
src = src.replace(
  /\bt\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/g,
  (_m, key) => `t('${prefix}.${key}')`
)

// const t = translations[lang]; -> useTranslation hook
src = src.replace(
  '  const t = translations[lang];',
  `  const { t } = useTranslation('auth');`
)

// ensure import
if (!src.includes("from \"react-i18next\"") && !src.includes("from 'react-i18next'")) {
  src = src.replace(
    /import \{ useLanguageStore \}[^\n]*\n/,
    (m) => m + 'import { useTranslation } from "react-i18next";\n'
  )
}

writeFileSync(file, src)
console.log('done')
