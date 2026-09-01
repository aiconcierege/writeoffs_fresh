import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { provisionLocalCanonicalOwner } from '../helpers/local-canonical'

const url = process.env.LOCAL_SUPABASE_URL
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const enabled = process.env.RUN_LOCAL_SUPABASE_INTEGRATION === '1' && Boolean(url && anonKey && serviceKey)
const suite = enabled ? describe.sequential : describe.skip

function catalog(sql: string) {
  return execFileSync('docker', [
    'exec', 'supabase_db_writeoffs_fresh', 'psql', '-U', 'postgres', '-d', 'postgres',
    '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ], { encoding: 'utf8' }).trim()
}

async function registerReceipt(owner: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>) {
  const id = randomUUID()
  const fingerprint = createHash('sha256').update(id).digest('hex')
  const result = await owner.customer.rpc('register_bookkeeping_receipt', {
    p_receipt_id: id,
    p_upload_fingerprint: fingerprint,
    p_storage_path: `receipts/${owner.userId}/${fingerprint}`,
    p_original_name: `${id}.pdf`,
    p_mime_type: 'application/pdf',
    p_bytes: 100,
  })
  expect(result.error).toBeNull()
  return id
}

async function registerStatement(owner: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>) {
  const id = randomUUID()
  const fingerprint = createHash('sha256').update(id).digest('hex')
  const result = await owner.customer.rpc('register_business_statement', {
    p_document_id: id,
    p_document_class: 'bank_statement',
    p_upload_fingerprint: fingerprint,
    p_storage_path: `statements/${owner.userId}/${fingerprint}`,
    p_original_name: `${id}.pdf`,
    p_mime_type: 'application/pdf',
    p_bytes: 100,
  })
  expect(result.error).toBeNull()
  return id
}

suite('critical Advisor remediation against local PostgreSQL', () => {
  let anon: ReturnType<typeof createClient>
  let admin: ReturnType<typeof createClient>
  let ownerA: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>
  let ownerB: Awaited<ReturnType<typeof provisionLocalCanonicalOwner>>

  beforeAll(async () => {
    anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    ownerA = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'advisor-a', amounts: [] })
    ownerB = await provisionLocalCanonicalOwner({ admin, url: url!, anonKey: anonKey!, label: 'advisor-b', amounts: [] })
  })

  it('installs exact contractor and status-object privileges', () => {
    const output = catalog(`
      select c.relname || ':' || c.relrowsecurity || ':' ||
        has_table_privilege('anon',c.oid,'select') || ':' ||
        has_table_privilege('authenticated',c.oid,'select') || ':' ||
        has_table_privilege('authenticated',c.oid,'insert') || ':' ||
        has_table_privilege('authenticated',c.oid,'update') || ':' ||
        has_table_privilege('authenticated',c.oid,'delete') || ':' ||
        has_table_privilege('authenticated',c.oid,'truncate') || ':' ||
        has_table_privilege('service_role',c.oid,'select')
      from pg_class c where c.oid='public.contractor_awareness_rule_versions'::regclass;
      select c.relname || ':' || coalesce(array_to_string(c.reloptions,','),'') || ':' ||
        has_table_privilege('anon',c.oid,'select') || ':' ||
        has_table_privilege('authenticated',c.oid,'select') || ':' ||
        has_table_privilege('service_role',c.oid,'select')
      from pg_class c where c.oid in (
        'public.current_customer_receipt_processing_status'::regclass,
        'public.current_customer_statement_status'::regclass
      ) order by c.relname;
      select has_function_privilege('anon','public.read_customer_receipt_processing_status()','execute') || ':' ||
        has_function_privilege('authenticated','public.read_customer_receipt_processing_status()','execute') || ':' ||
        has_function_privilege('service_role','public.read_customer_receipt_processing_status()','execute');
      select has_function_privilege('anon','public.read_customer_statement_status()','execute') || ':' ||
        has_function_privilege('authenticated','public.read_customer_statement_status()','execute') || ':' ||
        has_function_privilege('service_role','public.read_customer_statement_status()','execute');
    `)
    expect(output.split('\n')).toEqual([
      'contractor_awareness_rule_versions:true:false:true:false:false:false:false:true',
      'current_customer_receipt_processing_status:security_invoker=true,security_barrier=true:false:true:false',
      'current_customer_statement_status:security_invoker=true,security_barrier=true:false:true:false',
      'false:true:false',
      'false:true:false',
    ])
  })

  it('denies anonymous rule access and every customer mutation privilege', async () => {
    expect((await anon.from('contractor_awareness_rule_versions').select('id').limit(1)).error?.code).toBe('42501')
    expect((await anon.from('contractor_awareness_rule_versions').insert({
      tax_year: 2099, rule_key: 'contractor_information_reporting_attention',
      rule_version: `forbidden:${randomUUID()}`, attention_amount_cents: 1, status: 'active',
    } as never)).error?.code).toBe('42501')
    expect((await ownerA.customer.from('contractor_awareness_rule_versions').insert({
      tax_year: 2099, rule_key: 'contractor_information_reporting_attention',
      rule_version: `forbidden:${randomUUID()}`, attention_amount_cents: 1, status: 'active',
    } as never)).error?.code).toBe('42501')
    expect((await ownerA.customer.from('contractor_awareness_rule_versions').update({ status: 'retired' })
      .eq('tax_year', 2025)).error?.code).toBe('42501')
    expect((await ownerA.customer.from('contractor_awareness_rule_versions').delete()
      .eq('tax_year', 2025)).error?.code).toBe('42501')
    expect(catalog("select has_table_privilege('anon','public.contractor_awareness_rule_versions','truncate') || ':' || has_table_privilege('authenticated','public.contractor_awareness_rule_versions','truncate');"))
      .toBe('false:false')
  })

  it('keeps authenticated and service-role current-rule reads exact', async () => {
    const customerRules = await ownerA.customer.from('current_contractor_awareness_rules')
      .select('tax_year,rule_version,attention_amount_cents,status').order('tax_year')
    expect(customerRules).toMatchObject({ error: null, data: [
      { tax_year: 2025, rule_version: 'contractor-awareness:v1', attention_amount_cents: 60000, status: 'active' },
      { tax_year: 2026, rule_version: 'contractor-awareness:2026:v2', attention_amount_cents: 200000, status: 'active' },
    ] })
    expect((await admin.from('contractor_awareness_rule_versions').select('id')).error).toBeNull()
  })

  it('isolates receipt status through both the view and helper function', async () => {
    const receiptA = await registerReceipt(ownerA)
    const receiptB = await registerReceipt(ownerB)
    expect(await ownerA.customer.from('current_customer_receipt_processing_status')
      .select('receipt_id,business_id,processing_status,attempt_count,last_error_code,terminal_reason,updated_at')
      .eq('receipt_id', receiptA).single()).toMatchObject({
      error: null, data: { receipt_id: receiptA, business_id: ownerA.businessId, processing_status: 'queued' },
    })
    expect((await ownerA.customer.from('current_customer_receipt_processing_status').select('receipt_id')
      .eq('receipt_id', receiptB)).data).toEqual([])
    expect((await ownerA.customer.from('current_customer_receipt_processing_status').select('receipt_id')
      .eq('business_id', ownerB.businessId)).data).toEqual([])
    const helper = await ownerA.customer.rpc('read_customer_receipt_processing_status')
    expect(helper.error).toBeNull()
    expect(helper.data.some((row: { receipt_id: string }) => row.receipt_id === receiptA)).toBe(true)
    expect(helper.data.some((row: { receipt_id: string }) => row.receipt_id === receiptB)).toBe(false)
    expect((await anon.rpc('read_customer_receipt_processing_status')).error?.code).toBe('42501')
    expect((await ownerA.customer.from('receipt_processing_jobs').select('id').limit(1)).error?.code).toBe('42501')
    expect((await admin.from('receipt_processing_jobs').select('id').eq('receipt_id', receiptA)).error).toBeNull()
  })

  it('isolates the complete statement status contract through view and helper', async () => {
    const statementA = await registerStatement(ownerA)
    const statementB = await registerStatement(ownerB)
    const fields = 'id,business_id,original_name,bytes,created_at,processing_status,attempt_count,transaction_count,institution_name,masked_account,account_type,period_start,period_end,statement_account_id,account_link_id,account_link_event_id,target_account_id'
    const own = await ownerA.customer.from('current_customer_statement_status').select(fields).eq('id', statementA).single()
    expect(own).toMatchObject({ error: null, data: {
      id: statementA, business_id: ownerA.businessId, processing_status: 'queued', transaction_count: 0,
      statement_account_id: null, account_link_id: null, account_link_event_id: null, target_account_id: null,
    } })
    expect(Object.keys(own.data!).sort()).toEqual(fields.split(',').sort())
    expect((await ownerA.customer.from('current_customer_statement_status').select('id').eq('id', statementB)).data).toEqual([])
    expect((await ownerA.customer.from('current_customer_statement_status').select('id')
      .eq('business_id', ownerB.businessId)).data).toEqual([])
    const helper = await ownerA.customer.rpc('read_customer_statement_status')
    expect(helper.error).toBeNull()
    expect(helper.data.some((row: { id: string }) => row.id === statementA)).toBe(true)
    expect(helper.data.some((row: { id: string }) => row.id === statementB)).toBe(false)
    expect((await anon.rpc('read_customer_statement_status')).error?.code).toBe('42501')
  })
})
