import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function source(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8')
}

describe('customer endpoint isolation', () => {
  const authenticatedRoutes = [
    'app/api/transactions/list/route.ts',
    'app/api/transactions/export/route.ts',
    'app/api/import/csv/route.ts',
    'app/api/mileage/create/route.ts',
    'app/api/mileage/list/route.ts',
    'app/api/mileage/export/route.ts',
  ]

  it.each(authenticatedRoutes)('%s requires an authenticated context', (route) => {
    const contents = source(route)

    expect(contents).toContain('getAuthenticatedContext')
    expect(contents).toContain('unauthorizedResponse')
  })

  it('does not expose the environment diagnostics endpoint', () => {
    expect(existsSync(join(root, 'app/api/debug/env/route.ts'))).toBe(false)
  })

  it('does not expose the receipt diagnostics page', () => {
    expect(existsSync(join(root, 'app/receipts/debug/page.tsx'))).toBe(false)
  })

  it('does not expose a user-facing mileage page during the initial product', () => {
    expect(existsSync(join(root, 'app/mileage/page.tsx'))).toBe(false)
  })

  it('does not expose the retired Teller token-exchange endpoint', () => {
    expect(existsSync(join(root, 'app/api/teller/token/route.ts'))).toBe(false)
  })

  it('keeps Teller enrollment unavailable after retiring its API endpoint', () => {
    const connectComponent = source('app/components/BankConnect.tsx')

    expect(connectComponent).toContain('disabled')
    expect(connectComponent).not.toContain('cdn.teller.io')
    expect(existsSync(join(root, 'app/api/teller/enroll/route.ts'))).toBe(false)
  })

  it('does not expose the retired Teller webhook endpoint', () => {
    expect(existsSync(join(root, 'app/api/teller/webhook/route.ts'))).toBe(false)
  })

  it('does not expose the retired Teller accounts diagnostic page', () => {
    expect(existsSync(join(root, 'app/teller/accounts/page.tsx'))).toBe(false)
  })

  it('does not expose retired Teller runtime files', () => {
    for (const file of [
      'app/api/teller/accounts/route.ts',
      'app/api/teller/transactions/route.ts',
      'app/api/teller/import/route.ts',
      'app/lib/teller.ts',
    ]) {
      expect(existsSync(join(root, file)), file).toBe(false)
    }
  })

  it('keeps banking settings provider-neutral while connections are unavailable', () => {
    const bankingSettings = source('app/settings/banking/page.tsx')
    const profileSettings = source('app/settings/profile/page.tsx')

    expect(bankingSettings).toContain('BankConnect')
    expect(bankingSettings).not.toContain('BankAccounts')
    expect(bankingSettings).not.toContain('bank_connections')
    expect(bankingSettings).not.toContain('provider", "teller')
    expect(bankingSettings).not.toContain('access_token')
    expect(profileSettings).not.toContain('bank_connections')
    expect(profileSettings).not.toContain('Connected (coming soon)')
    expect(existsSync(join(root, 'app/components/BankAccounts.tsx'))).toBe(false)
  })

  it('does not use a service-role credential in customer API handlers', () => {
    const routes = [
      ...authenticatedRoutes,
      'app/api/export/csv/route.ts',
      'app/api/reports/summary/route.ts',
    ]

    for (const route of routes) {
      expect(source(route), route).not.toMatch(/SUPABASE_SERVICE_ROLE|service_role/i)
    }
  })

  it('explicitly scopes compatibility transaction reads to the user', () => {
    expect(source('app/api/transactions/list/route.ts')).toContain('userId: user.id')
    const readModel = source('app/lib/bookkeeping/transaction-read-model.ts')
    expect(readModel).toContain(".eq('owner_user_id', input.userId)")
    expect(readModel).toContain(".eq('business_id', businessId)")
    expect(readModel).toContain(".eq('user_id', input.userId)")
    expect(source('app/api/transactions/export/route.ts')).toContain('.eq("user_id", user.id)')
    expect(source('app/api/export/csv/route.ts')).toContain(".eq('user_id', user.id)")
  })

  it('derives CSV tenant identity inside the authenticated canonical operation', () => {
    const route = source('app/api/import/csv/route.ts')
    const migration = source(
      'supabase/migrations/20260819000100_add_canonical_csv_ingestion.sql'
    )
    expect(route).toContain('getAuthenticatedContext')
    expect(route).toContain('ingestCsvFinancialActivity')
    expect(migration).toContain('authenticated_user_id uuid := (select auth.uid())')
    expect(migration).toContain('where businesses.owner_user_id = authenticated_user_id')
    expect(migration).not.toMatch(/p_(business|user)_id/)
  })

  it('keeps mileage unavailable until ownership can be enforced', () => {
    for (const route of [
      'app/api/mileage/create/route.ts',
      'app/api/mileage/list/route.ts',
      'app/api/mileage/export/route.ts',
    ]) {
      expect(source(route), route).toContain('temporarilyUnavailableResponse')
    }
  })
})
