import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260819000100_add_canonical_csv_ingestion.sql'),
  'utf8'
)

describe('canonical CSV ingestion schema contract', () => {
  it('derives tenant authority from auth and accepts no Business, user, or account id', () => {
    expect(migration).toContain('authenticated_user_id uuid := (select auth.uid())')
    expect(migration).toContain('where businesses.owner_user_id = authenticated_user_id')
    expect(migration).not.toMatch(/p_(business|user|financial_account)_id/)
  })

  it('creates immutable financial evidence and unresolved canonical history atomically', () => {
    expect(migration).toContain('insert into public.financial_transactions')
    expect(migration).toContain("'financial_transaction:' || selected_transaction.id::text")
    expect(migration).toContain('public.ensure_bookkeeping_record(')
    expect(migration).toContain('public.ensure_initial_bookkeeping_decision(')
    expect(migration).toContain('insert into public.transactions')
  })

  it('uses deterministic account and transaction identities with serialized retries', () => {
    expect(migration).toContain("selected_business_id::text || ':manual-default:' || currency")
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(migration).toContain('on conflict (financial_account_id, source_fingerprint) do nothing')
    expect(migration).toContain('on conflict (user_id, dedupe_hash) do nothing')
  })

  it('keeps the narrow security-definer RPC authenticated-only', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('from public, anon, service_role')
    expect(migration).toContain('to authenticated')
    expect(migration).toContain(
      'grant select on public.financial_accounts to authenticated, service_role'
    )
    expect(migration).toContain(
      'grant select on public.transactions to authenticated, service_role'
    )
    expect(migration).not.toContain(
      'grant insert on public.financial_accounts to authenticated'
    )
  })

  it('does not fabricate bookkeeping conclusions or write receipt state', () => {
    expect(migration).not.toMatch(/append_bookkeeping_decision/)
    expect(migration).not.toMatch(/category_key\s*[,)]/)
    expect(migration).not.toMatch(/receipt_waived|receipts\.transaction_id|bookkeeping_document_links/)
  })
})
