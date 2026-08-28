import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applicationNavigationSection,
  isAuthenticatedRoute,
} from '../../app/lib/route-policy'

const source = (path: string) => readFileSync(path, 'utf8')

describe('canonical application and public shell routes', () => {
  it('keeps public pages outside the authenticated application shell', () => {
    for (const route of ['/', '/login', '/signup', '/press', '/legal/privacy', '/legal/terms', '/legal/tax-disclaimer']) {
      expect(isAuthenticatedRoute(route), route).toBe(false)
    }
    const header = source('app/components/Header.tsx')
    expect(header).toContain('if (!isAuthenticatedRoute(pathname))')
    expect(header).toContain('href="/#how"')
  })

  it('gives product and transient workflow pages the authenticated shell', () => {
    for (const route of [
      '/home', '/transactions', '/transactions/record-id', '/reports', '/reports/schedule-c',
      '/settings', '/settings/banking', '/settings/security', '/onboarding', '/questions', '/receipts', '/import', '/export',
      '/mfa/challenge', '/reset-password',
    ]) {
      expect(isAuthenticatedRoute(route), route).toBe(true)
    }
  })

  it('maps canonical and child routes to one primary navigation section', () => {
    expect(applicationNavigationSection('/home')).toBe('home')
    expect(applicationNavigationSection('/transactions/record-id')).toBe('transactions')
    expect(applicationNavigationSection('/reports')).toBe('reports')
    expect(applicationNavigationSection('/reports/schedule-c')).toBe('reports')
    expect(applicationNavigationSection('/export')).toBe('reports')
    expect(applicationNavigationSection('/settings')).toBe('account')
    expect(applicationNavigationSection('/settings/banking')).toBe('account')
    expect(applicationNavigationSection('/receipts')).toBeNull()
  })

  it('uses Home plus one global record and account menu', () => {
    const header = source('app/components/Header.tsx')
    expect(header).toContain('href="/home"')
    expect(header).toContain('["Transactions", "/transactions"]')
    expect(header).toContain('["Reports", "/reports"]')
    expect(header).toContain('["Account and settings", "/settings"]')
    expect(header).toContain('Menu')
    expect(header).toContain('href="/home" heightPx={36}')
    for (const group of ['Your books', 'Betti', 'Your account']) expect(header).toContain(group)
    expect(header).toContain('aria-label="Authenticated navigation"')
    expect(header).toContain('onClick={closeMenu}')
    expect(header).toContain("event.key !== 'Escape'")
    expect(header).toContain('menu.current.querySelector(\'summary\')?.focus()')
  })

  it('protects product routes and redirects authenticated auth-page visitors', () => {
    const middleware = source('proxy.ts')
    expect(middleware).toContain('if (!user && isAuthenticatedRoute(pathname))')
    expect(middleware).toContain("url.pathname = '/login'")
    expect(middleware).toContain("pathname === '/login' || pathname === '/signup'")
    expect(middleware).toContain("url.pathname = '/home'")
    expect(middleware).toContain('redirectWithRefreshedAuthCookies(url, res)')
    expect(middleware).toContain('nextRequiredCustomerDestination')
  })

  it('uses canonical Settings and Reports routes with compatibility redirects', () => {
    expect(source('app/settings/page.tsx')).toContain('<SettingsForm initial={initial} />')
    expect(source('app/settings/page.tsx')).toContain('href="/settings/banking"')
    expect(source('app/settings/profile/page.tsx')).toContain("redirect('/settings')")
    expect(source('app/settings/banking/page.tsx')).toContain('<BankConnect')
    expect(source('app/reports/page.tsx')).toContain('<ReportsSummary scope=')
    expect(source('app/reports/summary/page.tsx')).toContain("redirect('/reports')")
    expect(source('app/reports/schedule-c/page.tsx')).toContain('getAuthenticatedCanonicalReport')
  })

  it('preserves all approved compatibility redirects', () => {
    expect(source('app/dashboard/page.tsx')).toContain("redirect('/home')")
    expect(source('app/review/page.tsx')).toContain("redirect('/transactions')")
    expect(source('app/realtor/page.tsx')).toContain("redirect('/')")
    expect(source('app/waitlist/page.tsx')).toContain("redirect('/#waitlist')")
  })

  it('uses canonical legal links and public indexing policy', () => {
    const signup = source('app/signup/page.tsx')
    expect(signup).toContain('href="/legal/terms"')
    expect(signup).toContain('href="/legal/privacy"')
    expect(signup).not.toMatch(/href=["']\/(terms|privacy)["']/)

    const sitemap = source('app/sitemap.ts')
    expect(sitemap).not.toMatch(/["']waitlist["']/)
    expect(sitemap).toContain('"legal/privacy"')
    expect(sitemap).toContain('"legal/terms"')

    const robots = source('app/robots.ts')
    for (const route of ['/home', '/transactions', '/reports', '/settings', '/receipts', '/import', '/export']) {
      expect(robots, route).toContain(`"${route}"`)
    }
  })

  it('keeps receipt and import workflows reachable without redesigning them', () => {
    expect(source('app/receipts/page.tsx')).toContain('<ReceiptsInner />')
    expect(source('app/import/page.tsx')).toContain("fetch('/api/import/csv'")
    expect(source('app/import/page.tsx')).toContain('WriteOffs will add this activity to Transactions')
  })
})
