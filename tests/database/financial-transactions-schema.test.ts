import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260722000400_create_financial_transactions.sql'),
  'utf8'
)

describe('financial transaction schema contract', () => {
  it('requires account and business ownership to agree', () => {
    expect(migration).toContain('foreign key (financial_account_id, business_id)')
    expect(migration).toContain('references public.financial_accounts(id, business_id)')
  })

  it('stores signed money in integer minor units', () => {
    expect(migration).toContain('amount_cents bigint not null')
    expect(migration).toContain('check (amount_cents <> 0)')
  })

  it('supports provider and CSV imports without depending on either', () => {
    expect(migration).toContain("import_method in ('provider', 'csv')")
    expect(migration).toContain('external_transaction_id text')
    expect(migration).toContain('source_fingerprint text not null')
  })

  it('rejects updates and deletes at the database boundary', () => {
    expect(migration).toContain('create trigger financial_transactions_reject_update')
    expect(migration).toContain('create trigger financial_transactions_reject_delete')
    expect(migration).toContain("raise exception 'financial transactions are immutable'")
  })

  it('contains no categorization or Economic Event state', () => {
    expect(migration).not.toMatch(/category|deductib|business_purpose|approval/i)
  })
})
