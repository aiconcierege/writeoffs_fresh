import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260819000200_add_csv_multiplicity_and_transaction_read_link.sql'), 'utf8')

describe('canonical CSV multiplicity and read correlation schema', () => {
  it('validates occurrence identities server-side and serializes imports', () => {
    expect(migration).toContain('csv:occurrence:v1')
    expect(migration).toContain('normalized_fingerprint')
    expect(migration).toContain('occurrence - 1')
    expect(migration).toContain('pg_advisory_xact_lock')
  })

  it('correlates one immutable canonical source with one legacy compatibility row', () => {
    expect(migration).toContain('canonical_financial_transaction_id')
    expect(migration).toContain('unique (canonical_financial_transaction_id)')
    expect(migration).toContain('canonicalized compatibility transactions are immutable')
  })

  it('prevents legacy receipt mutation from contradicting canonical evidence', () => {
    expect(migration).toContain('protect_canonical_legacy_receipt_link')
    expect(migration).toContain('canonical document matching')
  })

  it('introduces no grants, service credentials, or historical classification backfill', () => {
    expect(migration).not.toMatch(/grant\s+(insert|update|delete).*transactions/i)
    expect(migration).not.toMatch(/service_role_key|category_key\s*=|bookkeeping_nature\s*=/i)
  })
})
