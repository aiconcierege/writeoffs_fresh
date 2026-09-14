#!/usr/bin/env node
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { assertExpectedDatabaseProject, assertExpectedSupabaseProject } from './backup-common.mjs'
import { assertStorageAccess, collectSupabaseStorage } from './collect-supabase-storage.mjs'
import { downloadBackup, loadS3Config, makeS3Client, uploadBackup } from './s3-transfer.mjs'

const need = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value }
const run = (script, env) => new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'inherit', 'inherit'] })
  child.once('error', reject); child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`${script} exited with ${code}.`)))
})

process.umask(0o077)
const sourceEnvironment = need('WRITEOFFS_BACKUP_SOURCE_ENVIRONMENT')
if (sourceEnvironment !== 'staging') throw new Error('This runner is staging-only until Production scheduling is explicitly approved.')
const expectedRef = need('WRITEOFFS_BACKUP_EXPECTED_SUPABASE_PROJECT_REF')
const supabaseUrl = need('SUPABASE_URL')
const databaseUrl = need('WRITEOFFS_BACKUP_DATABASE_URL')
assertExpectedSupabaseProject(supabaseUrl, expectedRef)
assertExpectedDatabaseProject(databaseUrl, expectedRef)
const config = loadS3Config()
const work = await mkdtemp(join(tmpdir(), 'writeoffs-s3-backup-'))
try {
  const storageRoot = join(work, 'storage'); const bundle = join(work, 'backup.wobak')
  const ledger = join(work, 'deletion-ledger.wobak'); const downloaded = join(work, 'downloaded.wobak')
  const restoredDump = join(work, 'restored.dump'); const restoredStorage = join(work, 'restored-storage'); const restoredLedger = join(work, 'restored-ledger.wobak')
  await mkdir(storageRoot, { mode: 0o700 })
  const admin = createClient(supabaseUrl, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  await assertStorageAccess(admin.storage, 'receipts')
  const inventory = await collectSupabaseStorage({ bucket: admin.storage.from('receipts'), output: storageRoot })
  await run(resolve('scripts/backup/export-deletion-ledger.mjs'), { ...process.env, WRITEOFFS_DELETION_LEDGER_OUTPUT: ledger })
  await run(resolve('scripts/backup/create-encrypted-backup.mjs'), { ...process.env, WRITEOFFS_BACKUP_STORAGE_ROOT: storageRoot, WRITEOFFS_BACKUP_OUTPUT: bundle, WRITEOFFS_BACKUP_DELETION_LEDGER: ledger })
  const client = makeS3Client(config)
  const uploaded = await uploadBackup({ client, config, input: bundle, environment: sourceEnvironment, backupClass: process.env.WRITEOFFS_BACKUP_CLASS || 'daily' })
  const downloadedResult = await downloadBackup({ client, config, key: uploaded.key, output: downloaded, expectedSha256: uploaded.sha256, expectedBytes: uploaded.bytes })
  await run(resolve('scripts/backup/restore-encrypted-backup.mjs'), { ...process.env, WRITEOFFS_RESTORE_INPUT: downloaded, WRITEOFFS_RESTORE_DATABASE_URL: '', WRITEOFFS_RESTORE_DATABASE_DUMP_OUTPUT: restoredDump, WRITEOFFS_RESTORE_STORAGE_ROOT: restoredStorage, WRITEOFFS_RESTORE_DELETION_LEDGER_OUTPUT: restoredLedger, WRITEOFFS_RESTORE_CONFIRM_ISOLATED: 'yes' })
  console.log(JSON.stringify({ completed: true, key: uploaded.key, bytes: uploaded.bytes, sha256: uploaded.sha256, versionId: uploaded.versionId, objects: inventory.length, roundTripVerified: downloadedResult.sha256 === uploaded.sha256 }))
} finally {
  await rm(work, { recursive: true, force: true })
}
