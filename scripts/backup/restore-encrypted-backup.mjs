#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { decodeBackupKey, decryptFile } from './backup-crypto.mjs'
import { safeRelativePath, sha256File } from './backup-common.mjs'

const need = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value }
const run = (command, args) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}.`)))
})

const input = resolve(need('WRITEOFFS_RESTORE_INPUT'))
const databaseUrl = process.env.WRITEOFFS_RESTORE_DATABASE_URL
// Artifact recovery is not an activation gate. Database import belongs exclusively
// to the fresh-target controller/provider adapter, which verifies external isolation.
if (databaseUrl) throw new Error('DIRECT_DATABASE_RESTORE_DISABLED_USE_FRESH_TARGET_CONTROLLER')
const dumpTarget = process.env.WRITEOFFS_RESTORE_DATABASE_DUMP_OUTPUT
const storageTarget = process.env.WRITEOFFS_RESTORE_STORAGE_ROOT
const ledgerTarget = process.env.WRITEOFFS_RESTORE_DELETION_LEDGER_OUTPUT
if (!databaseUrl && !dumpTarget && !storageTarget && !ledgerTarget) throw new Error('At least one isolated restore target is required.')
if (process.env.WRITEOFFS_RESTORE_CONFIRM_ISOLATED !== 'yes') throw new Error('Refusing restore without WRITEOFFS_RESTORE_CONFIRM_ISOLATED=yes.')

process.umask(0o077)
const work = await mkdtemp(join(tmpdir(), 'writeoffs-restore-'))
try {
  const archive = join(work, 'bundle.tar.gz'); const payload = join(work, 'payload')
  await decryptFile(input, archive, decodeBackupKey())
  await mkdir(payload); await run('tar', ['-xzf', archive, '-C', payload])
  const manifest = JSON.parse(await readFile(join(payload, 'manifest.json'), 'utf8'))
  if (!['writeoffs-backup-v1', 'writeoffs-backup-v2'].includes(manifest.format)) throw new Error('Unsupported backup format.')
  const dump = join(payload, safeRelativePath(manifest.database.file))
  if ((await stat(dump)).size !== manifest.database.bytes || await sha256File(dump) !== manifest.database.sha256) throw new Error('Database dump integrity check failed.')
  for (const object of manifest.storage) {
    const file = join(payload, 'storage', safeRelativePath(object.path))
    if ((await stat(file)).size !== object.bytes || await sha256File(file) !== object.sha256) throw new Error(`Storage integrity check failed: ${object.path}`)
  }
  if (manifest.deletionLedger) {
    const ledger = join(payload, safeRelativePath(manifest.deletionLedger.file))
    if ((await stat(ledger)).size !== manifest.deletionLedger.bytes || await sha256File(ledger) !== manifest.deletionLedger.sha256) throw new Error('Deletion ledger integrity check failed.')
    if (ledgerTarget) await cp(ledger, resolve(ledgerTarget), { errorOnExist: true })
  } else if (ledgerTarget) throw new Error('Backup does not contain a deletion ledger.')
  if (dumpTarget) await cp(dump, resolve(dumpTarget), { errorOnExist: true })
  if (storageTarget) {
    await mkdir(resolve(storageTarget), { recursive: true })
    await cp(join(payload, 'storage'), resolve(storageTarget), { recursive: true })
  }
  console.log(JSON.stringify({ verified: true, format: manifest.format, source: manifest.source ?? null, objects: manifest.storage.length, databaseRestored: Boolean(databaseUrl), databaseDumpRecovered: Boolean(dumpTarget), storageRestored: Boolean(storageTarget), deletionLedgerRecovered: Boolean(ledgerTarget) }))
} finally {
  await rm(work, { recursive: true, force: true })
}
