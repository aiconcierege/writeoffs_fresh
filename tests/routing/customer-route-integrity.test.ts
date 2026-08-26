import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { customerRoutes, dynamicCustomerRoutes } from '../../app/lib/customer-routes'
import { isAuthenticatedRoute } from '../../app/lib/route-policy'

const routeFile = (route: string) => `app${route.split('?')[0] === '/' ? '' : route.split('?')[0]}/page.tsx`
const read = (file: string) => readFileSync(file, 'utf8')

describe('customer route integrity', () => {
  it('maps every canonical customer destination to an implemented protected page', () => {
    for (const route of Object.values(customerRoutes)) {
      expect(existsSync(routeFile(route)), `${route} should have an App Router page`).toBe(true)
      expect(isAuthenticatedRoute(route.split('?')[0]), route).toBe(true)
    }
    for (const route of Object.values(dynamicCustomerRoutes)) {
      expect(existsSync(routeFile(route)), `${route} should have an App Router page`).toBe(true)
      expect(isAuthenticatedRoute(route.replace('/[id]', '/example')), route).toBe(true)
    }
  })

  it('defines one route for each creation and annual-record workflow', () => {
    expect(customerRoutes.moneyReceived).toBe('/money?kind=received')
    expect(customerRoutes.moneySpent).toBe('/money?kind=spent')
    expect(customerRoutes.invoices).toBe('/invoices')
    expect(dynamicCustomerRoutes.invoiceDetail).toBe('/invoices/[id]')
    expect(customerRoutes.taxTime).toBe('/reports/tax-time')
  })

  it('keeps customer actions discoverable from implemented product surfaces', () => {
    const home = read('app/home/page.tsx')
    expect(home).toContain("['/receipts', 'Receipts'")
    expect(home).toContain("['/mileage', 'Mileage'")
    expect(home).toContain("['/invoices', 'Invoices'")
    expect(read('app/get-started/page.tsx')).toContain('<GetStartedFlow')
    expect(read('app/reports/ReportsSummary.tsx')).toContain('href="/reports/tax-time"')
    expect(read('app/settings/page.tsx')).toContain('href="/settings/banking"')
    expect(read('app/questions/page.tsx')).toContain('<QuestionFlow')
  })
})
