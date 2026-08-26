import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

function fail(message) { throw new Error(message) }
function argument(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1] }
function allowlist() { return new Set((process.env.WRITEOFFS_STAGING_TEST_USERS ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)) }

async function findUser(admin, email) {
  for (let page = 1; page <= 100; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (result.error) throw result.error
    const match = result.data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match
    if (result.data.users.length < 100) return null
  }
  fail('The designated user lookup exceeded its bounded page limit.')
}

async function main() {
  if (process.env.WRITEOFFS_ENVIRONMENT !== 'staging') fail('This utility runs only with WRITEOFFS_ENVIRONMENT=staging.')
  const email = argument('--email')?.trim().toLowerCase()
  if (!email || !allowlist().has(email)) fail('The requested email is not an explicitly designated staging test user.')
  if (!process.argv.includes('--confirm-reset')) fail('Pass --confirm-reset after reviewing the staging target and email.')
  const password = process.env.WRITEOFFS_STAGING_TEST_PASSWORD
  if (!password || password.length < 14) fail('WRITEOFFS_STAGING_TEST_PASSWORD must be supplied securely and contain at least 14 characters.')
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const expectedHost = process.env.WRITEOFFS_EXPECTED_SUPABASE_HOST
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || !expectedHost) fail('Staging Supabase server configuration is incomplete.')
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost || /localhost|127\.0\.0\.1/.test(parsed.hostname)) fail('The Supabase target is not the explicitly expected staging host.')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const existing = await findUser(admin, email)
  let archivedBusinessId = null
  if (existing) {
    const business = await admin.from('businesses').select('id').eq('owner_user_id', existing.id).maybeSingle()
    if (business.error) throw business.error
    archivedBusinessId = business.data?.id ?? null
    if (archivedBusinessId) {
      const provider = await admin.from('membership_provider_links').select('provider_subscription_id').eq('business_id', archivedBusinessId).maybeSingle()
      if (provider.error) throw provider.error
      if (provider.data?.provider_subscription_id) {
        if (process.env.WRITEOFFS_STRIPE_MODE !== 'test' || !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) fail('Stripe Test configuration is required to retire the existing test subscription.')
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
        const subscription = await stripe.subscriptions.retrieve(provider.data.provider_subscription_id)
        if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id)
      }
    }
    const suffix = `${Date.now()}.${existing.id.slice(0, 8)}`
    const archived = await admin.auth.admin.updateUserById(existing.id, { email: `archived+${suffix}@staging-reset.invalid` })
    if (archived.error) throw archived.error
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { staging_test_user: true, reset_at: new Date().toISOString() } })
  if (created.error) throw created.error
  const business = await admin.from('businesses').select('id').eq('owner_user_id', created.data.user.id).single()
  if (business.error) throw business.error
  console.log(JSON.stringify({ status: 'reset', email, archivedBusinessId, newBusinessId: business.data.id }))
}

main().catch((error) => { console.error(`Staging test-user reset failed: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1 })
