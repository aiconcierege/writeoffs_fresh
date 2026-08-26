import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('tax-time customer surface', () => {
  it('uses the existing Reports section and bounded canonical downloads', () => {
    const page = readFileSync('app/reports/tax-time/page.tsx','utf8')
    expect(page).toContain('Download tax records')
    expect(page).toContain('/api/export/csv?year=')
    expect(page).toContain('/api/mileage/export?year=')
    expect(page).toContain('/api/contractors/export?year=')
    expect(page).toContain('/reports/schedule-c?year=')
    expect(page).not.toMatch(/trial balance|closing entr|audit proof|IRS compliant|1099 required/i)
  })
  it('keeps Home restrained and points customers to canonical Reports', () => {
    const home = readFileSync('app/home/page.tsx','utf8')
    expect(home).toContain('href="/reports"')
    expect(home).toContain('See reports')
  })
  it('keeps the selected tax year on the Schedule C preparation summary', () => {
    const page = readFileSync('app/reports/schedule-c/page.tsx','utf8')
    expect(page).toContain('validateTaxYear')
    expect(page).toContain('periodStart: `${year}-01-01`')
    expect(page).toContain('/api/export/csv?year=${year}')
  })
})
