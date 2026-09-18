// Real dedicated-staging scope contract. Only explicitly marked isolated tenants are mutable.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac,randomUUID} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
const origin=process.env.CERTIFICATION_ORIGIN??'https://writeoffs-fresh-staging.vercel.app'
assert(/^https:\/\/writeoffs-fresh-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))
const dir=process.env.CERTIFICATION_ARTIFACT_DIR??'/private/tmp/writeoffs-phase3',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(/^\/private\/tmp\/writeoffs-phase3(?:-[a-z0-9-]+)?$/.test(dir))
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'),'Explicit certification flag required')
await mkdir(`${dir}/browser`,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));const jar=await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'');for(const line of jar.split('\n')){if(!line.includes('\t'))continue;const parts=line.replace(/^#HttpOnly_/,'').split('\t');if(parts[0]===new URL(origin).hostname)await context.addCookies([{domain:parts[0],path:parts[2],secure:parts[3]==='TRUE',name:parts[5],value:parts[6],httpOnly:true,sameSite:'None'}])}return{context,client}}

const fixtures=JSON.parse(await readFile(`${dir}/fixtures.json`,'utf8')),a=fixtures.find(f=>f.scenario==='1'),b=fixtures.find(f=>f.scenario==='3')
for(const f of[a,b])assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
const browser=await chromium.launch({headless:true})
try{
 const own=await session(a,browser),other=await session(b,browser),page=await own.context.newPage()
 const tables=['bookkeeping_decisions','bookkeeping_review_events','bookkeeping_document_links','financial_account_use_events','betti_guided_assertions']
 const snapshot=async()=>{const state={};for(const f of[a,b])for(const table of tables){const r=await admin.from(table).select('*').eq('business_id',f.businessId).order('id');assert(!r.error);state[f.scenario+table]=JSON.stringify(r.data)}return state}
 const before=await snapshot(),saved=await own.client.from('betti_guided_assertions').select('*').eq('action','receipt_availability').limit(1).single();assert(saved.data&&!saved.error)
 const assertion=saved.data,payload={requestId:assertion.id,actionId:'guided:completed',version:'prior',items:assertion.items,answers:assertion.answers,disposition:assertion.disposition}
 const replay=await own.context.request.post(origin+'/api/bookkeeping/work/answer',{data:payload});assert.equal(replay.status(),200)
 const changed=await own.context.request.post(origin+'/api/bookkeeping/work/answer',{data:{...payload,disposition:'deferred'}});assert.equal(changed.status(),409)
 const unseen=await own.context.request.post(origin+'/api/bookkeeping/work/answer',{data:{...payload,requestId:randomUUID(),version:'stale'}});assert.equal(unseen.status(),409)
 const cross=await other.context.request.post(origin+'/api/bookkeeping/work/answer',{data:{...payload,requestId:randomUUID()}});assert.equal(cross.status(),409)
 const direct=await other.client.rpc('answer_betti_guided_work',{p_request:randomUUID(),p_action:assertion.action,p_disposition:'completed',p_items:assertion.items,p_answers:assertion.answers});assert(direct.error)
 assert.deepEqual((await other.client.from('betti_guided_assertions').select('id').eq('business_id',a.businessId)).data,[])
 assert((await other.client.rpc('read_betti_work_context',{p_business_id:a.businessId})).error)
 const directView=await own.client.from('customer_transaction_work').select('record_id,business_id');assert(!directView.error&&directView.data.length);assert(directView.data.every(r=>r.business_id===a.businessId))
 const foreignView=await other.client.from('customer_transaction_work').select('record_id').eq('business_id',a.businessId);assert(!foreignView.error);assert.deepEqual(foreignView.data,[])
 for(const path of['/home','/check-in','/transactions','/reports']){await page.goto(origin+path);assert.equal(new URL(page.url()).pathname,path)}
 for(const path of['/api/bookkeeping/work','/api/bookkeeping/questions','/api/transactions/list?year=all','/api/reports/summary'])assert.equal((await own.context.request.get(origin+path)).status(),200)
 const low=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 assert(!(await low.auth.signInWithPassword({email:a.email,password:a.password})).error)
 const noMfa=await low.rpc('answer_betti_guided_work',{p_request:randomUUID(),p_action:assertion.action,p_disposition:'completed',p_items:assertion.items,p_answers:assertion.answers});assert(noMfa.error,'Mutation accepted without MFA')
 assert.deepEqual(await snapshot(),before,'Read/replay/rejected request mutated canonical facts')
 const surfaces=[]
 for(const f of fixtures){
  const {context}=await session(f,browser),screen=await context.newPage()
  const get=async path=>{const r=await context.request.get(origin+path);assert.equal(r.status(),200);return r.json()}
  const work=await get('/api/bookkeeping/work'),questions=await get('/api/bookkeeping/questions')
  assert.equal(questions.count,work.customer.actionableCount)
  for(const path of ['/home','/check-in']){await screen.goto(origin+path);assert.equal(await screen.locator('[data-customer-action-count]').getAttribute('data-customer-action-count'),String(questions.count))}
  const ledger=await get('/api/transactions/list?year=all'),report=await get('/api/reports/summary?start=2026-01-01&end='+new Date().toISOString().slice(0,10))
  assert.equal(new Set(ledger.rows.map(row=>row.id)).size,ledger.rows.length)
  assert.equal(report.categoryTotals.reduce((sum,row)=>sum+row.amountCents,0)+report.uncategorizedBusinessExpensesCents,report.businessExpensesCents)
  if(f.scenario==='7'){assert.equal(ledger.rows.length,0);assert.equal(work.scope.catchUp,null);assert.equal(work.progress.outsideScopeActivity,24);assert.equal(questions.count,0);assert.equal(report.businessExpensesCents,0);assert.equal(report.businessIncomeCents,0);assert.equal(report.businessProfitCents,0)}
  surfaces.push({scenario:f.scenario,actions:questions.count,activeLedgerRows:ledger.rows.length,expenses:report.businessExpensesCents,scope:work.scope.catchUp?'Catch-up + Current':'Current only'})
  await context.close()
 }
 await writeFile(`${dir}/browser/cross-surfaces.json`,JSON.stringify(surfaces,null,2))
 await writeFile(`${dir}/browser/security.json`,JSON.stringify({tenantIsolation:true,directViewTenantIsolation:true,directRpcTenantIsolation:true,mfaEnforced:true,immutableSnapshotRetry:true,changedRetryRejected:true,staleSnapshotRejected:true,readOnlyRender:true},null,2))
 console.log('Guided snapshot security/idempotency/read-only certification passed')
 await own.context.close();await other.context.close()
}finally{await browser.close()}
