// Dedicated staging only. All mutable browser tests use isolated synthetic tenants.
import assert from 'node:assert/strict'
import{readFile,writeFile,mkdir}from'node:fs/promises'
import{createHmac}from'node:crypto'
import{createServerClient}from'@supabase/ssr'
import{createClient}from'@supabase/supabase-js'
import{chromium}from'@playwright/test'
const origin='https://writeoffs-fresh-staging.vercel.app',dir='/private/tmp/writeoffs-money-in',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
const fixtures=JSON.parse(await readFile(`${dir}/fixtures.json`,'utf8')),admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
for(const f of fixtures){const u=await admin.auth.admin.getUserById(f.userId);assert.equal(u.data.user?.user_metadata.synthetic_money_in,true)}
await mkdir(`${dir}/proof`,{recursive:true})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));return{context,client}}

const browser=await chromium.launch({headless:true}),errors=[];let page,stage='login'
try {
 const {context,client}=await session(fixtures[0],browser);page=await context.newPage();page.setDefaultTimeout(25000)
 page.on('pageerror',()=>errors.push('pageerror'))
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 const fixture=merchant=>{const r=fixtures[0].records.find(r=>r.merchant===merchant);assert(r);return r}
 const current=async merchant=>{const r=fixture(merchant),q=await client.from('bookkeeping_decisions').select('id,bookkeeping_nature,treatment,supersedes_decision_id').eq('bookkeeping_record_id',r.recordId);assert(!q.error);return q.data.find(d=>!q.data.some(n=>n.supersedes_decision_id===d.id))}
 const answer=async(merchant,label,nature,treatment)=>{
  const r=fixture(merchant);await page.goto(origin+`/transactions/${r.transactionId}`)
  assert.equal(await page.getByText('No receipt attached',{exact:true}).count(),0)
  await page.getByRole('link',{name:'Answer Betti’s question →',exact:true}).click()
  await page.getByRole('heading',{name:'What was this money for?'}).waitFor()
  const response=page.waitForResponse(r=>r.url().includes('/api/bookkeeping/questions/')&&r.request().method()==='POST')
  await page.getByRole('button',{name:label,exact:true}).click();assert.equal((await response).status(),200)
  assert.equal((await current(merchant)).bookkeeping_nature,nature);assert.equal((await current(merchant)).treatment,treatment)
 }
 stage='eligibility';const ensured=await client.rpc('ensure_current_money_in_questions');assert(!ensured.error,ensured.error?.message)
 const again=await client.rpc('ensure_current_money_in_questions');assert(!again.error);assert.equal(again.data,0)
 const before=await client.rpc('list_customer_transaction_work',{p_view:'receipts'});assert(!before.error);assert.equal(before.data.length,2);assert(before.data.every(r=>r.amount_cents<0))
 await page.goto(origin+'/transactions?view=receipts');assert.equal(await page.getByRole('link',{name:/Open ZELLE/}).count(),0)
 await page.goto(origin+'/home');assert.equal(Number((await page.locator('dt').filter({hasText:/^Business income$/}).locator('..').locator('dd').innerText()).replace(/[$,]/g,'')),0)
 stage='payment';await answer('ZELLE FROM ROBERT HALL','Payment from a customer','business_income','business')
 stage='transfer';await answer('TRANSFER FROM SAVINGS','Transfer between my accounts','transfer','excluded')
 stage='loan';await answer('LOAN PROCEEDS','Loan proceeds','loan_proceeds','excluded')
 stage='owner';await answer('OWNER FUNDS','Money I added to the business','owner_contribution','excluded')
 stage='refund';await answer('REFUND','Refund or reimbursement','refund','unresolved')
 console.log('Payment, transfer, loan, owner and refund UI answers verified.');stage='totals';for(const path of ['/home','/reports?year=2026']) {await page.goto(origin+path);assert.equal(Number((await page.locator('dt').filter({hasText:/^Business income$/}).locator('..').locator('dd').innerText()).replace(/[$,]/g,'')),425);await page.screenshot({path:`${dir}/proof/${path.startsWith('/home')?'home':'reports'}-income.png`,fullPage:true})}
 console.log('Home and Reports income reconciled.');stage='bulk';await page.goto(origin+'/transactions?view=receipts');await page.getByRole('checkbox',{name:'Select all on this page'}).check()
 assert.equal(await page.getByRole('button',{name:'Remove from business',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:/Continue with/}).count(),0)
 await page.getByRole('button',{name:'Clear selection'}).click();assert.equal(await page.getByRole('button',{name:'I don’t have these receipts',exact:true}).count(),0)
 await page.getByRole('checkbox',{name:'Select all on this page'}).check()
 for(const width of [390,430,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${dir}/proof/bulk-selected-${width}.png`,fullPage:true})}
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/bookkeeping/guided-review')&&r.request().method()==='POST')
 await page.getByRole('button',{name:'I don’t have these receipts',exact:true}).click();const result=await saved;assert.equal(result.status(),200)
 const replay=await context.request.post(origin+'/api/bookkeeping/guided-review',{data:result.request().postDataJSON()});assert.equal(replay.status(),200);assert.deepEqual(await replay.json(),await result.json())
 const evidence=await client.from('bookkeeping_documentation_events').select('id,bookkeeping_record_id,event_type').in('bookkeeping_record_id',['OFFICE DEPOT','PAPER STORE'].map(name=>fixture(name).recordId)).eq('event_type','receipt_lost');assert(!evidence.error);assert.equal(evidence.data.length,2)
 const after=await client.rpc('list_customer_transaction_work',{p_view:'receipts'});assert(!after.error);assert.equal(after.data.length,0)
 for(const merchant of ['OFFICE DEPOT','PAPER STORE']){assert.equal((await current(merchant)).id,fixture(merchant).decisionId)}
 stage='security';const other=await session(fixtures[1],browser)
 const denied=await other.context.request.post(origin+'/api/bookkeeping/guided-review',{data:{...result.request().postDataJSON(),requestId:crypto.randomUUID()}});assert(denied.status()>=400)
 const remaining=await context.request.get(origin+'/api/bookkeeping/questions');const stripe=(await remaining.json()).questions.find(q=>q.recordId===fixture('STRIPE PAYOUT').recordId);assert(stripe);const deniedAnswer=await other.context.request.post(origin+`/api/bookkeeping/questions/${stripe.id}`,{headers:{'if-match':stripe.version},data:{action:'transaction_type',activity:'earned_money'}});assert(deniedAnswer.status()>=400);
 const foreign=await other.client.from('customer_transaction_work').select('record_id').eq('record_id',fixture('ZELLE FROM ROBERT HALL').recordId);assert(!foreign.error);assert.equal(foreign.data.length,0)
 await other.client.auth.signOut();await other.context.close()
 stage='responsive';for(const width of[390,430,1280]){await page.setViewportSize({width,height:900});for(const[path,name]of[['/transactions?view=receipts','receipts'],[`/transactions/${fixture('STRIPE PAYOUT').transactionId}`,'incoming'],[`/check-in?record=${fixture('STRIPE PAYOUT').recordId}`,'question'],['/home','home']]){await page.goto(origin+path);await page.waitForTimeout(400);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${dir}/proof/${name}-${width}.png`,fullPage:true})}}
 assert.deepEqual(errors,[])
 await writeFile(`${dir}/proof/results.json`,JSON.stringify({passed:true,moneyInExcluded:true,paymentIncome425:true,transferOwnerLoanNoPL:true,refundUnresolved:true,bulkUnavailableIdempotent:true,tenantIsolation:true,widths:[390,430,1280],browserErrors:0},null,2))
 await client.auth.signOut();await context.close();console.log('Money-in staging browser certification passed.')
} catch(e) {if(page)await page.screenshot({path:`${dir}/proof/failure.png`,fullPage:true});console.error(`Money-in certification failed at ${stage}: ${e.message}`);process.exitCode=1} finally {await browser.close()}
