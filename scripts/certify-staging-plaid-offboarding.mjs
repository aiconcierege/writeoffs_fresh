// Real Plaid Sandbox -> public dedicated staging. Credentials stay in private artifacts.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
process.loadEnvFile('.env.staging.local')
assert.equal(new URL(process.env.SUPABASE_URL).hostname, 'sgrqrrxrlglhjuetdtps.supabase.co')
assert.equal(process.env.PLAID_ENV, 'sandbox')
assert(process.argv.includes('--certify'))
const origin = process.argv.includes('--local-home') ? 'http://localhost:3107' : 'https://writeoffs-fresh-staging.vercel.app'
const webhook = `${origin}/api/plaid/webhook`
const sandboxPassword = JSON.stringify({override_accounts:[{type:'depository',subtype:'checking',starting_balance:1000,currency:'USD',transactions:[{date_transacted:'2026-09-20',date_posted:'2026-09-20',amount:42.19,description:'CERT OFFICE SUPPLIES'},{date_transacted:'2026-09-19',date_posted:'2026-09-19',amount:-2100,description:'ACH CREDIT CLIENT PAYMENT'}]}]})
const run = process.argv.find(arg => arg.startsWith('--run='))?.slice(6) ?? 'default'
assert(/^[a-z0-9-]+$/.test(run))
const dir = run === 'default' ? '/private/tmp/writeoffs-plaid-offboarding' : `/private/tmp/writeoffs-plaid-offboarding-${run}`
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

 if(process.argv.includes('--provision'))process.exit(0)
 const proof=async(name,data)=>{await writeFile(`${dir}/${name}.json`,JSON.stringify(data,null,2));console.log(JSON.stringify(data))}
 const post=await session(f)
 const itemPath=`${dir}/item-private.json`
 if(process.argv.includes('--create')){
  const made=await plaid('/sandbox/public_token/create',{institution_id:'ins_109508',initial_products:['transactions'],options:{webhook,override_username:'user_custom',override_password:sandboxPassword}})
  const exchanged=await post('/api/plaid/exchange',{publicToken:made.public_token,requestId:crypto.randomUUID()})
  process.loadEnvFile('.env.development.local')
  const {createDecipheriv}=await import('node:crypto')
  const result=await admin.from('plaid_items').select('id,business_id,plaid_item_id,access_token_ciphertext').eq('id',exchanged.data.itemId).single();assert(!result.error&&result.data.business_id===f.businessId)
  const row=result.data,e=JSON.parse(row.access_token_ciphertext),d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.PLAID_TOKEN_ENCRYPTION_KEY,'base64'),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'))
  const accessToken=Buffer.concat([d.update(Buffer.from(e.ciphertext,'base64')),d.final()]).toString()
  await writeFile(itemPath,JSON.stringify({id:row.id,providerId:row.plaid_item_id,accessToken}),{mode:0o600})
  await proof('created',{realPlaidSandbox:true,publicStaging:origin,businessId:f.businessId,itemId:row.id,http:exchanged.status})
 }
 if(process.argv.includes('--disconnect')){
  const item=JSON.parse(await readFile(itemPath,'utf8'))
  const before=await admin.from('plaid_transaction_versions').select('id',{count:'exact',head:true}).eq('plaid_item_record_id',item.id);assert(!before.error)
  const r=await post('/api/plaid/disconnect',{itemId:item.id});const replay=await post('/api/plaid/disconnect',{itemId:item.id})
  let providerCode;try{await plaid('/accounts/get',{access_token:item.accessToken});assert.fail('Removed credential still works')}catch(e){providerCode=e.message;assert(providerCode.includes('ITEM_NOT_FOUND'))}
  const row=await admin.from('plaid_items').select('connection_status,consent_status,access_token_ciphertext,sync_cursor,sync_lease_id').eq('id',item.id).single();assert(!row.error)
  const claim=await admin.rpc('claim_plaid_item_sync',{p_item_record_id:item.id,p_lease_id:crypto.randomUUID()});assert(!claim.error&&claim.data.length===0)
  const payload={item_id:item.providerId,environment:'sandbox',webhook_type:'TRANSACTIONS',webhook_code:'SYNC_UPDATES_AVAILABLE'},hash=crypto.randomUUID().replaceAll('-','').repeat(2)
  const event=await admin.rpc('record_plaid_webhook',{p_hash:hash,p_payload:payload}),duplicate=await admin.rpc('record_plaid_webhook',{p_hash:hash,p_payload:payload});assert(!event.error&&!event.data.shouldSync&&duplicate.data.duplicate)
  const after=await admin.from('plaid_transaction_versions').select('id',{count:'exact',head:true}).eq('plaid_item_record_id',item.id);assert(after.count===before.count)
  await proof('disconnect',{realPlaidSandbox:true,publicStaging:origin,http:r.status,replayHttp:replay.status,providerCode,connection:row.data.connection_status,tokenErased:row.data.access_token_ciphertext==='',cursorErased:row.data.sync_cursor===null,leaseCleared:row.data.sync_lease_id===null,queuedSyncDenied:true,postRemovalWebhook:'INTERNAL DETERMINISTIC — canonical handler, no import',duplicateSafe:true,historicalVersionsBefore:before.count,historicalVersionsAfter:after.count})
 }
 if(process.argv.includes('--request')){
  const r=await post('/api/account/deletion',{requestKey:crypto.randomUUID()});await writeFile(`${dir}/request-private.json`,JSON.stringify(r.data.request),{mode:0o600})
  const request=r.data.request;assert.equal(request.status,'scheduled');const days=(Date.parse(request.scheduled_for)-Date.now())/86400000;assert(days>6.99&&days<=7.01)
  const allowed=await admin.rpc('plaid_sync_business_allowed',{p_business_id:f.businessId});assert(!allowed.error&&allowed.data===false)
  await proof('deletion-request',{publicStaging:origin,http:r.status,requestId:request.id,status:request.status,graceDays:days,newSyncDenied:true})
 }
 if(process.argv.includes('--security')){
  const cookies=new Map(),aal1=createServerClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}})
  assert(!(await aal1.auth.signInWithPassword({email:f.email,password:f.password})).error)
  const noMfa=await fetch(origin+'/api/account/deletion',{method:'POST',headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify({requestKey:crypto.randomUUID()})});assert.equal(noMfa.status,403)
  const request=JSON.parse(await readFile(`${dir}/request-private.json`,'utf8')),otherFixture=JSON.parse(await readFile('/private/tmp/writeoffs-plaid-update-mode/fixture-private.json','utf8')),other=await session(otherFixture)
  const cross=await fetch(origin+'/api/account/deletion',{method:'DELETE',headers:{'Content-Type':'application/json',Cookie:[...other.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify({requestId:request.id,requestKey:crypto.randomUUID()})});assert.equal(cross.status,409)
  const direct=await post.client.rpc('schedule_customer_account_deletion',{p_business_id:otherFixture.businessId,p_user_id:f.userId,p_business_identity_hash:'a'.repeat(64),p_user_identity_hash:'b'.repeat(64),p_request_key:crypto.randomUUID()});assert(direct.error)
  await proof('security',{publicStaging:origin,aal1Deletion:noMfa.status,crossTenantCancel:cross.status,crossTenantScheduleDenied:true})
 }
 if(process.argv.includes('--finish')){
  const request=JSON.parse(await readFile(`${dir}/request-private.json`,'utf8')),lease=crypto.randomUUID()
  const user=(await admin.auth.admin.getUserById(f.userId)).data.user;assert(user?.user_metadata.synthetic_plaid_completion)
  const path=`receipts/${f.userId}/offboarding-test.txt`;assert(!(await admin.storage.from('receipts').upload(path,Buffer.from('isolated synthetic deletion proof'),{upsert:true})).error)
  // Internal time-controlled execution of the existing worker steps; never drain other tenants.
  const claimed=await admin.from('account_deletion_requests').update({requested_at:new Date(Date.now()-8*86400000).toISOString(),scheduled_for:new Date(Date.now()-86400000).toISOString(),status:'executing',lease_token:lease,lease_expires_at:new Date(Date.now()+120000).toISOString()}).eq('id',request.id).eq('business_id',f.businessId).eq('status','scheduled').select('id');assert(!claimed.error&&claimed.data.length===1)
  assert(!(await admin.storage.from('receipts').remove([path])).error)
  const deleted=await admin.rpc('delete_customer_application_data',{p_request_id:request.id,p_lease_token:lease});assert(!deleted.error,deleted.error?.message)
  assert(!(await admin.auth.admin.deleteUser(f.userId)).error)
  const completed=await admin.rpc('complete_account_deletion',{p_request_id:request.id,p_lease_token:lease});assert(!completed.error&&completed.data===true)
  const business=await admin.from('businesses').select('id').eq('id',f.businessId);assert(!business.error&&business.data.length===0)
  const auth=await admin.auth.admin.getUserById(f.userId);assert(!auth.data.user)
  const files=await admin.storage.from('receipts').list(`receipts/${f.userId}`);assert(!files.error&&files.data.length===0)
  const tombstone=await admin.from('account_deletion_tombstones').select('deletion_request_id,reason,effective_at').eq('deletion_request_id',request.id).single();assert(!tombstone.error)
  await proof('permanent-deletion',{internalDeterministic:true,timeControlled:true,workerStepsInvokedIndividually:true,requestId:request.id,privateObjectRemoved:true,applicationDataRemoved:true,authAndMfaRemoved:true,tombstonePresent:true,completed:true})
 }
 if(process.argv.includes('--cancel')){
  const request=JSON.parse(await readFile(`${dir}/request-private.json`,'utf8'));const response=await fetch(origin+'/api/account/deletion',{method:'DELETE',headers:{'Content-Type':'application/json',Cookie:[...post.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify({requestId:request.id,requestKey:crypto.randomUUID()})});assert(response.ok)
  const data=await response.json();assert(data.canceled&&data.reconnectPlaid)
  await proof('deletion-cancel',{publicStaging:origin,http:response.status,canceled:true,reconnectRequired:true})
 }
}catch(error){console.error('Offboarding certification failed:',error instanceof Error?error.message:'unknown');process.exitCode=1}
