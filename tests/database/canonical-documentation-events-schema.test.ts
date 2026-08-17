import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260817000700_add_canonical_documentation_events.sql',
  'utf8'
)

describe('canonical documentation event migration contract', () => {
  it('creates one append-only tenant-owned event chain', () => {
    expect(migration).toContain('create table public.bookkeeping_documentation_events')
    expect(migration).toContain("reason = 'MISSING_SUPPORTING_DOCUMENTATION'")
    for (const event of ['request_opened', 'receipt_lost', 'evidence_attached', 'resolved', 'reopened']) {
      expect(migration).toContain(`'${event}'`)
    }
    expect(migration).toContain('bookkeeping_documentation_events_one_successor_idx')
    expect(migration).toContain('bookkeeping_documentation_events_reject_update_delete')
    expect(migration).toContain('bookkeeping_documentation_events_select_own_business')
  })

  it('has narrow trusted and customer operations with no bookkeeping or legacy writes', () => {
    expect(migration).toContain('open_bookkeeping_documentation_request')
    expect(migration).toContain('mark_bookkeeping_receipt_lost')
    expect(migration).toContain('reopen_bookkeeping_documentation_request')
    expect(migration).toContain('list_current_bookkeeping_documentation_requests')
    expect(migration).toContain('to service_role')
    expect(migration).toContain('to authenticated')
    for (const table of [
      'transactions', 'bookkeeping_decisions', 'bookkeeping_allocations',
      'bookkeeping_review_events', 'bookkeeping_document_links',
    ]) {
      expect(migration).not.toMatch(new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${table}`, 'i'))
    }
    expect(migration).not.toContain('receipt_waived')
    expect(migration).not.toContain('receipts.transaction_id')
  })
})
