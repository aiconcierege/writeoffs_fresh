import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('tax-time customer surface', () => {
  it('uses the existing Reports section and bounded canonical downloads', () => {
    const page = readFileSync('app/reports/tax-time/page.tsx','utf8')
    expect(page).toContain('Download Tax-Time Report')
    expect(page).toContain('Your books are ready for tax preparation.')
    expect(page).toContain('Check in with Betti')
    expect(page).toContain('/api/reports/tax-time-report?year=')
    expect(page).toContain('/api/export/csv?year=')
    expect(page).toContain('/api/mileage/export?year=')
    expect(page).toContain('/api/contractors/export?year=')
    expect(page).toContain('/reports/schedule-c?year=')
    expect(page).not.toMatch(/trial balance|closing entr|audit proof|IRS compliant|1099 required|do you have a cpa|which tax software/i)
    const route = readFileSync('app/api/reports/tax-time-report/route.ts','utf8')
    expect(route).toContain("readiness.status !== 'ready'")
    expect(route).toContain("'Cache-Control': 'private, no-store'")
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain('loadCustomerEntitlements')
    expect(route).toContain("'expired_read_only','pending_deletion'")
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
