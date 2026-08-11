import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scheduleCPage = readFileSync(
  join(process.cwd(), 'app/reports/schedule-c/page.tsx'),
  'utf8'
)

describe('Schedule C receipt relationship', () => {
  it('uses the transaction receipt foreign key while preserving the receipts alias', () => {
    expect(scheduleCPage).toContain(
      'receipts:receipts!receipts_transaction_id_fkey(count)'
    )
    expect(scheduleCPage).not.toContain('categories(label), receipts(count)')
    expect(scheduleCPage).toContain('Array.isArray(r.receipts)')
  })
})
