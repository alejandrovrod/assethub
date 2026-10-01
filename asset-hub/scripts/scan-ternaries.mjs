// Reports every remaining `lang === "es" ? ... : ...` site in LandingPage
// with its line number, so we can move them into landing.json.
import { readFileSync } from 'node:fs'

const file = process.argv[2]
const src = readFileSync(file, 'utf8')
const lines = src.split(/\r?\n/)

// single-line form
const oneLine = /lang === "es"\s*\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g
// multi-line form (newline between cond and branches)
const multiLine = /lang === "es"(\s+)\?((?:[^"\\]|\\.)*)"(\s+):((?:[^"\\]|\\.)*)"/g

const hits = new Set()

lines.forEach((line, i) => {
  oneLine.lastIndex = 0
  let m
  while ((m = oneLine.exec(line)) !== null) hits.add(i + 1)
})

let m2
multiLine.lastIndex = 0
while ((m2 = multiLine.exec(src)) !== null) {
  const ln = src.slice(0, m2.index).split(/\r?\n/).length
  hits.add(ln)
}

for (const ln of [...hits].sort((a, b) => a - b)) {
  const text = lines[ln - 1].trim()
  console.log(`L${ln}: ${text.slice(0, 110)}`)
}
console.log(`total: ${hits.size}`)
