/** REAL HOSTED STAGING: one isolated synthetic requested-loan upload, no customer answers. */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'
const dir='/private/tmp/writeoffs-routing-home-handoff',origin='https://writeoffs-fresh-staging.vercel.app'
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
async function main(){
 process.umask(0o077)
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(process.env.WRITEOFFS_ENVIRONMENT,'staging');assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(`${dir}/fixture.json`,'utf8'))
 assert(!['d785186b-16db-47e5-ab02-e59fd1ae311b','2c0ddbb3-6650-42a4-aafa-3685f7efe288'].includes(f.businessId))
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 const jar=new Map<string,string>(),db=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const before=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
 assert.equal(before.nextAction?.type,'special_transaction');assert.match(before.nextAction?.transaction?.merchant??'',/LOAN/)
 const browser=await chromium.launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce',timezoneId:'America/Phoenix'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
  await context.addInitScript(()=>{const w=window as unknown as {allowed?:boolean;flashed?:boolean};new MutationObserver(()=>{if(!w.allowed&&document.querySelector('#guided-transaction')?.textContent?.includes('REFUND'))w.flashed=true}).observe(document,{subtree:true,childList:true})})
  const page=await context.newPage();await page.goto(origin+'/check-in');await page.getByRole('heading',{name:'Send me the loan statement.',exact:true}).waitFor()
  const started=Date.now(),registration=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/documents')
  await page.getByLabel('Send Betti documents',{exact:true}).setInputFiles('/private/tmp/writeoffs-routing-evidence-first/loan.pdf')
  const received=await registration;assert(received.ok());const receivedMs=Date.now()-started
  await page.locator('[data-document-review]').waitFor();const acknowledgmentMs=Date.now()-started
  await page.screenshot({path:`${dir}/loan-reviewing-390.png`,fullPage:true})
  await page.reload();await page.locator('[data-document-review]').waitFor()
  assert(!await page.evaluate(()=>(window as unknown as {flashed?:boolean}).flashed),'REFRESH_FLASHED_NEXT_QUESTION')
  await page.locator('[data-document-review=ready]').waitFor({timeout:120000});const readyMs=Date.now()-started
  await page.getByText('$400 was principal and $50 was interest.',{exact:true}).waitFor()
  await page.screenshot({path:`${dir}/loan-confirmed-390.png`,fullPage:true})
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:`${dir}/loan-confirmed-1280.png`,fullPage:true})
  assert.equal(await page.getByText('REFUND - OFFICE DEPOT',{exact:true}).count(),0)
  assert(!await page.evaluate(()=>(window as unknown as {flashed?:boolean}).flashed))
  await page.evaluate(()=>{(window as unknown as {allowed:boolean}).allowed=true})
  const advancing=Date.now();await page.getByRole('button',{name:'Continue →',exact:true}).click()
  await page.getByText('REFUND - OFFICE DEPOT',{exact:true}).waitFor();const advanceMs=Date.now()-advancing
  assert.equal(await page.locator('[data-document-review]').count(),0)
  await page.reload();await page.getByText('REFUND - OFFICE DEPOT',{exact:true}).waitFor()
  const report=await getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-24',currency:'USD'})
  const facts=await db.from('bookkeeping_loan_document_facts').select('principal_cents,interest_cents').eq('business_id',f.businessId)
  const answers=await db.from('bookkeeping_review_events').select('id',{count:'exact',head:true}).eq('business_id',f.businessId).eq('event_type','answered')
  const transactions=await db.from('financial_transactions').select('id',{count:'exact',head:true}).eq('business_id',f.businessId)
  assert(!facts.error&&!answers.error&&!transactions.error)
  assert.deepEqual(facts.data,[{principal_cents:40000,interest_cents:5000}]);assert.equal(answers.count,0);assert.equal(transactions.count,24)
  assert.deepEqual([report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents],[210052,147573,62479])
  const result={evidence:'REAL HOSTED STAGING · SYNTHETIC CUSTOMER',passed:true,receivedMs,acknowledgmentMs,readyMs,advanceMs,refreshDuringReview:true,reducedMotion:true,widths:[390,1280],automaticAdvance:false,loanFacts:facts.data,transactions:transactions.count,answers:answers.count,totals:[report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents],nextQuestion:'REFUND - OFFICE DEPOT · Is it for this purchase?'}
  await writeFile(`${dir}/requested-loan-transition.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'CERTIFICATION_FAILED');process.exitCode=1})
