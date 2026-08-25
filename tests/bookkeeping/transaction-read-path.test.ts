import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTransactionCursor,transactionCursor } from '../../app/lib/bookkeeping/transaction-read-model'

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('canonical-first transaction read path', () => {
  it('loads canonical immutable facts before tenant-scoped legacy fallback', () => {
    const model = source('app/lib/bookkeeping/transaction-read-model.ts')
    expect(model).toContain("from('bookkeeping_records')")
    expect(model).toContain("from('financial_transactions')")
    expect(model).toContain("from('bookkeeping_decisions')")
    expect(model).toContain("from('bookkeeping_document_links')")
    expect(model).toContain(".is('canonical_financial_transaction_id', null)")
    expect(model).toContain(".eq('user_id', input.userId)")
  })

  it('keeps legacy mutation controls unavailable for canonical rows', () => {
    const table = source('app/review/BulkTable.tsx')
    expect(table).toContain("t.sourceModel === 'legacy'")
    expect(table).toContain('t.treatmentLabel')
    expect(table).toContain('t.decisionReason')
  })

  it('uses the same compatibility adapter for the page and list API', () => {
    expect(source('app/transactions/page.tsx')).toContain('listTransactionReadModel')
    expect(source('app/transactions/[id]/page.tsx')).toContain('getTransactionDetailReadModel')
    expect(source('app/api/transactions/list/route.ts')).toContain('listTransactionReadModel')
  })

  it('pages source rows before current-leaf suppression and orders ties deterministically', () => {
    const model = source('app/lib/bookkeeping/transaction-read-model.ts')
    expect(model).toContain('.range(from, from + pageSize - 1)')
    expect(model).toContain(".order('id', { ascending: false })")
    expect(model.indexOf('.range(from, from + pageSize - 1)')).toBeLessThan(model.indexOf('resolution.isAbsorbed(recordId)'))
    expect(model).toContain('b.date.localeCompare(a.date) || b.id.localeCompare(a.id)')
    expect(model).toContain("toString('base64url')")
    expect(source('app/transactions/page.tsx')).toContain('Older activity')
  })

  it('round-trips an opaque stable date/id cursor and rejects malformed input',()=>{
    const row={date:'2026-08-25',id:'11111111-1111-4111-8111-111111111111'}
    expect(parseTransactionCursor(transactionCursor(row))).toEqual(row)
    expect(parseTransactionCursor('not-a-cursor')).toBeNull()
  })
})
