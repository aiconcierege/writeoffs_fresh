import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createTaxTimeReportPdf } from '../../app/lib/bookkeeping/tax-time-report-pdf'

export function reportFixture(reviewCount = 0) {
  return {
    status: 'ready', taxYear: 2026, businessName: 'Fixture Studio', scope: 'business',
    totals: { businessIncomeCents: 300000, businessExpensesCents: 90000, businessProfitCents: 210000,
      estimatedDeductionsCents: 85000, businessMilesMilli: 12000 },
    scheduleCCategories: ['Supplies', 'Advertising', 'Meals', 'Utilities', 'Office expense'].map((categoryLabel, i) =>
      ({ categoryKey: String(i), categoryLabel, amountCents: 17000, transactionCount: 3 })),
    vehicleReports: [], reviewItems: Array.from({ length: reviewCount }, (_, i) => ({
      kind: 'potential_capital_asset', title: `Purchase ${i + 1}: ${'Long merchant name '.repeat(5)}`,
      detail: 'This purchase may be longer-term business property. You or your tax preparer may consider depreciation, Section 179, or other applicable treatment.',
      description: 'Computer for customer projects', occurredOn: '2026-06-01', amountCents: 150000,
      businessAmountCents: 120000, currentHandling: 'Business purchase; no current-year deduction assigned',
    })),
  }
}

async function inspect(fixture: ReturnType<typeof reportFixture>) {
  const bytes = await createTaxTimeReportPdf({ readiness: fixture as never, generatedAt: new Date('2026-09-14T00:00:00Z') })
  expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF')
  const structure = await PDFDocument.load(bytes)
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise
  const text: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    expect(structure.getPage(i - 1).getSize()).toEqual({ width: 612, height: 792 })
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      text.push(item.str)
      expect(item.transform[4]).toBeGreaterThanOrEqual(53)
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(560)
      expect(item.transform[5]).toBeGreaterThanOrEqual(27)
      expect(item.transform[5]).toBeLessThanOrEqual(750)
    }
  }
  await pdf.destroy()
  return { text: text.join(' '), pages: structure.getPageCount(), bytes }
}

describe('Tax-Time Report PDF', () => {
  it('has searchable summary numbers, letter pages, and no empty review section', async () => {
    const result = await inspect(reportFixture())
    expect(result.text).toContain('Your books are ready for tax preparation.')
    for (const amount of ['$3,000.00', '$900.00', '$2,100.00']) expect(result.text).toContain(amount)
    expect(result.text).not.toContain('Items for you or your tax preparer')
    expect(result.text).not.toContain('Vehicle and mileage')
    expect(result.pages).toBe(1)
  })
  it('paginates many review items and long names without clipping or losing content', async () => {
    const fixture = reportFixture(18)
    fixture.businessName = 'A'.repeat(180)
    const result = await inspect(fixture)
    expect(result.pages).toBeGreaterThan(2)
    expect(result.pages).toBeLessThan(12)
    expect(result.text).toContain('Purchase 18:')
    expect(result.text).toContain('$1,200.00')
    expect(result.text).not.toMatch(/Section 179 eligible|qualifies for Section 179|allocation_id|fingerprint/i)
  })
  it('renders canonical vehicle values without adding its own tax arithmetic', async () => {
    const fixture = reportFixture(2)
    Object.assign(fixture, { vehicleReports: [{ displayName: '2023 Work van', method: 'actual_expenses', businessMilesMilli: 123456,
      actualExpenseCents: 250000, deductibleActualExpenseCents: 125000, allocationBasisPoints: 5000,
      mileageDeductionCents: 0, expenses: [{ kind: 'parking', deductibleCents: 1250 }] }] })
    const { text } = await inspect(fixture)
    for (const value of ['Vehicle and mileage', '2023 Work van', '123.456 miles', '50.00%', '$1,250.00', '$12.50']) expect(text).toContain(value)
  })
  it('does not append transactions, fetch receipts, or call AI while rendering', async () => {
    const fixture = reportFixture()
    Object.assign(fixture, { rows: Array.from({ length: 1000 }, () => ({ merchant: 'PRIVATE TRANSACTION DETAIL' })) })
    expect((await inspect(fixture)).text).not.toContain('PRIVATE TRANSACTION DETAIL')
    const renderer = readFileSync('app/lib/bookkeeping/tax-time-report-pdf.ts', 'utf8')
    expect(renderer).not.toMatch(/fetch\(|storage\.|createSignedUrl|openai|evaluateBookkeeping/)
  })
  it('preserves historical documentation limits as searchable report text',async()=>{
    const fixture=reportFixture()
    Object.assign(fixture,{issues:[{code:'HISTORICAL_DOCUMENTATION_LIMITATION',detail:'21 purchases still lack meal details. No missing facts were assumed.'}]})
    const result=await inspect(fixture)
    expect(result.text).toContain('Documentation notes')
    expect(result.text).toContain('21 purchases still lack meal details')
    expect(result.text).toContain('Missing meal details have not been assumed.')
  })
  it('preserves zero and negative annual values', async () => {
    const fixture = reportFixture()
    fixture.totals.businessIncomeCents = 0
    fixture.totals.businessProfitCents = -90000
    const { text } = await inspect(fixture)
    expect(text).toContain('$0.00')
    expect(text).toContain('-$900.00')
  })
})
