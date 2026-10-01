// t.foo(.bar)? -> t('prefix.foo(.bar)') for bare identifier `t`
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const prefix = process.argv[3]
let src = readFileSync(file, 'utf8')

const before = src
src = src.replace(/\bt\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/g, (_m, key) => `t('${prefix}.${key}')`)

writeFileSync(file, src)
const n = (before.match(/\bt\.[A-Za-z0-9_]/g) || []).length
console.log(`converted ~${n} refs in ${file}`)
