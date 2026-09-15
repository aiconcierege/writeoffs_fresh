import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from '@playwright/test'
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
if (process.env.WRITEOFFS_ENVIRONMENT !== 'staging' || new URL(url).hostname !== 'sgrqrrxrlglhjuetdtps.supabase.co') throw new Error('Staging only')
const origin = 'https://writeoffs-fresh-staging.vercel.app', directory = '/private/tmp/writeoffs-tax-time-proof'
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const hash = createHmac('sha1', key).update(counter).digest(), offset = hash.at(-1) & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}
const fixtures = JSON.parse(await readFile(`${directory}/staging-fixtures.json`, 'utf8'))
const browser = await chromium.launch({ headless: true })
try {
  for (const fixture of (process.argv.includes('--resolve-blocker') ? fixtures.filter(item => item.label === 'blocked') : fixtures)) {
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const identity = await admin.auth.admin.getUserById(fixture.userId)
    assert.equal(identity.data.user?.user_metadata.synthetic_tax_time_validation, true)
    assert.equal(identity.data.user?.email, fixture.email)
    const factors = await admin.auth.admin.mfa.listFactors({ userId: fixture.userId })
    if (factors.error) throw factors.error
    for (const factor of factors.data.factors) {
      if (factor.friendly_name?.startsWith('Tax-time proof ')) {
        const removed = await admin.auth.admin.mfa.deleteFactor({ userId: fixture.userId, id: factor.id })
        if (removed.error) throw removed.error
      }
    }
    const cookies = new Map()
    const supabase = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
    } })
    const login = await supabase.auth.signInWithPassword({ email: fixture.email, password: fixture.password })
    if (login.error) throw login.error
    // Use real MFA for these isolated synthetic identities; never change bypass policy.
    const enrollment = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Tax-time proof ${Date.now()}` })
    if (enrollment.error) throw enrollment.error
    const verified = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret) })
    if (verified.error) throw verified.error
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
    await context.addCookies([...cookies].map(([name, value]) => ({ name, value, domain: new URL(origin).hostname, path: '/', secure: true, sameSite: 'Lax' })))
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    const reportsResponse = await page.goto(`${origin}/reports`)
    assert.equal(reportsResponse?.status(), 200)
    await page.getByRole('heading', { name: /ready for tax preparation|Betti needs a few answers|Betti is checking/ }).first().waitFor()
    const response = await page.goto(`${origin}/reports/tax-time?year=2025`)
    console.log(JSON.stringify({ fixture: fixture.label, status: response?.status(), path: new URL(page.url()).pathname }))
    assert.equal(response?.status(), 200)
    assert.equal(new URL(page.url()).pathname, '/reports/tax-time')
    if (fixture.label === 'blocked') {
      assert(await page.getByRole('link', { name: /Check in with Betti/ }).count())
      await page.getByRole('link', { name: /Check in with Betti/ }).click()
      await page.waitForURL('**/check-in')
      assert.equal(new URL(page.url()).pathname, '/check-in')
      await page.screenshot({ path: `${directory}/browser-blocked-check-in.png`, fullPage: true })
      if (process.argv.includes('--resolve-blocker')) {
        const answerResponse = page.waitForResponse(response => response.url().includes('/api/bookkeeping/questions/') && response.request().method() === 'POST')
        await page.getByRole('button', { name: 'Yes, business', exact: true }).click()
        assert.equal((await answerResponse).status(), 200)
        let ready = false
        for (let attempt = 0; attempt < 40; attempt++) {
          const result = await context.request.get(`${origin}/api/reports/tax-time?year=2025`)
          const state = await result.json()
          if (state.status === 'ready') { ready = true; break }
          await page.waitForTimeout(3000)
        }
        assert(ready, 'Check-in answer should resolve the year-end blocker')
        await page.goto(`${origin}/reports/tax-time?year=2025`)
        await page.getByRole('heading', { name: 'Your books are ready for tax preparation.', exact: true }).waitFor()
        await writeFile(`${directory}/check-in-result.json`, JSON.stringify({ result: 'passed', checkInAnswerResolvedReadiness: true }))
        console.log('Live Check-in answer resolved the blocker and made the annual report ready.')
      }
    } else {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(`${origin}/reports/tax-time?year=2025`)
        assert(await page.getByRole('heading', { name: 'Your books are ready for tax preparation.', exact: true }).count())
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        const downloadEvent = page.waitForEvent('download')
        await page.getByRole('link', { name: /Download Tax-Time Report/ }).click()
        const download = await downloadEvent
        assert.equal(await download.failure(), null)
        await download.saveAs(`${directory}/browser-${fixture.label}-${width}.pdf`)
        await page.screenshot({ path: `${directory}/browser-${fixture.label}-${width}.png`, fullPage: true })
      }
      for (const path of ['/api/export/csv?year=2025', '/api/mileage/export?year=2025']) {
        const result = await context.request.get(origin + path)
        assert.equal(result.status(), 200, path)
        assert((await result.body()).length > 0)
      }
      const rejected = await context.request.get(`${origin}/api/reports/tax-time-report?year=2025&businessId=${fixtures.find(other => other.businessId !== fixture.businessId).businessId}`)
      assert.equal(rejected.status(), 400)
      const pdf = await context.request.get(`${origin}/api/reports/tax-time-report?year=2025`)
      assert.equal(pdf.headers()['cache-control'], 'private, no-store')
    }
    if (fixture.label === 'ready') {
      // Schedule and immediately cancel deletion only for this synthetic, grant-only tenant.
      const scheduled = await context.request.post(`${origin}/api/account/deletion`, { data: { requestKey: crypto.randomUUID() } })
      assert.equal(scheduled.status(), 200)
      const deletion = await scheduled.json()
      try {
        const retained = await context.request.get(`${origin}/api/reports/tax-time-report?year=2025`)
        assert.equal(retained.status(), 200)
        const mutation = await context.request.post(`${origin}/api/manual-money`, { data: {} })
        assert.equal(mutation.status(), 403)
      } finally {
        const canceled = await context.request.delete(`${origin}/api/account/deletion`, { data: { requestId: deletion.request.id, requestKey: crypto.randomUUID() } })
        assert.equal(canceled.status(), 200)
      }
      console.log('Pending-deletion downloads and mutation restriction passed; synthetic deletion canceled.')
    }
    assert.deepEqual(errors, [])
    await context.close()
    await supabase.auth.mfa.unenroll({ factorId: enrollment.data.id })
  }
  if (process.argv.includes('--resolve-blocker')) {
    console.log('Check-in-to-readiness transition passed.')
  } else {
    await writeFile(`${directory}/browser-result.json`, JSON.stringify({ result: 'passed', fixtures: fixtures.map(f => f.label), widths: [1280, 390] }, null, 2))
    console.log('Desktop/mobile PDF downloads, annual UI, Check-in routing, exports and tenant-parameter rejection passed.')
  }
} finally { await browser.close() }
