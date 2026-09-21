// Real Plaid Sandbox -> public dedicated staging. Credentials stay in private artifacts.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
process.loadEnvFile('.env.staging.local')
assert.equal(new URL(process.env.SUPABASE_URL).hostname, 'sgrqrrxrlglhjuetdtps.supabase.co')
assert.equal(process.env.PLAID_ENV, 'sandbox')
assert(process.argv.includes('--certify'))
const origin = 'https://writeoffs-fresh-staging.vercel.app'
const webhook = `${origin}/api/plaid/webhook`
const dir = '/private/tmp/writeoffs-plaid-webhook-proof'
await mkdir(dir, { recursive: true, mode: 0o700 })
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const hash = createHmac('sha1', key).update(counter).digest(), offset = hash.at(-1) & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}
async function plaid(path, data) {
  const response = await fetch(`https://sandbox.plaid.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SANDBOX_SECRET, ...data }), signal: AbortSignal.timeout(30000) })
  const body = await response.json()
  if (!response.ok) throw new Error(`Plaid ${response.status}: ${body.error_code ?? 'unavailable'}`)
  return body
}
async function session(fixture) {
  const user = (await admin.auth.admin.getUserById(fixture.userId)).data.user
  assert(user?.user_metadata.synthetic_ux1 === true || user?.user_metadata.synthetic_guided_contract === true)
  const cookies = new Map()
  const client = createServerClient(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
  } })
  assert(!(await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password })).error, 'Synthetic login')
  assert(!(await client.auth.mfa.challengeAndVerify({ factorId: fixture.factorId, code: totp(fixture.totpSecret) })).error, 'MFA verification')
  const post = async (path, body) => {
    const start = performance.now()
    const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
    const data = await response.json()
    assert(response.ok, `${path} HTTP ${response.status}: ${data.error ?? 'unavailable'}`)
    return { data, status: response.status, ms: Math.round(performance.now() - start) }
  }
  return Object.assign(post, { cookies })
}
try {
  const fixtures = JSON.parse(await readFile('/private/tmp/writeoffs-conversation/staging-fixtures.json', 'utf8'))
  const f = fixtures[7]
  if (process.argv.includes('--create')) {
    const post = await session(f)
    const link = await post('/api/plaid/link-token', {})
    const linkMetadata = await plaid('/link/token/get', { link_token: link.data.linkToken })
    assert.equal(linkMetadata.webhook ?? linkMetadata.metadata?.webhook, webhook)
    // Return only webhook configuration, never tokens or provider response bodies.
    console.log(JSON.stringify({ linkTokenStatus: link.status, configuredWebhook: linkMetadata.webhook ?? linkMetadata.metadata?.webhook ?? 'not returned by provider' }))
    // NEW_ACCOUNTS_AVAILABLE requires an Item created with Link Account Select.
    // The Sandbox public_token shortcut cannot certify this webhook.
    const browser = await chromium.launch({ headless: true })
    let exchanged
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      await context.addCookies([...post.cookies].map(([name, value]) => ({ name, value, domain: new URL(origin).hostname, path: '/', secure: true, sameSite: 'Lax' })))
      const page = await context.newPage()
      await page.goto(`${origin}/settings/banking`)
      await page.getByRole('button', { name: 'Connect my accounts', exact: true }).click()
      const frame = page.frameLocator('iframe[title="Plaid Link"]')
      await frame.getByText('Continue without phone number', { exact: true }).click()
      await frame.getByPlaceholder('Search').fill('First Platypus')
      await frame.getByText('First Platypus Bank', { exact: true }).click()
      await frame.getByText('First Platypus Bank', { exact: true }).last().click()
      await frame.getByLabel('Username', { exact: true }).fill('user_good')
      await frame.getByLabel('Password', { exact: true }).fill('pass_good')
      await frame.getByRole('button', { name: 'Submit', exact: true }).click()
      await frame.getByText('Your accounts', { exact: true }).waitFor()
      await page.screenshot({ path: `${dir}/initial-account-selection.png` })
      await frame.getByRole('button', { name: 'Continue', exact: true }).click()
      const exchangeResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/plaid/exchange', { timeout: 60000 })
      await frame.getByText('Finish without saving', { exact: true }).click()
      const response = await exchangeResponse
      assert.equal(response.status(), 200)
      exchanged = { data: await response.json(), status: response.status() }
    } finally { await browser.close() }
    // Recover the test credential using the existing local development key; never print it.
    process.loadEnvFile('.env.development.local')
    const { createDecipheriv } = await import('node:crypto')
    const row = await admin.from('plaid_items').select('id,business_id,access_token_ciphertext,plaid_item_id').eq('id', exchanged.data.itemId).single()
    assert(!row.error && row.data.business_id === f.businessId)
    const e = JSON.parse(row.data.access_token_ciphertext)
    const d = createDecipheriv('aes-256-gcm', Buffer.from(process.env.PLAID_TOKEN_ENCRYPTION_KEY, 'base64'), Buffer.from(e.iv, 'base64'))
    d.setAuthTag(Buffer.from(e.tag, 'base64'))
    const accessToken = Buffer.concat([d.update(Buffer.from(e.ciphertext, 'base64')), d.final()]).toString()
    await writeFile(`${dir}/item-private.json`, JSON.stringify({ itemRecordId: row.data.id, businessId: f.businessId, accessToken }), { mode: 0o600 })
    console.log(JSON.stringify({ exchangeStatus: exchanged.status, itemRecordId: row.data.id, isolatedSynthetic: true }))
  } else {
    const item = JSON.parse(await readFile(`${dir}/item-private.json`, 'utf8'))
    assert.equal(item.businessId, f.businessId)
    if (process.argv.includes('--fire-new') || process.argv.includes('--fire-sync')) {
      const code = process.argv.includes('--fire-new') ? 'NEW_ACCOUNTS_AVAILABLE' : 'SYNC_UPDATES_AVAILABLE'
      const result = await plaid('/sandbox/item/fire_webhook', { access_token: item.accessToken, webhook_type: code === 'NEW_ACCOUNTS_AVAILABLE' ? 'ITEM' : 'TRANSACTIONS', webhook_code: code })
      const proof = { code, ...result, firedAt: new Date().toISOString() }
      await writeFile(`${dir}/${code}-${Date.now()}.json`, JSON.stringify(proof, null, 2))
      console.log(JSON.stringify(proof))
    } else if (process.argv.includes('--update-link')) {
      const post = await session(f)
      const link = await post('/api/plaid/link-token', { itemId: item.itemRecordId })
      const metadata = await plaid('/link/token/get', { link_token: link.data.linkToken })
      console.log(JSON.stringify({ updateLinkStatus: link.status, metadataKeys: Object.keys(metadata), update: metadata.update ?? metadata.metadata?.update ?? null }))
    } else {
      const provider = await plaid('/item/get', { access_token: item.accessToken })
      const state = await admin.from('plaid_items').select('id,connection_status,consent_status,new_accounts_available,sync_requested_at,last_successful_sync_at').eq('id', item.itemRecordId).single()
      const events = await admin.from('plaid_webhook_events').select('id,webhook_type,webhook_code,received_at,processed_at,last_attempt_at').eq('plaid_item_record_id', item.itemRecordId).order('received_at')
      const versions = await admin.from('plaid_transaction_versions').select('id', { count: 'exact', head: true }).eq('plaid_item_record_id', item.itemRecordId)
      assert(!state.error && !events.error && !versions.error)
      const proof = { webhook: provider.item.webhook, state: state.data, events: events.data, transactionVersions: versions.count, observedAt: new Date().toISOString() }
      await writeFile(`${dir}/observation-${Date.now()}.json`, JSON.stringify(proof, null, 2))
      console.log(JSON.stringify(proof))
    }
  }
} catch (error) {
  // Only local assertions / fixed API codes; never SDK objects or credentials.
  console.error(error instanceof Error ? error.message : 'Certification unavailable')
  process.exitCode = 1
}
