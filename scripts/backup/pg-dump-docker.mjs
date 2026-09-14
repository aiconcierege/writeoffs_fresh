#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'

const image = 'postgres:17.6-bookworm'
const run = args => new Promise((resolveRun, reject) => {
  const child = spawn('docker', args, { stdio: 'inherit', env: process.env })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`Docker pg_dump exited with ${code}.`)))
})

if (process.argv[2] === '--version' && process.argv.length === 3) {
  await run(['run', '--rm', image, 'pg_dump', '--version'])
} else if (process.argv[2] === '--output' && process.argv.length === 4) {
  if (!process.env.WRITEOFFS_BACKUP_DATABASE_URL) throw new Error('WRITEOFFS_BACKUP_DATABASE_URL is required.')
  const output = resolve(process.argv[3])
  const mount = dirname(output)
  await run([
    'run', '--rm',
    '--env', 'WRITEOFFS_BACKUP_DATABASE_URL',
    '--volume', `${mount}:/writeoffs-backup`,
    image,
    'sh', '-ceu', 'pg_dump --format=custom --no-owner --file /writeoffs-backup/database.dump "$WRITEOFFS_BACKUP_DATABASE_URL"',
  ])
} else {
  throw new Error('Usage: pg-dump-docker.mjs --version | --output <database.dump>')
}
