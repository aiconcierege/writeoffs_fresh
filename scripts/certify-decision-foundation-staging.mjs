// Dedicated staging only. All mutable browser tests use isolated synthetic tenants.
import assert from 'node:assert/strict'
import{readFile,writeFile,mkdir}from'node:fs/promises'
import{createHmac}from'node:crypto'
import{createServerClient}from'@supabase/ssr'
import{createClient}from'@supabase/supabase-js'
import{chromium}from'@playwright/test'
const origin='https://writeoffs-fresh-staging.vercel.app',dir='/private/tmp/writeoffs-foundation',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
const fixtures=JSON.parse(await readFile(`${dir}/fixtures.json`,'utf8')),admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
for(const f of fixtures){const u=await admin.auth.admin.getUserById(f.userId);assert.equal(u.data.user?.user_metadata.synthetic_foundation,true)}
await mkdir(`${dir}/proof`,{recursive:true})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));return{context,client}}


import {execFileSync} from 'node:child_process'
const browser=await chromium.launch({headless:true}),errors=[];let page,stage='login'
const drain=()=>execFileSync(process.execPath,['--conditions=react-server','--import','tsx','scripts/reassess-decision-foundation-staging.ts'],{env:process.env,stdio:['ignore','ignore','pipe'],timeout:240000})
try {
 const {context,client}=await session(fixtures[0],browser);page=await context.newPage();page.setDefaultTimeout(30000)
 page.on('pageerror',()=>errors.push('pageerror'))
 page.on('response',response=>{if(response.url().includes('/api/bookkeeping/questions/')&&response.request().method()==='POST')
   console.log('Question response',response.status(),response.request().postDataJSON()?.action??'reconcile')})
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 const fixture=merchant=>{const r=fixtures[0].records.find(r=>r.merchant===merchant);assert(r);return r}
 const report=async()=>{const r=await context.request.get(origin+'/api/reports/summary');assert.equal(r.status(),200);return r.json()}
 const questions=async()=>{const r=await context.request.get(origin+'/api/bookkeeping/questions');assert.equal(r.status(),200);return (await r.json()).questions}
 const checkMath=r=>{assert.equal(r.categoryTotals.reduce((s,c)=>s+c.amountCents,0)+r.uncategorizedBusinessExpensesCents,r.businessExpensesCents);assert.equal(r.businessIncomeCents-r.businessExpensesCents,r.businessProfitCents)}
 let r
 if(!process.env.FOUNDATION_FINISH_ONLY) {
 if(!process.env.FOUNDATION_RESUME) {
 stage='early candidate';console.log('Certification: early candidate');await page.goto(origin+`/transactions/${fixture('ADOBE CREATIVE CLOUD').transactionId}`)
 await page.getByText('Likely category',{exact:true}).waitFor();await page.getByText('Software and subscriptions',{exact:true}).waitFor()
 const before=await report();checkMath(before);assert.equal(before.businessExpensesCents,8940)
 // A GET must not append question events.
 const count=async()=>{const r=await client.from('bookkeeping_review_events').select('id',{count:'exact',head:true});assert(!r.error);return r.count}
 const eventsBefore=await count();await questions();await report();assert.equal(await count(),eventsBefore)
 stage='statement account use';console.log('Certification: statement account use');await page.goto(origin+'/check-in')
 await page.getByRole('heading',{name:'How did you use these accounts?'}).waitFor()
 const saved=page.waitForResponse(r=>r.url().includes('/api/bookkeeping/accounts/')&&r.request().method()==='POST')
 await page.getByRole('radio',{name:'Business only',exact:true}).check();assert.equal((await saved).status(),200)
 drain()
 } else {drain()}
 stage='promoted category';console.log('Certification: promoted category');await page.goto(origin+`/transactions/${fixture('ADOBE CREATIVE CLOUD').transactionId}`)
 await page.getByRole('heading',{name:'Category',exact:true}).waitFor();await page.getByText('Software and subscriptions',{exact:true}).waitFor()
 await page.getByText('No receipt attached',{exact:true}).waitFor()
 r=await report();checkMath(r);assert.equal(r.categoryTotals.find(c=>c.categoryKey==='software').amountCents,2299)
 assert.equal(r.categoryTotals.find(c=>c.categoryKey==='office-expense').amountCents,6419)
 let queue=await questions();assert(!queue.some(q=>q.recordId===fixture('ADOBE CREATIVE CLOUD').recordId));assert(!queue.some(q=>q.recordId===fixture('KNOWN RESTAURANT MEAL').recordId))
 stage='customer answer';console.log('Certification: customer answer');await page.goto(origin+`/check-in?record=${fixture('FUN').recordId}`)
 await page.getByRole('heading',{name:'How will you use what you bought?'}).waitFor()
 await page.locator('textarea').fill('Printer paper for office work')
 const answered=page.waitForResponse(r=>r.url().includes('/api/bookkeeping/questions/')&&!r.url().endsWith('/reconcile')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'Continue',exact:true}).click();assert.equal((await answered).status(),200)
 drain();r=await report();checkMath(r);assert.equal(r.categoryTotals.find(c=>c.categoryKey==='office-expense').amountCents,15359)
 const answer=async(merchant,label,nature)=>{await page.goto(origin+`/check-in?record=${fixture(merchant).recordId}`)
  const response=page.waitForResponse(r=>r.url().includes('/api/bookkeeping/questions/')&&!r.url().endsWith('/reconcile')&&r.request().method()==='POST')
  await page.getByRole('button',{name:label,exact:true}).click();assert.equal((await response).status(),200)
  const d=await client.from('bookkeeping_decisions').select('id,supersedes_decision_id,bookkeeping_nature').eq('bookkeeping_record_id',fixture(merchant).recordId)
  assert(!d.error);assert.equal(d.data.find(x=>!d.data.some(y=>y.supersedes_decision_id===x.id)).bookkeeping_nature,nature)}
 stage='money in';console.log('Certification: money in');await answer('ZELLE FROM ROBERT HALL','Payment from a customer','business_income')
 stage='refund';console.log('Certification: refund');await answer('REFUND - OFFICE DEPOT','Refund or reimbursement','refund')
 stage='card payment';console.log('Certification: card payment');await answer('ACH PAYMENT - BUSINESS CREDIT CARD 3333','A credit card payment','credit_card_payment')
 stage='reconcile totals';console.log('Certification: reconcile totals');r=await report();checkMath(r);assert.equal(r.businessIncomeCents,42500)
 stage='receipt unavailable';console.log('Certification: receipt unavailable');await page.goto(origin+'/transactions?view=receipts')
 await page.getByRole('checkbox',{name:/ADOBE/}).check()
 const unavailable=page.waitForResponse(r=>r.url().endsWith('/api/bookkeeping/guided-review')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'I don’t have these receipts',exact:true}).click();assert.equal((await unavailable).status(),200)
 const after=await report();assert.equal(after.businessExpensesCents,r.businessExpensesCents)
 stage='recurring percentage';console.log('Certification: recurring percentage');await page.goto(origin+`/check-in?record=${fixture('VERIZON').recordId}`)
 await page.getByLabel('Business use percentage',{exact:true}).fill('80')
 const percentageSaved=page.waitForResponse(res=>res.url().includes('/api/bookkeeping/questions/')&&res.request().method()==='POST'&&!res.url().endsWith('/reconcile'))
 await page.getByRole('button',{name:'Continue',exact:true}).click();assert.equal((await percentageSaved).status(),200)
 }
 drain();r=await report();checkMath(r);assert.equal(r.categoryTotals.find(c=>c.categoryKey==='utilities').amountCents,11702)
 assert.equal(r.categoryTotals.find(c=>c.categoryKey==='software').amountCents,2299)
 assert.equal(r.categoryTotals.find(c=>c.categoryKey==='office-expense').amountCents,15359)
 assert.equal(r.businessIncomeCents,42500)
 assert(!(await questions()).some(q=>q.recordId===fixture('VERIZON').recordId))
 stage='tax-time readiness';console.log('Certification: tax-time readiness');const pdf=await context.request.get(origin+'/api/reports/tax-time-report?year=2026')
 assert.equal(pdf.status(),409);assert.equal((await pdf.json()).error,'books_not_ready')
 stage='home/report agreement';console.log('Certification: home/report agreement');await page.goto(origin+'/home');for(const cents of [r.businessIncomeCents,r.businessExpensesCents,r.businessProfitCents]) {
  assert((await page.locator('body').innerText()).includes(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)))
 }
 stage='tenant isolation';console.log('Certification: tenant isolation');const other=await session(fixtures[1],browser)
 const denied=await other.context.request.post(origin+`/api/bookkeeping/accounts/${fixtures[0].accountId}/use`,{data:{designation:'business_only',effectiveAt:new Date().toISOString(),requestId:crypto.randomUUID()}});assert(denied.status()>=400)
 const foreign=await other.client.from('current_schedule_c_expense_assessments').select('id').eq('bookkeeping_record_id',fixture('ADOBE CREATIVE CLOUD').recordId);assert(!foreign.error);assert.equal(foreign.data.length,0)
 await other.client.auth.signOut();await other.context.close()
 stage='responsive';console.log('Certification: responsive');for(const width of [390,430,768,1280]){await page.setViewportSize({width,height:900});for(const[path,name]of[['/home','home'],['/reports','reports'],['/reports/tax-time','tax-time'],[`/transactions/${fixture('ADOBE CREATIVE CLOUD').transactionId}`,'software'],[`/check-in?record=${fixture('VERIZON').recordId}`,'percentage'],[`/transactions/${fixture('EQUIPMENT LOAN PAYMENT').transactionId}`,'loan']]){await page.goto(origin+path);await page.waitForTimeout(500);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${dir}/proof/${name}-${width}.png`,fullPage:true})}}
 assert.deepEqual(errors,[])
 await writeFile(`${dir}/proof/results.json`,JSON.stringify({passed:true,candidateBeforeBusiness:true,accountUse:true,answerEnrichment:true,workingMath:true,readOnlyGET:true,refundSafety:true,cardSafety:true,tenantIsolation:true,widths:[390,430,768,1280],browserErrors:0},null,2))
 await client.auth.signOut();await context.close();console.log('Foundation staging browser certification passed.')
} catch(e){if(page)await page.screenshot({path:`${dir}/proof/failure.png`,fullPage:true});console.error(`Foundation certification failed at ${stage}: ${e.message}`);process.exitCode=1}finally{await browser.close()}
