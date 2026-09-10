import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), '.vercel', 'output', 'functions')
let configCount = 0
let removedCount = 0

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { walk(path); continue }
    if (entry.name !== '.vc-config.json') continue
    const config = JSON.parse(readFileSync(path, 'utf8'))
    if (!config.filePathMap) continue
    for (const key of Object.keys(config.filePathMap)) {
      const value = String(config.filePathMap[key])
      if (!key.startsWith('.env') && !value.startsWith('.env')) continue
      delete config.filePathMap[key]
      removedCount += 1
    }
    writeFileSync(path, JSON.stringify(config))
    configCount += 1
  }
}

walk(root)
console.log(JSON.stringify({ configCount, removedCount }))
