#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { cp, mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { decodeBackupKey, decryptFile } from './backup-crypto.mjs'

const need = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value }
const run = (command, args) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}.`)))
})
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex')

const input = resolve(need('WRITEOFFS_RESTORE_INPUT'))
const databaseUrl = process.env.WRITEOFFS_RESTORE_DATABASE_URL
const dumpTarget = process.env.WRITEOFFS_RESTORE_DATABASE_DUMP_OUTPUT
const storageTarget = process.env.WRITEOFFS_RESTORE_STORAGE_ROOT
if (!databaseUrl && !dumpTarget && !storageTarget) throw new Error('At least one isolated restore target is required.')
if (process.env.WRITEOFFS_RESTORE_CONFIRM_ISOLATED !== 'yes') throw new Error('Refusing restore without WRITEOFFS_RESTORE_CONFIRM_ISOLATED=yes.')

process.umask(0o077)
const work = await mkdtemp(join(tmpdir(), 'writeoffs-restore-'))
try {
  const archive = join(work, 'bundle.tar.gz'); const payload = join(work, 'payload')
  await decryptFile(input, archive, decodeBackupKey())
  await mkdir(payload); await run('tar', ['-xzf', archive, '-C', payload])
  const manifest = JSON.parse(await readFile(join(payload, 'manifest.json'), 'utf8'))
  if (manifest.format !== 'writeoffs-backup-v1') throw new Error('Unsupported backup format.')
  const dump = join(payload, manifest.database.file)
  if (await sha256(dump) !== manifest.database.sha256) throw new Error('Database dump integrity check failed.')
  for (const object of manifest.storage) {
    const file = join(payload, 'storage', object.path)
    if ((await stat(file)).size !== object.bytes || await sha256(file) !== object.sha256) throw new Error(`Storage integrity check failed: ${object.path}`)
  }
  if (databaseUrl) await run(process.env.PG_RESTORE_BIN || 'pg_restore', ['--no-owner', '--exit-on-error', '--dbname', databaseUrl, dump])
  if (dumpTarget) await cp(dump, resolve(dumpTarget), { errorOnExist: true })
  if (storageTarget) {
    await mkdir(resolve(storageTarget), { recursive: true })
    await cp(join(payload, 'storage'), resolve(storageTarget), { recursive: true })
  }
  console.log(JSON.stringify({ verified: true, objects: manifest.storage.length, databaseRestored: Boolean(databaseUrl), databaseDumpRecovered: Boolean(dumpTarget), storageRestored: Boolean(storageTarget) }))
} finally {
  await rm(work, { recursive: true, force: true })
}
