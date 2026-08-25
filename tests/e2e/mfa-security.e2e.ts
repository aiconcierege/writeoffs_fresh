import { createHmac, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_MFA_E2E === '1' && Boolean(localUrl && anonKey && serviceKey)

test.skip(!enabled, 'requires an explicitly enabled local Supabase MFA environment')

test('enrolls, challenges, and removes TOTP without leaving Security', async ({ page }) => {
  const admin = createClient(localUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `mfa-browser-${randomUUID()}@example.test`
  const password = `Local-${randomUUID()}-password`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  expect(created.error).toBeNull()
  const userId = created.data.user!.id
  const business=(await admin.from('businesses').select('id').eq('owner_user_id',userId).single()).data!
  const grant=await admin.rpc('create_business_membership_grant',{p_business_id:business.id,p_plan:'business',p_starts_at:new Date().toISOString(),p_ends_at:null,p_request_key:`mfa-e2e:${randomUUID()}`,p_reason:'MFA browser test',p_provenance:'local_setup',p_actor_user_id:null})
  expect(grant.error).toBeNull()
  const wrongRouteRequests: string[] = []
  const pageErrors: Error[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/account/security') wrongRouteRequests.push(request.url())
  })
  page.on('pageerror', (error) => pageErrors.push(error))

  try {
    await page.goto('/login')
    await page.getByPlaceholder('you@example.com').fill(email)
    await page.getByPlaceholder('Your password').fill(password)
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL('**/home')
    await page.goto('/settings/security')

    await page.getByRole('button', { name: 'Set up authenticator app' }).click()
    await expect(page).toHaveURL(/\/settings\/security$/)
    await expect(page.getByAltText('QR code for authenticator app setup')).toBeVisible()
    await page.getByText('Can’t scan the code?').click()
    const secret = (await page.getByLabel('Authenticator setup key').textContent())!.trim()
    await expect(page.getByLabel('Enter the 6-digit code')).toBeVisible()
    await page.getByLabel('Enter the 6-digit code').fill(totp(secret))
    await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click()
    await expect(page.getByText('Two-factor authentication is on.')).toBeVisible()

    await page.locator('summary').filter({ hasText: 'Account' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL(/\/$/)
    await page.goto('/login')
    await page.getByPlaceholder('you@example.com').fill(email)
    await page.getByPlaceholder('Your password').fill(password)
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL('**/mfa/challenge?next=/home')
    await page.getByLabel('6-digit code').fill(totp(secret))
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.waitForURL('**/home')

    await page.goto('/settings/security')
    await page.getByRole('button', { name: 'Remove two-factor authentication' }).click()
    await expect(page.getByText('Two-factor authentication was removed.')).toBeVisible()
    expect(wrongRouteRequests).toEqual([])
    expect(pageErrors).toEqual([])
  } finally {
    await admin.auth.admin.deleteUser(userId)
  }
})

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = secret.replace(/=+$/, '').toUpperCase()
  let bits = ''
  for (const character of clean) bits += alphabet.indexOf(character).toString(2).padStart(5, '0')
  const bytes = Buffer.alloc(Math.floor(bits.length / 8))
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hash = createHmac('sha1', bytes).update(counter).digest()
  const offset = hash[hash.length - 1] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
