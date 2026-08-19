import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
