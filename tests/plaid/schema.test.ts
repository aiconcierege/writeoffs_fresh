import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260819001000_add_plaid_transactions_ingestion.sql'), 'utf8')

describe('Plaid canonical ingestion schema', () => {
  it('keeps credentials server-only and exposes narrow customer projections', () => {
    expect(sql).toContain('revoke all on public.plaid_items from public, anon, authenticated')
    expect(sql).toContain('list_plaid_connections()')
    expect(sql).not.toMatch(/grant select[^;]+plaid_items[^;]+authenticated/i)
  })

  it('makes provider transaction history append-only and tenant-composite', () => {
    expect(sql).toContain('plaid_transaction_versions_reject_mutation')
    expect(sql).toContain('foreign key (canonical_financial_transaction_id, business_id)')
    expect(sql).toContain('foreign key (supersedes_version_id, business_id)')
  })

  it('restricts sync writes to trusted service execution with cursor and lease checks', () => {
    expect(sql).toContain("if (select auth.role()) <> 'service_role'")
    expect(sql).toContain('selected_item.sync_cursor is distinct from p_expected_cursor')
    expect(sql).toContain('selected_item.sync_lease_id is distinct from p_lease_id')
    expect(sql).toContain('grant execute on function public.apply_plaid_transaction_sync')
    expect(sql).toContain('to service_role')
    expect(sql).toContain('financial_accounts_reject_untrusted_plaid_insert')
    expect(sql).toContain('financial_transactions_reject_untrusted_provider_insert')
    expect(sql).toContain('disconnect_plaid_item_state')
  })
})
