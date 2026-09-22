// Operator-only synthetic certification. Never receives the independent ledger key.
import assert from 'node:assert/strict'
import {createHmac,randomUUID} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
process.loadEnvFile('.env.staging.local')
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--synthetic-only'))
const mode=process.argv.find(x=>x.startsWith('--mode='))?.slice(7)
const dir='/private/tmp/writeoffs-ledger-runtime-certification',origin='https://writeoffs-fresh-staging.vercel.app'
await mkdir(dir,{recursive:true,mode:0o700})
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const state=await readFile(dir+'/private.json','utf8').then(JSON.parse).catch(()=>({}))
const report=await readFile(dir+'/report.json','utf8').then(JSON.parse).catch(()=>({kind:'REAL_STAGING_APPLICATION_WORKER',syntheticOnly:true,stages:{}}))
const checked=(r,code)=>{assert(!r.error,code+(r.error?.code?':'+r.error.code:''));return r.data}
async function persist(){await writeFile(dir+'/private.json',JSON.stringify(state),{mode:0o600});await writeFile(dir+'/report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600})}
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(t,mfa=true){const cookies=new Map();const client=createServerClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(x=>cookies.set(x.name,x.value))}});checked(await client.auth.signInWithPassword({email:t.email,password:t.password}),'LOGIN');if(mfa)checked(await client.auth.mfa.challengeAndVerify({factorId:t.factorId,code:totp(t.totpSecret)}),'MFA');return {client,call:async(method,body)=>fetch(origin+'/api/account/deletion',{method,headers:{'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)})}}
async function validate(t){const u=checked(await db.auth.admin.getUserById(t.user),'OWNER');assert.equal(u.user?.user_metadata.synthetic_dr_runtime,true);const b=checked(await db.from('businesses').select('owner_user_id').eq('id',t.business).single(),'BUSINESS');assert.equal(b.owner_user_id,t.user)}
async function counts(t){const out={};for(const table of ['businesses','financial_accounts','financial_transactions','bookkeeping_records','bookkeeping_decisions','bookkeeping_review_events','bookkeeping_processing_jobs','plaid_items','receipts']){const r=await db.from(table).select('id',{count:'exact',head:true}).eq(table==='businesses'?'id':'business_id',t.business);checked(r,'COUNT_'+table);out[table]=r.count}return out}
async function files(t,present){for(const kind of ['receipts','statements']){const rows=checked(await db.storage.from('receipts').list(`${kind}/${t.user}`),'FILES');assert.equal(rows.some(r=>r.name==='runtime-proof.txt'),present)}}
async function create(label){const nonce=randomUUID(),t={user:null,business:null,email:`dr-runtime-${label}-${nonce}@staging.writeoffs.invalid`,password:`Synthetic-${nonce}!`};const u=checked(await db.auth.admin.createUser({email:t.email,password:t.password,email_confirm:true,user_metadata:{synthetic_dr_runtime:true}}),'CREATE');t.user=u.user.id;t.business=checked(await db.from('businesses').select('id').eq('owner_user_id',t.user).single(),'BUSINESS').id;state[label]=t;await persist();checked(await db.rpc('create_business_membership_grant',{p_business_id:t.business,p_plan:'business',p_starts_at:new Date().toISOString(),p_ends_at:null,p_request_key:`dr-runtime:${nonce}`,p_reason:'Synthetic deletion-worker certification',p_provenance:'admin',p_actor_user_id:null}),'MEMBERSHIP');const {client}=await session(t,false);const e=checked(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic runtime certification'}),'ENROLL');t.factorId=e.id;t.totpSecret=e.totp.secret;checked(await client.auth.mfa.challengeAndVerify({factorId:e.id,code:totp(e.totp.secret)}),'VERIFY');await persist();
 await seedRecords(t);return t}
async function seedRecords(t){
 await validate(t);const nonce=t.business
 for(const kind of ['receipts','statements'])checked(await db.storage.from('receipts').upload(`${kind}/${t.user}/runtime-proof.txt`,Buffer.from('synthetic-runtime-proof'),{upsert:true}),'UPLOAD')
 if(!t.account)t.account=checked(await db.from('financial_accounts').insert({business_id:t.business,institution_name:'Synthetic DR',display_name:'Synthetic DR',account_type:'checking'}).select('id').single(),'ACCOUNT').id
 let tx=checked(await db.from('financial_transactions').select('id').eq('business_id',t.business).eq('financial_account_id',t.account).limit(1),'TRANSACTION_LOOKUP')[0]
 if(!tx)tx=checked(await db.from('financial_transactions').insert({business_id:t.business,financial_account_id:t.account,source_fingerprint:`dr-runtime-${nonce}`,import_method:'provider',original_description:'Synthetic runtime expense',amount_cents:-12500,transaction_date:'2026-09-01'}).select('id').single(),'TRANSACTION')
 t.record=checked(await db.rpc('ensure_bookkeeping_record',{p_business_id:t.business,p_source_kind:'financial_transaction',p_financial_transaction_id:tx.id,p_provenance:'system',p_ingestion_key:`dr-runtime-${nonce}`,p_amount_cents:-12500,p_currency:'USD',p_occurred_on:'2026-09-01'}),'RECORD').id
 await persist()
 if(!t.decision){t.decision=checked(await db.rpc('append_bookkeeping_decision',{p_business_id:t.business,p_bookkeeping_record_id:t.record,p_expected_current_decision_id:null,p_bookkeeping_nature:'expense',p_treatment:'business',p_review_status:'resolved',p_provenance:'system',p_confidence:1,p_reason:'Synthetic DR fixture',p_business_purpose:'Synthetic certification',p_allocations:[{kind:'business',amount_cents:-12500,tax_category_key:null}]}),'DECISION');await persist()}
 if(!t.seeded){checked(await db.from('bookkeeping_processing_jobs').insert({business_id:t.business,bookkeeping_record_id:t.record,processing_reason:'synthetic_dr',target_fingerprint:nonce,state:'processing',lease_id:randomUUID(),lease_expires_at:'2099-01-01T00:00:00Z',claimed_at:new Date().toISOString()}),'JOB');checked(await db.from('receipts').insert({user_id:t.user,business_id:t.business,storage_path:`receipts/${t.user}/runtime-proof.txt`,mime_type:'text/plain',bytes:23}),'RECEIPT');t.seeded=true;await persist()}
}

try{
 if(mode==='setup'){if(state.A)await seedRecords(state.A);else await create('A');if(state.B)await seedRecords(state.B);else await create('B');state.controlBefore=await counts(state.B);report.stages.fixtures=true}
 else if(mode==='request'){
  await validate(state.A);await validate(state.B);const a=await session(state.A),low=await session(state.A,false),b=await session(state.B);
  const noMfa=await low.call('POST',{requestKey:randomUUID()});assert.equal(noMfa.status,403);
  const r=await a.call('POST',{requestKey:randomUUID()});assert.equal(r.status,200,'REQUEST_HTTP_'+r.status);const payload=await r.json();state.request=payload.request.id;const days=(Date.parse(payload.request.scheduled_for)-Date.now())/86400000;assert(days>6.99&&days<=7.01);await persist();
  const cross=await b.call('DELETE',{requestId:state.request,requestKey:randomUUID()});assert.equal(cross.status,409);
  const direct=await a.client.rpc('schedule_customer_account_deletion',{p_business_id:state.B.business,p_user_id:state.A.user,p_business_identity_hash:'a'.repeat(64),p_user_identity_hash:'b'.repeat(64),p_request_key:randomUUID()});assert(direct.error);
  const anon=await fetch(origin+'/api/internal/account-lifecycle/drain',{method:'POST'});assert.equal(anon.status,404);
  state.item=checked(await db.from('plaid_items').insert({business_id:state.A.business,plaid_item_id:`synthetic-dr-${randomUUID()}`,access_token_ciphertext:'synthetic-invalid-provider-envelope',environment:'sandbox',sync_cursor:'synthetic-cursor',sync_lease_id:randomUUID(),sync_lease_expires_at:'2099-01-01T00:00:00Z'}).select('id').single(),'PLAID_FIXTURE').id;
  report.stages.verifiedRequest=true;report.security={aal1Denied:true,crossTenantCancelDenied:true,crossTenantScheduleDenied:true,unauthorizedWorkerDenied:true};report.graceDays=days
 }
 else if(['invalid','publish','retry','conflict','complete'].includes(mode)){
  await validate(state.A);const row=checked(await db.from('account_deletion_requests').select('status,attempt_count,started_at').eq('id',state.request).eq('business_id',state.A.business).single(),'REQUEST_STATE');assert(['scheduled','retryable'].includes(row.status));
  if(mode==='publish')state.publicationTime=new Date().toISOString();
  const started=mode==='invalid'?'infinity':mode==='conflict'?new Date(Date.parse(state.publicationTime)+1000).toISOString():state.publicationTime;
  if(mode==='complete')checked(await db.from('plaid_items').update({consent_status:'revoked'}).eq('id',state.item).eq('business_id',state.A.business),'RELEASE_SYNTHETIC_BLOCKER');
  const patched=checked(await db.from('account_deletion_requests').update({requested_at:new Date(Date.now()-8*86400000).toISOString(),scheduled_for:new Date(Date.now()-86400000).toISOString(),started_at:started}).eq('id',state.request).eq('business_id',state.A.business).in('status',['scheduled','retryable']).select('id'),'DUE');assert.equal(patched.length,1);
  state.waiting={mode,baseline:row.attempt_count};report.timeControl='Only synthetic request dates advanced; no shared clock change';await persist();console.log({madeSyntheticRequestDue:true,mode});
 }
 else if(mode==='observe'){
  const {mode:stage,baseline}=state.waiting;let row;
  for(let i=0;i<150;i++){row=checked(await db.from('account_deletion_requests').select('status,attempt_count,last_failure_code,started_at,completed_at').eq('id',state.request).single(),'OBSERVE');if(row.attempt_count>baseline&&['retryable','completed'].includes(row.status))break;await new Promise(r=>setTimeout(r,4000))}
  assert(row.attempt_count>baseline&&['retryable','completed'].includes(row.status),'WORKER_NOT_OBSERVED');
  if(stage==='complete')assert.equal(row.status,'completed');else{assert.equal(row.status,'retryable');checked(await db.from('account_deletion_requests').update({scheduled_for:'2099-01-01T00:00:00Z'}).eq('id',state.request).eq('status','retryable'),'PAUSE_FIXTURE');await validate(state.A);await files(state.A,true);assert((await counts(state.A)).financial_transactions>0);const expected=stage==='invalid'?'INVALID_DELETION_ENTRY':stage==='conflict'?'INDEPENDENT_DELETION_CONFLICT':'ACCOUNT_DELETION_FAILED';assert.equal(row.last_failure_code,expected)}
  report.stages[stage]={status:row.status,attemptCount:row.attempt_count,safeCode:row.last_failure_code,observedAt:new Date().toISOString(),worker:'Deployed scheduled application worker; no manual global drain'};delete state.waiting
 }
 else if(mode==='verify'){
  const row=checked(await db.from('account_deletion_requests').select('status,attempt_count').eq('id',state.request).single(),'FINAL_REQUEST');assert.equal(row.status,'completed');const remaining=await counts(state.A);assert(Object.values(remaining).every(n=>n===0));const u=await db.auth.admin.getUserById(state.A.user);assert(!u.data.user);await files(state.A,false);await validate(state.B);await files(state.B,true);assert.deepEqual(await counts(state.B),state.controlBefore);checked(await db.from('account_deletion_tombstones').select('deletion_request_id').eq('deletion_request_id',state.request).single(),'TOMBSTONE');report.result='PASS';report.remainingRows=remaining;const sync=checked(await db.rpc('plaid_sync_business_allowed',{p_business_id:state.A.business}),'DELETED_SYNC_GUARD');assert.equal(sync,false);report.deletedCustomerSyncDenied=true;report.authMfaRemoved=true;report.privateFilesRemoved=true;report.controlTenantPreserved=true;report.tombstoneRetained=true;report.actualProviderRemoval='Prior REAL PLAID SANDBOX certification retained; this fixture has synthetic Plaid state';report.publicationFailure='Synthetic invalid effective timestamp rejected by deployed publisher before cleanup';report.publicationProof='Successful conditional publication/readback precedes deliberate invalid-Plaid-envelope failure; changed timestamp yields immutable-entry conflict; original timestamp retries safely and deletion completes.'
 }
 else if(mode==='cleanup-control'){
  await validate(state.B);const b=await session(state.B);const r=await b.call('POST',{requestKey:randomUUID()});assert.equal(r.status,200);const body=await r.json();state.controlRequest=body.request.id;await persist();checked(await db.from('account_deletion_requests').update({requested_at:new Date(Date.now()-8*86400000).toISOString(),scheduled_for:new Date(Date.now()-86400000).toISOString()}).eq('id',state.controlRequest).eq('business_id',state.B.business).eq('status','scheduled'),'CONTROL_DUE');
  let row;for(let i=0;i<150;i++){row=checked(await db.from('account_deletion_requests').select('status,last_failure_code').eq('id',state.controlRequest).single(),'CONTROL_OBSERVE');if(row.status==='completed')break;if(row.status==='retryable')throw Error('CONTROL_DELETE_'+row.last_failure_code);await new Promise(r=>setTimeout(r,4000))}assert.equal(row.status,'completed');assert(Object.values(await counts(state.B)).every(n=>n===0));await files(state.B,false);assert(!(await db.auth.admin.getUserById(state.B.user)).data.user);report.syntheticControlCleanedThroughApplicationWorker=true
 }
 else throw Error('UNKNOWN_MODE')
 report.updatedAt=new Date().toISOString();await persist();console.log({mode,result:'PASS',stages:report.stages,...(report.result?{certification:report.result}:{})})
}catch(e){await persist();console.error({result:'FAIL',mode,code:e.message?.replace(/[^A-Za-z0-9_: -]/g,'').slice(0,120)});process.exitCode=1}
