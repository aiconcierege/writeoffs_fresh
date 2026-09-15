import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
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
const fixture = fixtures.find(item => item.label === 'ready')
const browser = await chromium.launch({ headless: true })
let supabase, factorId
try {
  const cookies = new Map()
  supabase = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
  } })
  const login = await supabase.auth.signInWithPassword({ email: fixture.email, password: fixture.password })
  assert(!login.error, 'Synthetic customer login')
  assert.equal(login.data.user.user_metadata.synthetic_tax_time_validation, true)
  const enrollment = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Plaid Link proof ${Date.now()}` })
  assert(!enrollment.error, 'MFA enrollment')
  factorId = enrollment.data.id
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code: totp(enrollment.data.totp.secret) })
  assert(!verified.error, 'Real MFA verification')
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, domain: new URL(origin).hostname, path: '/', secure: true, sameSite: 'Lax' })))
  const page = await context.newPage()
  await page.goto(`${origin}/get-started`)
  const tokenResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/plaid/link-token')
  await page.getByRole('button', { name: 'Connect an account', exact: true }).click()
  const response = await tokenResponse
  console.log(JSON.stringify({ syntheticCustomer: true, realMfa: true, page: new URL(page.url()).pathname, tokenStatus: response.status() }))
  if (process.argv.includes('--expect-blocked')) {
    assert.equal(response.status(), 503)
    await page.getByText('Bank connection setup is unavailable right now.').waitFor()
  } else {
    assert.equal(response.status(), 200)
    const frame = page.locator('iframe[title="Plaid Link"]')
    await frame.waitFor({ state: 'visible', timeout: 30000 })
    await page.waitForTimeout(3000)
    console.log(JSON.stringify({ plaidLinkVisible: await frame.isVisible() }))
    await page.screenshot({ path: `${directory}/plaid-link-open.png` })
    // Stop at Link opening. Never enter bank credentials or select accounts.
  }
  await context.close()
} catch {
  console.error('Staging Plaid certification failed; no session or provider details logged.')
  process.exitCode = 1
} finally {
  if (factorId && supabase) await supabase.auth.mfa.unenroll({ factorId })
  if (supabase) await supabase.auth.signOut()
  await browser.close()
}
