import { expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBookkeepingEvaluationSnapshot } from '../../app/lib/bookkeeping/evaluation-snapshot'
import { classifyOperatingExpense } from '../../app/lib/bookkeeping/operating-expense-classification'
import { supportedMealPurpose } from '../../app/lib/bookkeeping/shared-evidence'

vi.mock('../../app/lib/bookkeeping/current-record-resolution', () => ({ loadCurrentRecordConvergences: async () => ({
  resolve: () => 'survivor', isInactive: () => false, evidenceRecordIds: () => ['survivor', 'absorbed'],
  convergences: [], compoundComponent: () => null,
}) }))
vi.mock('../../app/lib/bookkeeping/supabase-repository', () => ({ SupabaseBookkeepingRepository: class {
  async findCurrentDecision() { return { id: 'decision', businessId: 'tenant', bookkeepingRecordId: 'survivor',
    bookkeepingNature: 'expense', treatment: 'business', provenance: 'user', businessPurpose: 'food',
    allocations: [{ kind: 'business', amountCents: -954 }], confidence: null } }
} }))

it('loads receipt-only and converged evidence through the real snapshot boundary without writes or invented meal purpose', async () => {
  const requests: Array<{ table: string; filters: unknown[] }> = []
  const rows: Record<string, unknown> = {
    bookkeeping_records: { id: 'survivor', source_kind: 'receipt', amount_cents: -954, currency: 'USD', occurred_on: '2026-09-08' },
    businesses: { business_description: 'Consulting' }, bookkeeping_financial_sources: null,
    bookkeeping_decisions: [{ id: 'decision', provenance: 'user' }],
    bookkeeping_review_events: [{ id: 'answer', event_type: 'answered', provenance: 'user',
      question_context: { factType: 'ordinary_expense_purpose' }, answer_payload: { businessPurpose: 'food' } }],
    bookkeeping_document_links: [{ id: 'link', receipt_id: 'receipt' }],
    bookkeeping_receipt_meal_candidates: [], bookkeeping_receipt_events: [{ id: 'upload', receipt_id: 'receipt' }],
    current_bookkeeping_receipt_extractions: [{ id: 'extraction', business_id: 'tenant', receipt_id: 'receipt',
      provider: 'google_vision', merchant: "McDonald's", occurred_on: '2026-09-08', total_amount_cents: 954,
      quality_status: 'usable', raw_payload: { extractedText: "McDonald's Restaurant\nSausage McMuffin\nHash Brown\nMedium Coffee" } }],
  }
  const db = { from(table: string) {
    const request = { table, filters: [] as unknown[] }; requests.push(request)
    const result = () => ({ data: rows[table] ?? [], error: null })
    const q = { select: () => q, eq: (...args: unknown[]) => { request.filters.push(args); return q },
      in: (...args: unknown[]) => { request.filters.push(args); return q }, is: () => q, not: () => q,
      maybeSingle: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
    return q
  } } as unknown as SupabaseClient
  const snapshot = await loadBookkeepingEvaluationSnapshot({ admin: db, businessId: 'tenant', recordId: 'absorbed' })
  expect(snapshot.recordId).toBe('survivor')
  expect(snapshot.merchantName).toBe("McDonald's")
  expect(classifyOperatingExpense(snapshot)).toMatchObject({ categoryKey: 'meals', taxFacts: { mealBusinessContext: false } })
  expect(supportedMealPurpose(snapshot)).toBeNull()
  expect(snapshot.evidence?.receipts[0].source).toMatchObject({ id: 'extraction', provider: 'google_vision', basis: 'observed', confidence: null })
  expect(snapshot.evidence?.observations).toContainEqual(expect.objectContaining({ fact: 'ordinary_expense_purpose',
    source: expect.objectContaining({ id: 'answer', basis: 'customer_supplied' }) }))
  for (const table of ['bookkeeping_document_links', 'bookkeeping_review_events']) {
    expect(requests.find(r => r.table === table)?.filters).toContainEqual(['bookkeeping_record_id', ['survivor', 'absorbed']])
  }
  expect(requests.find(r => r.table === 'current_bookkeeping_receipt_extractions')?.filters).toContainEqual(['business_id', 'tenant'])
})
