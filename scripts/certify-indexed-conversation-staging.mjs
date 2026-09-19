// Candidate smoke certification. Real UI answers on explicitly synthetic tenants only.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
async function main(){
const origin=process.env.CERTIFICATION_ORIGIN,dir=process.env.CERTIFICATION_ARTIFACT_DIR
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(/^https:\/\/writeoffs-fresh-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))
assert(/^\/private\/tmp\/writeoffs-phase3-[a-z0-9-]+$/.test(dir));assert(process.argv.includes('--measure'))
await mkdir(dir,{recursive:true})
const fixtures=JSON.parse(await readFile(process.env.PERFORMANCE_FIXTURES??'/private/tmp/writeoffs-phase3-final/fixtures.json','utf8'))
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
const browser=await chromium.launch({headless:true}),contexts=[];let customerDb
try{
 const selected=process.env.PERFORMANCE_FIXTURE_INDEX===undefined?fixtures.slice(-1):[fixtures[Number(process.env.PERFORMANCE_FIXTURE_INDEX)]]
 for(const fixture of selected){
  assert.equal((await admin.auth.admin.getUserById(fixture.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
  const jar=new Map(),client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
  assert(!(await client.auth.signInWithPassword({email:fixture.email,password:fixture.password})).error)
  assert(!(await client.auth.mfa.challengeAndVerify({factorId:fixture.factorId,code:totp(fixture.totpSecret)})).error)
  customerDb=client
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
  for(const line of (await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'')).split('\n')){
   if(!line.includes('\t'))continue;const p=line.replace(/^#HttpOnly_/,'').split('\t');if(p[0]===new URL(origin).hostname)await context.addCookies([{domain:p[0],path:p[2],secure:p[3]==='TRUE',name:p[5],value:p[6],httpOnly:true,sameSite:'None'}])
  }
  contexts.push(context)
 }
 const context=contexts[0],page=await context.newPage(),steps=[]
 if(process.argv.includes('--receipt-later')){
  const get=async path=>{const r=await context.request.get(origin+path);assert.equal(r.status(),200);return r.json()}
  const work=await get('/api/bookkeeping/work'),action=work.nextAction;assert.equal(action?.type,'receipt_upload_sweep')
  const raw=await customerDb.rpc('read_betti_work_context',{p_business_id:work.businessId});assert(!raw.error)
  const scoped=data=>data.records.filter(r=>action.recordIds.includes(r.record_id)).map(r=>[r.record_id,r.receipt_unavailable,r.decision_id]).sort()
  const report=await get('/api/reports/summary')
  await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor()
  const timeOrigin=await page.evaluate(()=>performance.timeOrigin)
  await page.evaluate(()=>document.addEventListener('click',()=>{window.__indexedClick=performance.now()},{capture:true,once:true}))
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/')&&!r.url().endsWith('/reconcile'))
  await page.getByRole('button',{name:'I’ll send receipts later',exact:true}).click()
  const r=await response;assert.equal(r.status(),200,await r.text())
  await page.waitForFunction(v=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-version')!==v,action.version)
  const visibleMs=await page.evaluate(()=>performance.now()-window.__indexedClick)
  const after=await customerDb.rpc('read_betti_work_context',{p_business_id:work.businessId});assert(!after.error)
  assert.deepEqual(scoped(after.data),scoped(raw.data),'Later changed receipt availability or working treatment')
  assert(after.data.guidedReviews.some(e=>e.action==='receipt_upload_sweep'&&e.disposition==='deferred'))
  assert.equal((await get('/api/reports/summary')).businessExpensesCents,report.businessExpensesCents)
  let settled;for(let i=0;i<20;i++){settled=await get('/api/bookkeeping/work');if(settled.index?.summaryCurrent)break;await page.waitForTimeout(3000)}
  assert(settled.index?.summaryCurrent,'Derived recovery did not settle within bounded wait')
  assert(!settled.customer.actionable.some(a=>a.id===action.id),'Deferred receipt action stayed ready')
  assert.equal((await get('/api/bookkeeping/questions')).count,settled.customer.actionableCount)
  assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin)
  for(const width of [390,430,1280]){await page.setViewportSize({width,height:900});await page.screenshot({path:dir+`/receipt-later-completion-${width}.png`,fullPage:true})}
  await writeFile(dir+'/receipt-later.json',JSON.stringify({result:'PASS',visibleMs,serverTiming:r.headers()['server-timing'],dbCalls:r.headers()['x-betti-db-calls'],documentationUnchanged:true,expenseUnchanged:true,readiness:settled.readiness,actions:settled.customer.actionableCount,deferred:settled.customer.deferredCount,documentUnchanged:true},null,2))
  console.log('PASS: receipt Later preserved documentation/P&L; normal index recovery settled without navigation')
  return
 }
 if(process.argv.includes('--special-workflows')){
  for(const nature of process.argv.includes('--loan-only')?['LOAN']:['LOAN','REFUND']){
   const initial=await context.request.get(origin+'/api/bookkeeping/work');assert.equal(initial.status(),200)
   const work=await initial.json(),target=work.customer.actionable.find(a=>a.type==='special_transaction'&&a.transaction?.merchant?.includes(nature))
   assert(target,`No ready synthetic ${nature} action; do not bypass a deferral`)
   await page.goto(origin+'/check-in?record='+encodeURIComponent(target.recordIds[0]));await page.locator('[data-guided-action]').waitFor()
   for(let turn=0;turn<(nature==='REFUND'?2:1);turn++){
    const version=await page.locator('[data-guided-action]').getAttribute('data-guided-version')
    let label=/come back to this/i
    if(nature==='REFUND'){
     if(await page.getByRole('button',{name:'Returned by the store',exact:true}).count())label='Returned by the store'
     else{await page.getByRole('radio',{name:/OFFICE DEPOT/}).check();label='Yes, link this return'}
    }
    await page.evaluate(()=>document.addEventListener('click',()=>{window.__indexedClick=performance.now()},{capture:true,once:true}))
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/')&&!r.url().endsWith('/reconcile'))
    await page.getByRole('button',{name:label,exact:typeof label==='string'}).click()
    const r=await response;assert.equal(r.status(),200,await r.text());const body=await r.json();assert.equal(body.work?.index?.version,1)
    await page.waitForFunction(v=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-version')!==v,version)
    steps.push({type:nature==='LOAN'?'loan_deferral':'refund_relationship',visibleMs:await page.evaluate(()=>performance.now()-window.__indexedClick),serverTiming:r.headers()['server-timing'],dbCalls:r.headers()['x-betti-db-calls'],bytes:JSON.stringify(body).length,next:body.work.nextAction?.type??body.work.readiness.phase})
    await writeFile(dir+'/index-special.json',JSON.stringify(steps,null,2));console.log(JSON.stringify(steps.at(-1)))
   }
  }
  return
 }
 await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor({timeout:30000})
 const timeOrigin=await page.evaluate(()=>performance.timeOrigin)
 for(let i=0;i<8;i++){
  const read=await context.request.get(origin+'/api/bookkeeping/work');assert.equal(read.status(),200)
  const work=await read.json();assert.equal(work.index?.version,1,'Candidate must use the index')
  const action=work.nextAction;assert(action)
  assert.equal(await page.locator('[data-guided-action]').getAttribute('data-guided-version'),action.version)
  const label=i%3===0||action.type==='special_transaction'||!(action.question?.transaction.amountCents>0)?/come back to this/i:'Payment from a customer'
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/')&&!r.url().endsWith('/reconcile'))
  const start=performance.now();await page.getByRole('button',{name:label,exact:typeof label==='string'}).click()
  const r=await response,persistedMs=performance.now()-start;assert.equal(r.status(),200,await r.text())
  const body=await r.json();assert.equal(body.work?.index?.version,1);assert(body.work.nextAction,'Independent next action must remain')
  await page.waitForFunction(v=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-version')!==v,action.version)
  const visibleMs=performance.now()-start
  assert.equal(await page.locator('[data-guided-action]').getAttribute('data-guided-version'),body.work.nextAction.version)
  assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin)
  steps.push({type:typeof label==='string'?'answer':'defer',persistedMs,visibleMs,serverTiming:r.headers()['server-timing'],dbCalls:r.headers()['x-betti-db-calls'],proxyMs:r.headers()['x-betti-proxy-ms'],bytes:JSON.stringify(body).length})
  await writeFile(dir+'/index-smoke.json',JSON.stringify(steps,null,2));console.log(JSON.stringify(steps.at(-1)))
 }
 await page.screenshot({path:dir+'/index-smoke.png',fullPage:true})
}finally{for(const c of contexts)await c.close();await browser.close()}
}
main().catch(error=>{console.error(String(error instanceof Error?error.message:error).split('Call log:')[0]);process.exitCode=1})
