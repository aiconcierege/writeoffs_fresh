import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260722000300_create_financial_accounts.sql'),
  'utf8'
)

describe('financial account schema contract', () => {
  it('belongs to a business and has no direct user ownership', () => {
    expect(migration).toContain('business_id uuid not null references public.businesses(id)')
    expect(migration).not.toMatch(/\buser_id\b/)
  })

  it('keeps provider references optional and credentials out of the model', () => {
    expect(migration).toContain('provider text')
    expect(migration).toContain('provider_account_id text')
    expect(migration).not.toMatch(/^\s*(access_token|token_json|secret)\s+\w+/im)
  })

  it('protects stable account identity fields', () => {
    expect(migration).toContain('create trigger financial_accounts_protect_identity')
    expect(migration).toContain("raise exception 'financial account identity fields are immutable'")
  })

  it('isolates reads and inserts through business ownership', () => {
    expect(migration).toContain('alter table public.financial_accounts enable row level security')
    expect(migration).toContain('businesses.owner_user_id = (select auth.uid())')
  })
})
