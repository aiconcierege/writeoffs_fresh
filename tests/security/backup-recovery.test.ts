import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const createScript = join(process.cwd(), 'scripts/backup/create-encrypted-backup.mjs')
const restoreScript = join(process.cwd(), 'scripts/backup/restore-encrypted-backup.mjs')
const ledgerExport=join(process.cwd(),'scripts/backup/export-deletion-ledger.mjs'),ledgerReconcile=join(process.cwd(),'scripts/backup/reconcile-deletion-ledger.mjs')

describe('independent encrypted backup tooling', () => {
  it('preserves grants required for RLS access in database dump and restore commands', () => {
    const create = readFileSync(createScript, 'utf8'); const restore = readFileSync(restoreScript, 'utf8')
    expect(create).not.toContain("'--no-privileges'")
    expect(restore).not.toContain("'--no-privileges'")
  })

  it('encrypts, authenticates, verifies, and restores database and private-object artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'writeoffs-backup-test-'))
    const storage = join(root, 'storage'); const restored = join(root, 'restored')
    mkdirSync(join(storage, 'receipts', 'tenant-a'), { recursive: true })
    writeFileSync(join(root, 'database.dump'), 'synthetic-postgres-dump')
    writeFileSync(join(storage, 'receipts', 'tenant-a', 'receipt.pdf'), 'synthetic-private-receipt')
    const output = join(root, 'backup.wobak')
    const key = randomBytes(32).toString('base64')
    execFileSync(process.execPath, [createScript], { env: { ...process.env,
      WRITEOFFS_BACKUP_OUTPUT: output, WRITEOFFS_BACKUP_DATABASE_DUMP: join(root, 'database.dump'),
      WRITEOFFS_BACKUP_STORAGE_ROOT: storage, WRITEOFFS_BACKUP_KEY_BASE64: key,
    } })
    execFileSync(process.execPath, [restoreScript], { env: { ...process.env,
      WRITEOFFS_RESTORE_INPUT: output, WRITEOFFS_RESTORE_STORAGE_ROOT: restored,
      WRITEOFFS_RESTORE_CONFIRM_ISOLATED: 'yes', WRITEOFFS_BACKUP_KEY_BASE64: key,
    } })
    expect(readFileSync(join(restored, 'receipts', 'tenant-a', 'receipt.pdf'), 'utf8')).toBe('synthetic-private-receipt')
  })

  it('fails closed when ciphertext is changed', () => {
    const root = mkdtempSync(join(tmpdir(), 'writeoffs-backup-tamper-'))
    const storage = join(root, 'storage'); mkdirSync(storage)
    const key = randomBytes(32).toString('base64'); const encrypted = join(root, 'backup')
    writeFileSync(join(root, 'database.dump'), 'sensitive data')
    execFileSync(process.execPath, [createScript], { env: { ...process.env,
      WRITEOFFS_BACKUP_OUTPUT: encrypted, WRITEOFFS_BACKUP_DATABASE_DUMP: join(root, 'database.dump'),
      WRITEOFFS_BACKUP_STORAGE_ROOT: storage, WRITEOFFS_BACKUP_KEY_BASE64: key,
    } })
    const payload = readFileSync(encrypted); payload[Math.floor(payload.length / 2)] ^= 1; writeFileSync(encrypted, payload)
    expect(() => execFileSync(process.execPath, [restoreScript], { stdio: 'pipe', env: { ...process.env,
      WRITEOFFS_RESTORE_INPUT: encrypted, WRITEOFFS_RESTORE_STORAGE_ROOT: join(root, 'restored'),
      WRITEOFFS_RESTORE_CONFIRM_ISOLATED: 'yes', WRITEOFFS_BACKUP_KEY_BASE64: key,
    } })).toThrow()
  })
  it('keeps the deletion ledger encrypted and requires isolated reconciliation',()=>{const exported=readFileSync(ledgerExport,'utf8'),reconciled=readFileSync(ledgerReconcile,'utf8');expect(exported).toContain('encryptFile');expect(exported).not.toContain('transaction descriptions');expect(reconciled).toContain('decryptFile');expect(reconciled).toContain("WRITEOFFS_RESTORE_CONFIRM_ISOLATED!=='yes'");expect(reconciled).toContain('reconcile_restored_deletion_tombstones')})
})
