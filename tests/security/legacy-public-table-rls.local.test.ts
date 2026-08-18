import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

const localUrl = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const runLocal = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' &&
  Boolean(localUrl && anonKey && serviceKey)

function client(key: string) {
  return createClient(localUrl!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function authenticatedClient(admin: SupabaseClient) {
  const email = `legacy-rls-${crypto.randomUUID()}@example.test`
  const password = 'local-legacy-rls-password'
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) throw createError
  const customer = client(anonKey!)
  const { error: signInError } = await customer.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return customer
}

async function expectDenied(operation: PromiseLike<{ error: { code?: string } | null }>) {
  const { error } = await operation
  expect(error).not.toBeNull()
  expect(error?.code).toBe('42501')
}

describe.skipIf(!runLocal)('legacy public-table RLS on local Supabase', () => {
  it('enables RLS and installs only the intended policies and privileges', () => {
    const output = execFileSync('docker', [
      'exec', 'supabase_db_writeoffs_fresh', 'psql', '-U', 'postgres', '-d', 'postgres',
      '-At', '-v', 'ON_ERROR_STOP=1', '-c', `
        select c.relname || ':' || c.relrowsecurity || ':' ||
          has_table_privilege('anon', c.oid, 'select') || ':' ||
          has_table_privilege('authenticated', c.oid, 'select') || ':' ||
          has_table_privilege('service_role', c.oid, 'select')
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('waitlist','mileage_trips','categories','rulesets','subscriptions')
        order by c.relname;
      `,
    ], { encoding: 'utf8' })

    expect(output.trim().split('\n')).toEqual([
      'categories:true:false:true:true',
      'mileage_trips:true:false:false:true',
      'rulesets:true:false:true:true',
      'subscriptions:true:false:false:true',
      'waitlist:true:false:false:true',
    ])
  })

  it('keeps anonymous waitlist submission working while denying reads and mutations', async () => {
    const anon = client(anonKey!)
    const email = `public-waitlist-${crypto.randomUUID()}@example.test`
    const { error: insertError } = await anon.from('waitlist').insert({
      email,
      name: 'Local RLS Test',
      source: 'local-security-test',
    })
    expect(insertError).toBeNull()
    await expectDenied(anon.from('waitlist').select('id').limit(1))
    await expectDenied(anon.from('waitlist').update({ source: 'forbidden' }).eq('email', email))
    await expectDenied(anon.from('waitlist').delete().eq('email', email))

    const admin = client(serviceKey!)
    const { data, error } = await admin.from('waitlist').select('email').eq('email', email).single()
    expect(error).toBeNull()
    expect(data?.email).toBe(email)
    expect((await admin.from('waitlist').delete().eq('email', email)).error).toBeNull()
  })

  it('allows authenticated reference reads but denies reference writes', async () => {
    const admin = client(serviceKey!)
    const customer = await authenticatedClient(admin)
    const email = `authenticated-waitlist-${crypto.randomUUID()}@example.test`

    expect((await customer.from('waitlist').insert({
      email, name: 'Authenticated Local RLS Test', source: 'local-security-test',
    })).error).toBeNull()
    await expectDenied(customer.from('waitlist').select('id').limit(1))
    await expectDenied(customer.from('waitlist').update({ source: 'forbidden' }).eq('email', email))
    await expectDenied(customer.from('waitlist').delete().eq('email', email))

    expect((await customer.from('categories').select('id').limit(1)).error).toBeNull()
    expect((await customer.from('rulesets').select('id').limit(1)).error).toBeNull()
    await expectDenied(customer.from('categories').insert({ key: 'forbidden', label: 'Forbidden' }))
    await expectDenied(customer.from('categories').update({ label: 'Forbidden' }).eq('id', -1))
    await expectDenied(customer.from('categories').delete().eq('id', -1))
    await expectDenied(customer.from('rulesets').insert({
      vertical: 'general', name: 'forbidden', rules: [],
    }))
    await expectDenied(customer.from('rulesets').update({ name: 'forbidden' }).eq('id', -1))
    await expectDenied(customer.from('rulesets').delete().eq('id', -1))
    expect((await admin.from('waitlist').delete().eq('email', email)).error).toBeNull()
  })

  it('denies all customer access to subscriptions and unowned mileage', async () => {
    const admin = client(serviceKey!)
    const customer = await authenticatedClient(admin)
    const anon = client(anonKey!)

    for (const restricted of [anon, customer]) {
      await expectDenied(restricted.from('subscriptions').select('id').limit(1))
      await expectDenied(restricted.from('subscriptions').insert({
        stripe_customer_id: 'forbidden', stripe_subscription_id: crypto.randomUUID(),
        price_id: 'forbidden', plan: 'forbidden', status: 'forbidden',
      }))
      await expectDenied(restricted.from('subscriptions').update({ status: 'forbidden' }).eq('id', crypto.randomUUID()))
      await expectDenied(restricted.from('subscriptions').delete().eq('id', crypto.randomUUID()))

      await expectDenied(restricted.from('mileage_trips').select('id').limit(1))
      await expectDenied(restricted.from('mileage_trips').insert({
        date: '2026-08-18', purpose: 'forbidden', start_label: 'A', end_label: 'B', miles: 1,
      }))
      await expectDenied(restricted.from('mileage_trips').update({ purpose: 'forbidden' }).eq('id', crypto.randomUUID()))
      await expectDenied(restricted.from('mileage_trips').delete().eq('id', crypto.randomUUID()))
    }

    expect((await admin.from('subscriptions').select('id').limit(1)).error).toBeNull()
    expect((await admin.from('mileage_trips').select('id').limit(1)).error).toBeNull()
  })

  it('denies anonymous reads and mutations on every protected table', async () => {
    const anon = client(anonKey!)
    for (const table of ['categories', 'rulesets'] as const) {
      await expectDenied(anon.from(table).select('*').limit(1))
      await expectDenied(anon.from(table).update({ id: -1 }).eq('id', -1))
      await expectDenied(anon.from(table).delete().eq('id', -1))
    }
    for (const table of ['subscriptions', 'mileage_trips'] as const) {
      const id = crypto.randomUUID()
      await expectDenied(anon.from(table).select('*').limit(1))
      await expectDenied(anon.from(table).update({ id }).eq('id', id))
      await expectDenied(anon.from(table).delete().eq('id', id))
    }
  })
})
