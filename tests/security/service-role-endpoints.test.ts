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
    'app/api/teller/import/route.ts',
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

  it('blocks new Teller enrollments at both UI and API boundaries', () => {
    const connectComponent = source('app/components/BankConnect.tsx')
    const enrollRoute = source('app/api/teller/enroll/route.ts')

    expect(connectComponent).toContain('disabled')
    expect(connectComponent).not.toContain('cdn.teller.io')
    expect(enrollRoute).toContain('status: 410')
    expect(enrollRoute).not.toContain('.from("bank_connections").insert')
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
    expect(source('app/api/transactions/list/route.ts')).toContain('.eq("user_id", user.id)')
    expect(source('app/api/transactions/export/route.ts')).toContain('.eq("user_id", user.id)')
    expect(source('app/api/export/csv/route.ts')).toContain(".eq('user_id', user.id)")
  })

  it('assigns the authenticated user to imported compatibility transactions', () => {
    expect(source('app/api/import/csv/route.ts')).toContain('user_id: user.id')
    expect(source('app/api/teller/import/route.ts')).toContain('user_id: user.id')
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
