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
const dir = '/private/tmp/writeoffs-plaid-completion'
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
  return Object.assign(post, { cookies, client })
}
try {
  const fixtures = JSON.parse(await readFile('/private/tmp/writeoffs-conversation/staging-fixtures.json', 'utf8'))
  let f = await readFile(`${dir}/fixture-private.json`,'utf8').then(JSON.parse).catch(()=>null)
  if(!f){
    assert(process.argv.includes('--provision'))
    const nonce=crypto.randomUUID(),email=`plaid-completion-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
    const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_guided_contract:true,synthetic_plaid_completion:true}})
    assert(!made.error&&made.data.user)
    const userId=made.data.user.id,customer=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
    assert(!(await customer.auth.signInWithPassword({email,password})).error)
    const b=await admin.from('businesses').select('id').eq('owner_user_id',userId).single();assert(b.data,'Synthetic business provisioning missing');const businessId=b.data.id
    assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:new Date().toISOString(),p_ends_at:null,p_request_key:`plaid-cert:${nonce}`,p_reason:'Isolated Transactions certification',p_provenance:'admin',p_actor_user_id:null})).error)
    const enrolled=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:'Transactions certification'});assert(enrolled.data&&!enrolled.error)
    const totpSecret=enrolled.data.totp.secret,factorId=enrolled.data.id
    assert(!(await customer.auth.mfa.challengeAndVerify({factorId,code:totp(totpSecret)})).error)
    f={email,password,userId,businessId,totpSecret,factorId};await writeFile(`${dir}/fixture-private.json`,JSON.stringify(f),{mode:0o600})
    const post=await session(f)
    const patch=async(step,data)=>{const r=await fetch(`${origin}/api/onboarding/business`,{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:[...post.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify({step,data,request_id:crypto.randomUUID(),expected_fact_event_ids:{}})});assert(r.ok,`Onboarding ${step} HTTP ${r.status}`)}
    await patch('business',{business_description:'Independent consulting business'})
    await patch('eligibility',{schedule_c_eligibility:'yes'})
    await patch('history',{business_stage:'existing',business_start_month:'2023-01'})
    await patch('operations',{uses_customer_job_materials:'no',keeps_future_sale_merchandise:'no',schedule_c_eligibility:'yes'})
    assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2024-01-01'})).error)
    await post('/api/onboarding/catch-up',{startMonth:'2024-01',agreed:true})
    await patch('starting_method',{onboarding_start_method:'connected_financial_accounts'})
    assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2024-01-01'})).error)
    await post('/api/onboarding/complete',{timezone:'America/Phoenix'})
    console.log(JSON.stringify({syntheticCustomerCreated:true,businessId}))
  }
  if(process.argv.includes('--finish-setup')){
    const businessId=f.businessId; const post=await session(f)
    const patch=async(step,data)=>{const r=await fetch(`${origin}/api/onboarding/business`,{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:[...post.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify({step,data,request_id:crypto.randomUUID(),expected_fact_event_ids:{}})});assert(r.ok,`Onboarding ${step} HTTP ${r.status}`)}
    assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2024-01-01'})).error)
    await post('/api/onboarding/catch-up',{startMonth:'2024-01',agreed:true})
    await patch('starting_method',{onboarding_start_method:'connected_financial_accounts'})
    assert(!(await admin.from('business_customer_setup').upsert({business_id:businessId,joined_month:'2026-09-01',grandfathered_start_date:'2024-01-01'})).error)
    await post('/api/onboarding/complete',{timezone:'America/Phoenix'})
console.log('Synthetic setup complete');process.exit(0)}
  if(process.argv.includes('--provision'))process.exit(0)
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
      await frame.getByLabel('Username', { exact: true }).fill(process.argv.includes('--custom') ? 'user_custom' : 'user_transactions_dynamic')
      await frame.getByLabel('Password', { exact: true }).fill(process.argv.includes('--custom') ? JSON.stringify({override_accounts:[{type:'depository',subtype:'checking',starting_balance:1000,currency:'USD',transactions:[{date_transacted:'2026-09-20',date_posted:'2026-09-20',amount:42.19,description:'CERT OFFICE SUPPLIES'},{date_transacted:'2026-09-19',date_posted:'2026-09-19',amount:-2100,description:'ACH CREDIT CLIENT PAYMENT'}]}]}) : 'pass_good')
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
    if(process.argv.includes('--verify-real-removal')){
      const proof=JSON.parse(await readFile(dir+'/real-removal.json','utf8')),post=await session(f)
      assert.equal(proof.itemRecordId,item.itemRecordId);assert(proof.storedRemovals.length>0)
      const count=async()=>{const r=await admin.from('plaid_transaction_versions').select('id',{count:'exact',head:true}).eq('plaid_item_record_id',item.itemRecordId);assert(!r.error);return r.count}
      const before=await count(),fired=await plaid('/sandbox/item/fire_webhook',{access_token:item.accessToken,webhook_type:'TRANSACTIONS',webhook_code:'SYNC_UPDATES_AVAILABLE'})
      await new Promise(r=>setTimeout(r,4000));assert.equal(await count(),before,'Webhook replay added no versions')
      const {getAuthenticatedCanonicalReport}=await import('../app/lib/bookkeeping/reporting-service.ts')
      const {getAuthenticatedCanonicalFinancialSummary}=await import('../app/lib/bookkeeping/financial-summary-service.ts')
      const {refreshBettiActionIndex}=await import('../app/lib/bookkeeping/action-index-worker.ts')
      const report=await getAuthenticatedCanonicalReport({supabase:post.client,periodStart:'2026-01-01',periodEnd:'2026-09-21'})
      const home=await getAuthenticatedCanonicalFinancialSummary({supabase:post.client,periodStart:'2026-01-01',periodEnd:'2026-09-21',currency:'USD'})
      assert.equal(home.businessIncomeCents,report.businessIncomeCents);assert.equal(home.businessExpensesCents,report.businessExpensesCents)
      const index=await refreshBettiActionIndex({admin,businessId:f.businessId});assert.equal(index.failed,0)
      const headers={Cookie:[...post.cookies].map(([k,v])=>`${k}=${v}`).join('; ')}
      const statuses={};for(const path of ['/home','/transactions','/reports','/api/reports/summary','/api/bookkeeping/work']){const r=await fetch(origin+path,{headers});statuses[path]=r.status;assert.equal(r.status,200,path)}
      const all=await admin.from('plaid_transaction_versions').select('id,plaid_transaction_id,event_type,supersedes_version_id,canonical_financial_transaction_id').eq('plaid_item_record_id',item.itemRecordId);assert(!all.error)
      for(const removed of proof.storedRemovals){assert(all.data.some(v=>v.id===removed.id));assert(!all.data.some(v=>v.supersedes_version_id===removed.id),'Removed remains current leaf')}
      const result={...proof,replayRequestId:fired.request_id,replayVersionCount:before,replayCreatesNoVersions:true,homeEqualsReports:true,income:report.businessIncomeCents,expenses:report.businessExpensesCents,index,publicStatuses:statuses,verifiedAt:new Date().toISOString()};await writeFile(dir+'/real-removal-verified.json',JSON.stringify(result,null,2));console.log(JSON.stringify({realRemoved:proof.storedRemovals.length,replayCreatesNoVersions:true,homeEqualsReports:true,index,publicStatuses:statuses}))
    } else if(process.argv.includes('--overlap')){
      const post=await session(f),browser=await chromium.launch({headless:true})
      try{const context=await browser.newContext();await context.addCookies([...post.cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
       const source=await admin.from('financial_transactions').select('id,financial_account_id,original_description,transaction_date,amount_cents').eq('business_id',f.businessId).like('original_description','CERT VALID AFTER MALFORMED%').limit(1).single();assert(!source.error)
       const account=await admin.from('financial_accounts').select('mask_last_four').eq('id',source.data.financial_account_id).single();assert(!account.error)
       const {PDFDocument,StandardFonts}=await import('pdf-lib'),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),p=pdf.addPage([612,792])
       const lines=['First Platypus Bank','Checking Statement',`Account ending ${account.data.mask_last_four}`,'Statement period: 2026-09-01 - 2026-09-21','Beginning balance: $1,000.00','Date                 Description                                      Debits              Credits',`${source.data.transaction_date}      ${source.data.original_description}      -$12.34`,'Ending balance: $987.66','SYNTHETIC CERTIFICATION - NOT A REAL BANK STATEMENT'];lines.forEach((text,i)=>{if(i===5||i===6)return;p.drawText(text,{x:25,y:750-i*30,size:9,font})});
       for(const [text,x] of [['Date',25],['Description',100],['Credits',410],['Debits',510]])p.drawText(text,{x,y:600,size:9,font});
       p.drawText(source.data.transaction_date,{x:25,y:570,size:9,font});p.drawText(source.data.original_description,{x:100,y:570,size:8,font});p.drawText('12.34',{x:510,y:570,size:9,font})
       const file=dir+'/overlapping-bank-statement.pdf';await writeFile(file,await pdf.save());const page=await context.newPage();await page.goto(origin+'/import');const registered=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/documents'&&r.request().method()==='POST');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(file);const r=await registered;assert.equal(r.status(),200);const id=(await r.json()).document.id
       let doc
       for(let i=0;i<48;i++){const response=await context.request.get(origin+'/api/documents');assert.equal(response.status(),200);doc=(await response.json()).documents.find(d=>d.id===id);if(['needs_attention','completed','organized'].includes(doc?.state))break;await new Promise(r=>setTimeout(r,5000))}
       const copies=await admin.from('financial_transactions').select('id').eq('business_id',f.businessId).eq('original_description',source.data.original_description).eq('amount_cents',source.data.amount_cents);assert(!copies.error)
       assert.equal(doc?.state,'needs_attention');assert.equal(copies.data.length,1)
       const proof={documentId:id,state:doc.state,duplicateSourceCopies:copies.data.length,realUpload:true,automaticallyMerged:false};await writeFile(dir+'/overlap-protection.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof))
      }finally{await browser.close()}
    } else if(process.argv.includes('--coverage-security')){
      const current=await session(f),other=await session(fixtures[6])
      const own=await current.client.rpc('read_customer_source_coverage'),foreign=await other.client.rpc('read_customer_source_coverage');assert(!own.error&&!foreign.error)
      const ids=new Set(own.data.accounts.map(a=>a.id));assert(foreign.data.accounts.every(a=>!ids.has(a.id)))
      const unverified=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
      assert(!(await unverified.auth.signInWithPassword({email:f.email,password:f.password})).error)
      assert((await unverified.rpc('read_customer_source_coverage')).error,'AAL1 blocked')
      const publicResponse=await fetch(origin+'/api/bookkeeping/source-coverage',{redirect:'manual'});assert([401,307].includes(publicResponse.status))
      const versions=await other.client.from('plaid_transaction_versions').select('id,raw_source').eq('plaid_item_record_id',item.itemRecordId);assert(!versions.error);assert.equal(versions.data.length,0)
      const proof={ownAccounts:own.data.accounts.length,crossTenantCoverageIsolated:true,quarantineEvidenceIsolated:true,mfaRequired:true,unauthenticatedStatus:publicResponse.status};await writeFile(dir+'/coverage-security.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof))
    } else if(process.argv.includes('--cleanup-internal')){
      const items=await admin.from('plaid_items').select('id,sync_cursor,connection_status').eq('business_id',f.businessId).like('plaid_item_id','internal-cert-%');assert(!items.error)
      const {normalizePlaidRemoval}=await import('../app/lib/plaid/normalize.ts')
      for(const i of items.data){
       if(i.connection_status!=='disconnected'){
        const versions=await admin.from('plaid_transaction_versions').select('plaid_transaction_id').eq('plaid_item_record_id',i.id);assert(!versions.error)
        const lease=crypto.randomUUID();assert(!(await admin.rpc('claim_plaid_item_sync',{p_item_record_id:i.id,p_lease_id:lease})).error)
        const r=await admin.rpc('apply_plaid_transaction_sync',{p_item_record_id:i.id,p_lease_id:lease,p_expected_cursor:i.sync_cursor,p_next_cursor:i.sync_cursor,p_accounts:[],p_events:[...new Set(versions.data.map(v=>v.plaid_transaction_id))].map(t=>normalizePlaidRemoval({transaction_id:t}))});assert(!r.error,r.error?.message)
        assert(!(await admin.from('plaid_items').update({connection_status:'disconnected',consent_status:'revoked',sync_requested_at:null}).eq('id',i.id)).error)
       }
       const a=await admin.from('plaid_account_sources').select('financial_account_id').eq('plaid_item_record_id',i.id);assert(!a.error)
       for(const s of a.data)assert(!(await admin.from('financial_accounts').update({archived_at:new Date().toISOString()}).eq('id',s.financial_account_id).eq('business_id',f.businessId)).error)
      }
      console.log(JSON.stringify({internalFixturesRetired:items.data.length,historyPreserved:true}))
    } else if(process.argv.includes('--internal-removal')){
      const post=await session(f),db=post.client
      const {normalizePlaidTransaction,normalizePlaidRemoval}=await import('../app/lib/plaid/normalize.ts')
      const {resolveFinancialTransactionRecord}=await import('../app/lib/bookkeeping/financial-transaction-workflow.ts')
      const {CanonicalBookkeepingService}=await import('../app/lib/bookkeeping/service.ts')
      const {SupabaseBookkeepingRepository}=await import('../app/lib/bookkeeping/supabase-repository.ts')
      const {getAuthenticatedCanonicalReport}=await import('../app/lib/bookkeeping/reporting-service.ts')
      const {getAuthenticatedCanonicalFinancialSummary}=await import('../app/lib/bookkeeping/financial-summary-service.ts')
      const {listTransactionReadModel}=await import('../app/lib/bookkeeping/transaction-read-model.ts')
      const {refreshBettiActionIndex}=await import('../app/lib/bookkeeping/action-index-worker.ts')
      const id=crypto.randomUUID(),account='internal-'+id,tx='internal-expense-'+id,qtx='internal-question-'+id
      assert(!(await admin.from('plaid_items').insert({id,business_id:f.businessId,plaid_item_id:'internal-cert-'+id,access_token_ciphertext:'not-a-provider-credential',environment:'sandbox'})).error)
      const accounts=[{account_id:account,display_name:'Internal deterministic removal certification',account_type:'checking',account_subtype:'checking',currency:'USD'}]
      let cursor=null
      const apply=async events=>{const lease=crypto.randomUUID(),next=crypto.randomUUID();assert(!(await admin.rpc('claim_plaid_item_sync',{p_item_record_id:id,p_lease_id:lease})).error);const r=await admin.rpc('apply_plaid_transaction_sync',{p_item_record_id:id,p_lease_id:lease,p_expected_cursor:cursor,p_next_cursor:next,p_accounts:accounts,p_events:events});assert(!r.error,r.error?.message);cursor=next;return r.data}
      const event=t=>normalizePlaidTransaction({transaction_id:t,account_id:account,date:'2026-09-20',amount:104,iso_currency_code:'USD',name:'INTERNAL CERTIFICATION PURCHASE',pending:false},'added')
      await apply([event(tx),event(qtx)])
      const versions=await admin.from('plaid_transaction_versions').select('canonical_financial_transaction_id,plaid_transaction_id').eq('plaid_item_record_id',id);assert(!versions.error)
      const record=await resolveFinancialTransactionRecord({supabase:db,financialTransactionId:versions.data.find(v=>v.plaid_transaction_id===tx).canonical_financial_transaction_id})
      const question=await resolveFinancialTransactionRecord({supabase:db,financialTransactionId:versions.data.find(v=>v.plaid_transaction_id===qtx).canonical_financial_transaction_id})
      const repository=new SupabaseBookkeepingRepository(db),service=new CanonicalBookkeepingService(repository)
      const decision=await service.recordDecision({actor:{businessId:f.businessId,userId:f.userId,provenance:'user'},recordId:record.record.id,expectedCurrentDecisionId:record.decision.id,decision:{bookkeepingNature:'expense',treatment:'business',reviewStatus:'resolved',reason:'Internal deterministic certification business fact.',allocations:[{kind:'business',amountCents:-10400,taxCategoryKey:null}]}})
      const issue=await new SupabaseBookkeepingRepository(admin).openReviewIssue({businessId:f.businessId,recordId:question.record.id,decisionId:question.decision.id,reason:'BUSINESS_USE_UNCLEAR',issueKey:'cert-removal-'+id,contextFingerprint:'a'.repeat(64)})
      assert((await repository.listCurrentWeeklyReviewItems(f.businessId,new Date().toISOString())).some(x=>x.event.reviewIssueId===issue.reviewIssueId))
      const report=()=>getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-09-20',periodEnd:'2026-09-20'})
      const before=await report();assert(before.rows.some(r=>r.recordId===record.record.id||r.id===record.record.id),'Expense present before removal')
      await apply([normalizePlaidRemoval({transaction_id:tx}),normalizePlaidRemoval({transaction_id:qtx})])
      const replay=await apply([normalizePlaidRemoval({transaction_id:tx}),normalizePlaidRemoval({transaction_id:qtx})]);assert.equal(replay.duplicates,2)
      const after=await report(),home=await getAuthenticatedCanonicalFinancialSummary({supabase:db,periodStart:'2026-09-20',periodEnd:'2026-09-20',currency:'USD'})
      assert.equal(before.businessExpensesCents-after.businessExpensesCents,10400)
      assert.equal(home.businessExpensesCents,after.businessExpensesCents)
      const rows=await listTransactionReadModel({supabase:db,userId:f.userId,recordIds:[record.record.id,question.record.id]});assert.equal(rows.length,0)
      assert(!(await repository.listCurrentWeeklyReviewItems(f.businessId,new Date().toISOString())).some(x=>x.event.reviewIssueId===issue.reviewIssueId))
      await assert.rejects(()=>service.recordDecision({actor:{businessId:f.businessId,userId:f.userId,provenance:'user'},recordId:record.record.id,expectedCurrentDecisionId:decision.id,decision:{bookkeepingNature:'expense',treatment:'business',reviewStatus:'resolved',reason:'Stale correction must fail.',allocations:[{kind:'business',amountCents:-10400,taxCategoryKey:null}]}}))
      const index=await refreshBettiActionIndex({admin,businessId:f.businessId});assert.equal(index.failed,0)
      const retained=await admin.from('plaid_transaction_versions').select('id').eq('plaid_item_record_id',id);assert.equal(retained.data.length,4)
      assert(!(await admin.from('plaid_items').update({connection_status:'disconnected',consent_status:'revoked',sync_requested_at:null}).eq('id',id)).error)
      const proof={kind:'INTERNAL DETERMINISTIC TEST — not provider removal',beforeExpenses:before.businessExpensesCents,afterExpenses:after.businessExpensesCents,removedExpenseCents:10400,homeEqualsReports:true,transactionsExcluded:true,questionExcluded:true,staleWriteRejected:true,replayDuplicates:2,retainedVersions:4,index};await writeFile(dir+'/internal-removal.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof))
    } else if(process.argv.includes('--diagnose')){
      const post=await session(f)
      const {getAuthenticatedCanonicalReport}=await import('../app/lib/bookkeeping/reporting-service.ts')
      const report=await getAuthenticatedCanonicalReport({supabase:post.client,periodStart:'2024-01-01',periodEnd:'2026-09-21'})
      console.log(JSON.stringify({income:report.businessIncomeCents,expenses:report.businessExpensesCents}))
    } else if (process.argv.includes('--statement')) {
      const post=await session(f),browser=await chromium.launch({headless:true})
      try {
        const context=await browser.newContext({viewport:{width:1280,height:900}})
        await context.addCookies([...post.cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
        const get=async path=>{const r=await context.request.get(origin+path);assert.equal(r.status(),200,path);return r.json()}
        const before=await get('/api/bookkeeping/source-coverage')
        const sources=await admin.from('plaid_account_sources').select('financial_account_id').eq('plaid_item_record_id',item.itemRecordId);assert(!sources.error)
        const accounts=await admin.from('financial_accounts').select('id,display_name,mask_last_four').eq('business_id',f.businessId).eq('account_type','checking').in('id',sources.data.map(s=>s.financial_account_id))
        assert(accounts.data?.length);const account=accounts.data[0]
        const {PDFDocument,StandardFonts}=await import('pdf-lib'),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),p=pdf.addPage([612,792])
        const lines=['First Platypus Bank','Checking Statement',`Account ending ${account.mask_last_four}`,'Statement period: 2024-01-01 - 2024-01-31','Beginning balance: $1,000.00','Date                 Description                                      Debits              Credits','2024-01-15      OFFICE SUPPLIES                             $100.00','Ending balance: $900.00','SYNTHETIC CERTIFICATION - NOT A REAL BANK STATEMENT']
        lines.forEach((text,i)=>p.drawText(text,{x:40,y:750-i*30,size:10,font}))
        const file=dir+'/historical-january-2024.pdf';let saved=await readFile(dir+'/statement-private.json','utf8').then(JSON.parse).catch(()=>null)
        const page=await context.newPage();await page.goto(origin+'/import')
        if(!saved){await writeFile(file,await pdf.save());const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/documents'&&r.request().method()==='POST');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(file);const r=await response;assert.equal(r.status(),200);const body=await r.json();saved={documentId:body.document.id,accountId:account.id};await writeFile(dir+'/statement-private.json',JSON.stringify(saved),{mode:0o600})}
        let statement,states=[]
        for(let i=0;i<60;i++){const docs=await get('/api/documents/statements');statement=docs.documents.find(d=>d.id===saved.documentId);states.push({at:new Date().toISOString(),state:statement?.processing_status??'intake',from:statement?.period_start});if(statement?.statement_account_id&&statement?.period_start)break;await new Promise(r=>setTimeout(r,5000))}
        await writeFile(dir+'/statement-processing.json',JSON.stringify(states,null,2));assert(statement?.statement_account_id,'Statement did not finish within bounded certification wait')
        const existingLinks=await get('/api/documents/statements/accounts');if(!existingLinks.links.some(l=>l.statement_account_id===statement.statement_account_id&&l.target_account_id===account.id)){const linked=await post('/api/documents/statements/accounts',{statementAccountId:statement.statement_account_id,targetAccountId:account.id,requestKey:crypto.randomUUID()});assert.equal(linked.status,200)}
        const after=await get('/api/bookkeeping/source-coverage'),earlier=before.accounts.find(a=>a.id===account.id),later=after.accounts.find(a=>a.id===account.id)
        assert(!later.recordsNeeded.some(r=>r.from<='2024-01-31'&&r.through>='2024-01-01'))
        const replay=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/documents'&&r.request().method()==='POST');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(file);const r=await replay;assert.equal(r.status(),200);assert.equal((await r.json()).document.id,saved.documentId)
        await writeFile(dir+'/statement-fill-in.json',JSON.stringify({realUpload:true,documentId:saved.documentId,accountId:account.id,before:earlier,after:later,duplicateDocumentSameId:true},null,2));await page.goto(origin+'/home');await page.getByText('Records are still needed for part of this period.').click();await page.screenshot({path:dir+'/statement-filled-home.png',fullPage:true})
        const proof={realUpload:true,documentId:saved.documentId,accountId:account.id,before:earlier,after:later,duplicateDocumentSameId:true};await writeFile(dir+'/statement-fill-in.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({realUpload:true,confirmedAccountLink:true,january2024Supported:true,duplicateDocumentSameId:true}))
      } finally {await browser.close()}
    } else if (process.argv.includes('--exercise')) {
      const post=await session(f),headers={Cookie:[...post.cookies].map(([k,v])=>`${k}=${v}`).join('; ')}
      const get=async path=>{const r=await fetch(origin+path,{headers,signal:AbortSignal.timeout(60000)});assert(r.ok,`${path} ${r.status}`);return r.json()}
      const before=await admin.from('plaid_transaction_versions').select('id,plaid_transaction_id,rejection_reason,raw_source,canonical_financial_transaction_id').eq('plaid_item_record_id',item.itemRecordId)
      assert(!before.error)
      const bad=before.data.filter(x=>x.rejection_reason).map(x=>({transactionId:x.plaid_transaction_id,amount:x.raw_source?.amount,description:x.raw_source?.name,canonicalId:x.canonical_financial_transaction_id}))
      assert(bad.length>0&&bad.every(x=>x.canonicalId===null),'quarantine exists without invented money')
      const label='CERT VALID AFTER MALFORMED '+Date.now(),date=new Date().toISOString().slice(0,10)
      const created=await plaid('/sandbox/transactions/create',{access_token:item.accessToken,transactions:[{date_transacted:date,date_posted:date,amount:12.34,description:label}]})
      let valid
      for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,2000));const q=await admin.from('financial_transactions').select('id,amount_cents').eq('business_id',f.businessId).eq('original_description',label);if(q.data?.length){valid=q.data;break}}
      assert(valid?.length===1&&valid[0].amount_cents===-1234,'valid update after quarantine ingested once')
      const coverage=await get('/api/bookkeeping/source-coverage'),report=await get('/api/reports/summary?start=2024-01-01&end='+date)
      assert.equal(coverage.start,'2024-01-01');assert(coverage.needsRecords);assert.deepEqual(report.sourceCoverage,coverage)
      const proof={createdRequestId:created.request_id,quarantined:bad,validAfterMalformed:valid,coverage,report:{income:report.businessIncomeCents,expenses:report.businessExpensesCents},observedAt:new Date().toISOString()}
      await writeFile(`${dir}/quarantine-and-coverage.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify({quarantined:bad.length,validAfterMalformed:true,scope:coverage.start,accountGaps:coverage.accounts.map(a=>({id:a.id,gaps:a.recordsNeeded})),sameReportsCoverage:true}))
    } else if (process.argv.includes('--capture')) {
      const post=await session(f),browser=await chromium.launch({headless:true})
      try {const context=await browser.newContext();await context.addCookies([...post.cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
       const page=await context.newPage()
       for(const width of [390,768,1280]){await page.setViewportSize({width,height:900});for(const path of ['/home','/check-in','/reports']){await page.goto(origin+path);if(path==='/reports'){await page.getByRole('button',{name:'Annual',exact:true}).click();await page.getByLabel('Reporting year').selectOption('2024');await page.getByText('Records are still needed for part of this period.').waitFor()};if(path==='/home')await page.getByText('Records are still needed for part of this period.').waitFor();if(path!=='/check-in')await page.getByText('Records are still needed for part of this period.').click();await page.screenshot({path:`${dir}/${path.slice(1)}-${width}.png`,fullPage:true})}}
      } finally {await browser.close()}
      console.log('Public staging screenshots captured')
    } else if (process.argv.includes('--cross-tenant')) {
      const other = await session(fixtures[6])
      const response = await fetch(`${origin}/api/plaid/disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: [...other.cookies].map(([k,v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify({ itemId: item.itemRecordId }) })
      assert.equal(response.status, 502)
      const state = await admin.from('plaid_items').select('connection_status').eq('id', item.itemRecordId).single()
      assert(!state.error && state.data.connection_status === 'connected')
      const proof = { unrelatedSyntheticTenantStatus: response.status, targetStillConnected: true }
      await writeFile(`${dir}/tenant-proof.json`, JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof))
    } else if (process.argv.includes('--disconnect')) {
      const post = await session(f)
      const response = await post('/api/plaid/disconnect', { itemId: item.itemRecordId })
      const state = await admin.from('plaid_items').select('connection_status,consent_status,sync_cursor').eq('id', item.itemRecordId).single()
      assert(!state.error && state.data.connection_status === 'disconnected')
      const claim = await admin.rpc('claim_plaid_item_sync', { p_item_record_id: item.itemRecordId, p_lease_id: crypto.randomUUID() })
      assert(!claim.error && claim.data.length === 0)
      const proof = { status: response.status, disconnected: true, claimBlocked: true, cursorPresent: Boolean(state.data.sync_cursor) }
      await writeFile(`${dir}/disconnect-proof.json`, JSON.stringify(proof, null, 2))
      console.log(JSON.stringify(proof))
    } else if (process.argv.includes('--fire-new') || process.argv.includes('--fire-sync')) {
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
      const state = await admin.from('plaid_items').select('id,connection_status,consent_status,new_accounts_available,sync_requested_at,last_successful_sync_at,sync_cursor,initial_update_complete,historical_update_complete').eq('id', item.itemRecordId).single()
      const events = await admin.from('plaid_webhook_events').select('id,webhook_type,webhook_code,received_at,processed_at,last_attempt_at').eq('plaid_item_record_id', item.itemRecordId).order('received_at')
      const versions = await admin.from('plaid_transaction_versions').select('id', { count: 'exact', head: true }).eq('plaid_item_record_id', item.itemRecordId)
      assert(!state.error && !events.error && !versions.error)
      const revisions = await admin.from('plaid_transaction_versions').select('id,event_type,amount_cents,supersedes_version_id,canonical_financial_transaction_id').eq('plaid_item_record_id', item.itemRecordId)
      assert(!revisions.error)
      const { sync_cursor: cursor, ...safeState } = state.data
      const proof = { webhook: provider.item.webhook, state: safeState, hasPersistedCursor: Boolean(cursor), events: events.data, transactionVersions: versions.count, revisions: revisions.data, observedAt: new Date().toISOString() }
      await writeFile(`${dir}/observation-${Date.now()}.json`, JSON.stringify(proof, null, 2))
      console.log(JSON.stringify(proof))
    }
  }
} catch (error) {
  // Only local assertions / fixed API codes; never SDK objects or credentials.
  console.error(error instanceof Error ? `${error.message} ${error.stack?.split('\n')[1]??''}` : 'Certification unavailable')
  process.exitCode = 1
}
