import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260817000800_integrate_canonical_documentation_evidence.sql',
  'utf8'
)

describe('canonical documentation evidence migration contract', () => {
  it('ties evidence observations to a real Business-scoped canonical link', () => {
    expect(migration).toContain('bookkeeping_document_link_id uuid')
    expect(migration).toContain('bookkeeping_documentation_events_link_fkey')
    expect(migration).toContain('bookkeeping_document_links_event_scope_unique')
    expect(migration).toContain('bookkeeping_documentation_events_link_observation_idx')
    expect(migration).toContain("'evidence_attached'")
  })

  it('uses narrow authenticated attachment and revocation operations', () => {
    expect(migration).toContain('attach_bookkeeping_receipt_with_documentation')
    expect(migration).toContain('revoke_bookkeeping_receipt_with_documentation')
    expect(migration).toContain('revoke insert, update on public.bookkeeping_document_links from authenticated')
    expect(migration).toContain('receipt_for_record')
    expect(migration).toContain('to authenticated')
  })

  it('does not write bookkeeping, Weekly Review, receipt metadata, or legacy state', () => {
    for (const table of [
      'bookkeeping_decisions',
      'bookkeeping_allocations',
      'bookkeeping_review_events',
      'transactions',
      'receipts',
    ]) {
      expect(migration).not.toMatch(
        new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${table}`, 'i')
      )
    }
    for (const field of [
      'receipt_waived', 'needs_review', 'approved', 'category_key',
      'receipts.transaction_id',
    ]) {
      expect(migration).not.toContain(field)
    }
  })
})
