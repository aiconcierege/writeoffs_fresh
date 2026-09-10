#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cp, mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { decodeBackupKey, encryptFile } from './backup-crypto.mjs'

const need = name => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}
const run = (command, args, options = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}.`)))
})
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex')
async function filesUnder(root) {
  const entries = []
  async function walk(path) {
    for (const name of await readdir(path)) {
      const child = join(path, name); const info = await stat(child)
      if (info.isDirectory()) await walk(child)
      else if (info.isFile()) entries.push(child)
    }
  }
  await walk(root); return entries
}

const output = resolve(need('WRITEOFFS_BACKUP_OUTPUT'))
const suppliedDump = process.env.WRITEOFFS_BACKUP_DATABASE_DUMP
const suppliedStorage = process.env.WRITEOFFS_BACKUP_STORAGE_ROOT
const databaseUrl = process.env.WRITEOFFS_BACKUP_DATABASE_URL
if (!suppliedDump && !databaseUrl) throw new Error('Provide WRITEOFFS_BACKUP_DATABASE_URL or WRITEOFFS_BACKUP_DATABASE_DUMP.')
if (!suppliedStorage) throw new Error('WRITEOFFS_BACKUP_STORAGE_ROOT is required; export the private bucket into this protected directory first.')

process.umask(0o077)
const work = await mkdtemp(join(tmpdir(), 'writeoffs-backup-'))
try {
  const payload = join(work, 'payload'); const storage = join(payload, 'storage')
  await mkdir(storage, { recursive: true })
  const dump = join(payload, 'database.dump')
  if (suppliedDump) await cp(resolve(suppliedDump), dump)
  else await run(process.env.PG_DUMP_BIN || 'pg_dump', ['--format=custom', '--no-owner', '--file', dump, databaseUrl])
  await cp(resolve(suppliedStorage), storage, { recursive: true })
  const storageFiles = await filesUnder(storage)
  const manifest = {
    format: 'writeoffs-backup-v1',
    createdAt: new Date().toISOString(),
    database: { file: 'database.dump', sha256: await sha256(dump), bytes: (await stat(dump)).size },
    storage: await Promise.all(storageFiles.map(async file => ({
      path: relative(storage, file), sha256: await sha256(file), bytes: (await stat(file)).size,
    }))),
  }
  await writeFile(join(payload, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  const archive = join(work, 'bundle.tar.gz')
  await run('tar', ['-czf', archive, '-C', payload, '.'])
  await encryptFile(archive, output, decodeBackupKey())
  console.log(JSON.stringify({ output: basename(output), format: manifest.format, objects: manifest.storage.length }))
} finally {
  await rm(work, { recursive: true, force: true })
}
