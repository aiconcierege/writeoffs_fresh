// Real dedicated-staging scope contract. Only explicitly marked isolated tenants are mutable.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac,randomUUID} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {createCanvas} from '@napi-rs/canvas'
const origin=process.env.CERTIFICATION_ORIGIN??'https://writeoffs-fresh-staging.vercel.app'
assert(/^https:\/\/writeoffs-fresh-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))
const reportThrough=new Date().toISOString().slice(0,10)
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dir=process.env.CERTIFICATION_ARTIFACT_DIR??'/private/tmp/writeoffs-phase3-corrections',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(/^\/private\/tmp\/writeoffs-phase3(?:-[a-z0-9-]+)?$/.test(dir))
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'),'Explicit certification flag required')
await mkdir(`${dir}/browser`,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));const jar=await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'');for(const line of jar.split('\n')){if(!line.includes('\t'))continue;const parts=line.replace(/^#HttpOnly_/,'').split('\t');if(parts[0]===new URL(origin).hostname)await context.addCookies([{domain:parts[0],path:parts[2],secure:parts[3]==='TRUE',name:parts[5],value:parts[6],httpOnly:true,sameSite:'None'}])}return{context,client}}

let fixtures=await readFile(`${dir}/fixtures.json`,'utf8').then(JSON.parse).catch(()=>[])
for(const scenario of ['1']){
 if(fixtures.some(f=>f.scenario===scenario))continue
 const nonce=randomUUID(),email=`guided-contract-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_guided_contract:true}});assert(!made.error&&made.data.user)
 const userId=made.data.user.id,customer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 assert(!(await customer.auth.signInWithPassword({email,password})).error)
 const b=await customer.from('businesses').select('id').single();assert(b.data);const businessId=b.data.id
 assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:new Date(Date.now()-86400000).toISOString(),p_ends_at:null,p_request_key:`guided-contract:${nonce}`,p_reason:'Isolated scope integration certification',p_provenance:'admin',p_actor_user_id:null})).error)
 const enrolled=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:'Scope proof'});assert(enrolled.data&&!enrolled.error)
 const totpSecret=enrolled.data.totp.secret,factorId=enrolled.data.id
 assert(!(await customer.auth.mfa.challengeAndVerify({factorId,code:totp(totpSecret)})).error)
 fixtures.push({scenario,userId,businessId,email,password,factorId,totpSecret})
 await writeFile(`${dir}/fixtures.json`,JSON.stringify(fixtures),{mode:0o600});await customer.auth.signOut()
}
async function statement(name,from,through,rows){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
 for(let n=0;n<2;n++){
  const p=pdf.addPage([612,792]),put=(text,x,y)=>p.drawText(text,{x,y,size:10,font})
  put('Scope Certification Bank',40,750);put('Checking Statement',40,730);put('Account ending 1234',40,710)
  put(`Statement period: ${from} - ${through}`,40,690)
  put('Date',40,650);put('Description',110,650);put('Credits',350,650);put('Debits',450,650)
  rows.filter((_,i)=>i%2===n).forEach(([date,description,cents],i)=>{const y=620-i*25;put(date,40,y);put(description,110,y);put('$'+(Math.abs(cents)/100).toFixed(2),cents>0?350:450,y)})
  put(`Page ${n+1} - SYNTHETIC CERTIFICATION`,40,40)
 }
 await writeFile(`${dir}/${name}.pdf`,await pdf.save())
}
await statement('august','August 1, 2026','August 31, 2026',[['08/03','ADOBE CREATIVE CLOUD',-2299],['08/12','OFFICE DEPOT',-6419]])
await statement('mixed','July 1, 2026','August 31, 2026',[['07/10','ADOBE CREATIVE CLOUD',-2299],['08/14','GOOGLE WORKSPACE',-1800]])
await statement('may-small','May 1, 2026','May 31, 2026',[['05/03','ADOBE CREATIVE CLOUD',-2299],['05/12','OFFICE DEPOT',-6419]])
await statement('september','September 1, 2026','September 30, 2026',[[today.slice(5,10).replace('-','/'),'GOOGLE WORKSPACE',-1800],[today.slice(5,10).replace('-','/'),'OFFICE DEPOT',-6419]])
const canvas=createCanvas(760,900),ink=canvas.getContext('2d');ink.fillStyle='white';ink.fillRect(0,0,760,900);ink.fillStyle='black';ink.font='bold 36px Arial'
ink.fillText("McDonald's Restaurant",35,90);ink.font='28px Arial'
;['09/08/2026 08:30 AM','Sausage McMuffin       $4.00','Hash Brown             $2.54','Medium Coffee          $3.00','TOTAL                  $9.54','VISA ending 1234','SYNTHETIC TEST RECEIPT'].forEach((line,i)=>ink.fillText(line,35,170+i*85))
await writeFile(`${dir}/food.png`,canvas.toBuffer('image/png'))

const browser=await chromium.launch({headless:true});const save=()=>writeFile(`${dir}/fixtures.json`,JSON.stringify(fixtures),{mode:0o600});
async function api(context,path){for(let attempt=0;attempt<3;attempt++){const r=await context.request.get(origin+path);if(r.status()===503&&attempt<2){await new Promise(resolve=>setTimeout(resolve,500));continue}assert.equal(r.status(),200,`${path}: ${r.status()}`);return r.json()}}
async function onboard(f,page){
 const b=await admin.from('businesses').select('onboarding_state').eq('id',f.businessId).single()
 if(b.data.onboarding_state==='completed')return
 await page.goto(origin+'/onboarding');await page.getByLabel(/Business name/).fill('Scope Contract Studio '+f.scenario)
 await page.getByLabel('What does your business do?',{exact:true}).fill('Independent design consulting for small businesses.')
 const next=()=>page.getByRole('button',{name:'Continue',exact:true}).click()
 await next();await page.getByRole('radio',{name:/With my personal tax return/}).check();await next()
 await page.getByRole('radio',{name:'This business already exists',exact:true}).check();await page.getByLabel('When did the business start?',{exact:true}).fill('2022-03');await next()
 await page.getByRole('group',{name:'Customer-job materials',exact:true}).getByRole('radio',{name:'No',exact:true}).check()
 await page.getByRole('group',{name:'Products kept for future sale',exact:true}).getByRole('radio',{name:'No',exact:true}).check();await next()
 await page.getByRole('radio',{name:'Start with last month',exact:true}).check();await page.getByText('No catch-up charge.',{exact:true}).waitFor();await next()
 await page.getByRole('radio',{name:/Send Betti documents/}).check();await next();await page.getByRole('button',{name:'Start using WriteOffs',exact:true}).click()
 await page.waitForURL('**/home',{timeout:60000})
}
async function upload(f,page,context,file){
 f.documents??={};if(f.documents[file])return f.documents[file]
 await page.goto(origin+'/import')
 const registered=page.waitForResponse(r=>r.url()===origin+'/api/documents'&&r.request().method()==='POST')
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(file)
 await page.getByRole('progressbar').waitFor({state:'visible',timeout:10000})
 const r=await registered;assert.equal(r.status(),200);const id=(await r.json()).document.id
 f.documents[file]=id;await save()
 const states=[],observer=f.scenario==='F'?await context.newPage():null
 for(let n=0;n<100;n++){
  const docs=await api(context,'/api/documents'),doc=docs.documents.find(d=>d.id===id)
  const work=await api(context,'/api/bookkeeping/work');states.push({document:doc?.state,phase:work.readiness.phase,actions:work.customer.actionableCount,processing:work.betti.genuinelyProcessing})
  if(observer){
   const queue=await api(context,'/api/bookkeeping/questions');await observer.goto(origin+'/home')
   const after=await api(context,'/api/bookkeeping/work')
   if(work.readiness.phase===after.readiness.phase&&JSON.stringify(work.customer.actionable)===JSON.stringify(after.customer.actionable)){
    assert.equal(queue.count,work.customer.actionableCount)
    assert.equal(await observer.locator('[data-customer-action-count]').getAttribute('data-customer-action-count'),String(queue.count))
    if(['received','processing'].includes(work.readiness.phase))assert(!(await observer.locator('main').innerText()).includes('done for now'))
   }
   await observer.screenshot({path:`${dir}/browser/F-transition-${n}.png`,fullPage:true})
  }

  if(doc&&!['pending','processing','retryable'].includes(doc.state)){assert.equal(doc.state,'completed',JSON.stringify(doc));break}
  await page.waitForTimeout(2000)
 }
 if(observer)await observer.close()
 await writeFile(`${dir}/browser/${f.scenario}-${id}-transitions.json`,JSON.stringify(states,null,2))
 return id
}
async function settled(context,page){
 let w
 const initial=await api(context,'/api/bookkeeping/work');console.log('Observed pending work:',initial.betti.jobs.length)
 if(process.argv.includes('--verify-only')){assert.equal(initial.betti.jobs.length,0);return initial}
 if(!process.argv.includes('--baseline')){const upgrade=await admin.rpc('enqueue_economic_evidence_reassessment',{p_limit:100,p_business_id:initial.businessId});assert(!upgrade.error);console.log('Versioned jobs scheduled:',upgrade.data)}
 const scheduled=await admin.rpc('enqueue_authorized_scope_processing_batch',{p_limit:12,p_business_id:initial.businessId});assert(!scheduled.error);console.log('Scope jobs scheduled:',scheduled.data)
 for(let n=0;n<100;n++){w=await api(context,'/api/bookkeeping/work');if(w.betti.jobs.length===0)return w;if(n%10===0)console.log('Pending jobs:',w.betti.jobs.length);await page.waitForTimeout(2000)}
 assert.fail('Normal workers did not settle: '+JSON.stringify(w.betti.jobs))
}
await statement('current-boundary','September 1, 2026','September 30, 2026',[[reportThrough.slice(5,10).replace('-','/'),'GOOGLE WORKSPACE',-1800],[reportThrough.slice(5,10).replace('-','/'),'OFFICE DEPOT',-6419]])
await statement('mixed-use','August 1, 2026','August 31, 2026',[['08/03','ADOBE CREATIVE CLOUD',-20000],['08/12','OFFICE DEPOT',-10000],['08/14','GOOGLE WORKSPACE',-7500]])
await statement('current-phone','September 1, 2026','September 30, 2026',[[today.slice(5,10).replace('-','/'),'VERIZON WIRELESS',-14628]])
const paper=createCanvas(800,650),pen=paper.getContext('2d');pen.fillStyle='white';pen.fillRect(0,0,800,650);pen.fillStyle='black';pen.font='32px Arial';['OFFICE DEPOT','Receipt 05/12/2026','Printer paper       $64.19','TOTAL               $64.19','VISA ending 1234','SYNTHETIC CERTIFICATION'].forEach((line,i)=>pen.fillText(line,40,80+i*85));await writeFile(`${dir}/office.png`,paper.toBuffer('image/png'))
pen.fillStyle='white';pen.fillRect(0,0,800,650);pen.fillStyle='black';['OFFICE DEPOT','Receipt 08/12/2026','Printer paper       $100.00','TOTAL               $100.00','VISA ending 1234','SYNTHETIC CERTIFICATION'].forEach((line,i)=>pen.fillText(line,40,80+i*85));await writeFile(`${dir}/office-mixed.png`,paper.toBuffer('image/png'))
async function screenshot(page,name){
 await page.getByText('Getting the payment details…',{exact:true}).waitFor({state:'hidden',timeout:45000})
 for(const width of [390,430,768,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));await page.waitForFunction(()=>scrollY===0);await page.screenshot({path:`${dir}/browser/${name}-${width}.png`,fullPage:true,animations:'disabled'})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+name+' '+width)
 }
 await page.setViewportSize({width:1280,height:900})
}
async function cross(context,page){
 const w=await api(context,'/api/bookkeeping/work'),q=await api(context,'/api/bookkeeping/questions')
 assert.equal(q.count,w.customer.actionableCount)
 await page.waitForFunction(count=>document.querySelector('[data-customer-action-count]')?.getAttribute('data-customer-action-count')===String(count),w.customer.actionableCount,{timeout:15000})
 const ledger=await api(context,'/api/transactions/list?year=all');assert.equal(new Set(ledger.rows.map(r=>r.id)).size,ledger.rows.length)
 const beforeReport=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
 const home=await context.newPage();await home.goto(origin+'/home');const after=await api(context,'/api/bookkeeping/work')
 if(JSON.stringify(w.customer.actionable)===JSON.stringify(after.customer.actionable))assert.equal(await home.locator('[data-customer-action-count]').getAttribute('data-customer-action-count'),String(w.customer.actionableCount))
 const report=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
 assert.equal(report.categoryTotals.reduce((n,c)=>n+c.amountCents,0)+report.uncategorizedBusinessExpensesCents,report.businessExpensesCents)
 assert.equal(report.businessIncomeCents-report.businessExpensesCents,report.businessProfitCents)
 const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
 for(const [selector,field]of[['income','businessIncomeCents'],['spent','businessExpensesCents'],['profit','businessProfitCents']]){
  // Workers may advance books between HTTP responses; compare only a stable financial snapshot.
  if(beforeReport[field]===report[field])assert.equal(await home.locator(`.home-financial-${selector} dd`).innerText(),money(report[field]))
 }
 await home.close();return{w,report}
}
async function clickSave(page,label){const response=page.waitForResponse(r=>r.request().method()==='POST'&&(r.url().includes('/api/bookkeeping/')&&!r.url().endsWith('/reconcile')));await page.getByRole('button',{name:label,exact:!['Business only','Business + personal'].includes(label)}).click();const r=await response;if(r.status()===409){const error=new Error('Canonical snapshot changed');error.staleSnapshot=true;throw error}assert.equal(r.status(),200,await r.text());await page.waitForTimeout(500)}
try {
 const f=fixtures[0];assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
 const {context,client}=await session(f,browser),page=await context.newPage()
 if(process.argv.includes('--inspect-existing')){
  const inspected=await api(context,'/api/bookkeeping/work')
  await writeFile(`${dir}/inspection.json`,JSON.stringify(inspected,null,2))
  console.log('Next action:',inspected.nextAction?.id,inspected.nextAction?.question?.transaction.merchant,inspected.nextAction?.transaction?.merchant)
  await context.close();await browser.close();process.exit(0)
 }
 if(process.argv.includes('--finish-existing')){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500)errors.push('HTTP '+r.status()+' '+new URL(r.url()).pathname)})
  await page.goto(origin+'/check-in');const final=await cross(context,page);assert.equal(final.w.customer.actionableCount,0)
  assert.equal((await client.from('financial_account_use_events').select('id')).data.length,1)
  await screenshot(page,'genuine-completion')
  const ledger=await api(context,'/api/transactions/list?year=all');assert.equal(ledger.rows.length,24)
  await page.goto(origin+'/transactions');assert(!(await page.locator('main').first().innerText()).includes('Financial activity'));await screenshot(page,'transactions-cleanup');assert.deepEqual(errors,[])
  await writeFile(`${dir}/final-verification.json`,JSON.stringify({result:'PASS',finalActions:final.w.customer.actionableCount,deferred:final.w.customer.deferredCount,incomeCents:final.report.businessIncomeCents,expenseCents:final.report.businessExpensesCents,profitCents:final.report.businessProfitCents,rows:ledger.rows.length,browserErrors:errors},null,2))
  await context.close();await browser.close();process.exit(0)
 }
 console.log("Authenticated isolated customer");await onboard(f,page);console.log("Onboarding already complete or completed")
 if(!f.authorized){
  assert(!(await admin.from('business_customer_setup').update({grandfathered_start_date:'2026-01-01'}).eq('business_id',f.businessId)).error)
  assert.equal((await context.request.post(origin+'/api/onboarding/catch-up',{data:{startMonth:'2026-01',agreed:true,expectedTotalCents:0}})).status(),200)
  f.authorized=true;await save()
 }
 await upload(f,page,context,'/private/tmp/writeoffs-unified-documents/checking.pdf')
 if(process.argv.includes('--continuity')){
  await statement('current-continuity','September 1, 2026','September 30, 2026',[[today.slice(5,10).replace('-','/'),'ACH DEPOSIT UNIDENTIFIED',97500]])
  await upload(f,page,context,`${dir}/current-continuity.pdf`)
  if(process.argv.includes('--continuity-followup')){
   const day=today.slice(5,10).replace('-','/')
   await statement('continuity-specials','September 1, 2026','September 30, 2026',[[day,'OFFICE DEPOT',-6419],[day,'REFUND - OFFICE DEPOT',3210],[day,'LOAN PAYMENT - EQUIPMENT FINANCE CO',-45000]])
   await upload(f,page,context,`${dir}/continuity-specials.pdf`)
  }
  if(process.argv.includes('--prepare-only')){await context.close();await browser.close();process.exit(0)}
  // Preparation only: avoid demanding a stable projection during initial worker churn.
  for(let n=0;n<120;n++){
   const jobs=await admin.from('bookkeeping_processing_jobs').select('state').eq('business_id',f.businessId).neq('state','completed')
   assert(!jobs.error);if(!jobs.data.length)break
   if(n%12===0)console.log('Initial synthetic jobs remaining:',jobs.data.length)
   assert(n<119,'Initial workers did not settle');await page.waitForTimeout(5000)
  }
  const {certifyContinuity}=await import('./lib/certify-guided-continuity.mjs')
  await certifyContinuity({page,context,client,api,screenshot,cross,origin,dir,businessId:f.businessId})
  await context.close();await browser.close();process.exit(0)
 }
 console.log('Waiting for canonical assessments');await settled(context,page);console.log('Assessments settled');await page.goto(origin+'/check-in')
 let w=await api(context,'/api/bookkeeping/work')
 if(w.nextAction?.type==='account_use'){await clickSave(page,'Business only');const pending=await api(context,'/api/bookkeeping/work');if(pending.betti.jobs.length){await page.reload();await screenshot(page,'processing-transition')}await settled(context,page);await page.reload()}
 w=await api(context,'/api/bookkeeping/work')
 const ledger=await api(context,'/api/transactions/list?year=all');assert.equal(ledger.rows.length,24)
 const raw=await client.rpc('read_betti_work_context',{p_business_id:f.businessId});assert(!raw.error)
 const report=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
 const questions=await api(context,'/api/bookkeeping/questions')
 const name=process.argv.includes('--baseline')?'baseline':'after'
 await writeFile(`${dir}/${name}.json`,JSON.stringify({work:w,ledger,context:raw.data,report,questions},null,2),{mode:0o600})
 await page.reload();await screenshot(page,name+'-before-cross');console.log('Guided page:',new URL(page.url()).pathname);await cross(context,page);await screenshot(page,name)
 console.log(name+': '+ledger.rows.length+' transactions; '+w.customer.actionableCount+' customer actions')
 if(process.argv.includes('--flow')){
  const rows=raw.data.records,find=text=>rows.find(r=>r.merchant===text)
  assert.equal(find('ACH CREDIT - CLIENT PAYMENT').bookkeeping_nature,'business_income')
  assert.equal(report.businessIncomeCents,210000)
  for(const merchant of ['TRANSFER FROM SAVINGS 1111','TRANSFER TO SAVINGS 1111','ACH PAYMENT - BUSINESS CREDIT CARD 3333'])assert.equal(find(merchant).treatment,'excluded')
  assert.equal(find('LOAN PAYMENT - EQUIPMENT FINANCE CO').treatment,'unresolved')
  assert.equal(find('REFUND - OFFICE DEPOT').treatment,'unresolved')
  if(process.argv.includes('--refresh-recovery')){
   const before=await client.rpc('read_betti_work_context',{p_business_id:f.businessId});assert(!before.error)
   let injected=false
   await page.route('**/api/bookkeeping/work*',async route=>{if(!injected){injected=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic transient read failure'})})}else await route.continue()})
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await page.locator('.betti-error').waitFor({state:'visible'})
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await page.locator('.betti-error').waitFor({state:'hidden',timeout:45000})
   await page.unroute('**/api/bookkeeping/work*');assert(injected)
   const after=await client.rpc('read_betti_work_context',{p_business_id:f.businessId});assert(!after.error)
   assert.deepEqual(after.data.guidedReviews,before.data.guidedReviews,'Read recovery changed customer assertions')
   console.log('Transient read recovery: PASS without customer mutation')
  }
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=500)errors.push('HTTP '+r.status()+' '+new URL(r.url()).pathname)})
  const seen=new Set(),captures=new Set(),steps=[];let count=0,later=false,confirmed=false,processing=false,fifth=false
  for(let turn=0;turn<70;turn++){
   const state=await api(context,'/api/bookkeeping/work'),action=state.nextAction
   await page.locator('.betti-error').waitFor({state:'hidden',timeout:45000})
   const deferredRecords=new Set(state.customer.deferred.filter(a=>a.type==='material_question').flatMap(a=>a.recordIds))
   assert(!state.customer.actionable.some(a=>a.question?.kind==='transaction_type'&&a.recordIds.some(id=>deferredRecords.has(id))),'A deferred material fact reappeared through another question identity')
   assert.equal(await page.getByRole('button',{name:'Keep going with Betti',exact:true}).count(),0,'Artificial session interruption returned')
   if(!action){
    if(state.betti.jobs.length){await page.reload();await screenshot(page,'processing-transition');processing=true;await settled(context,page);await page.reload();continue}
    await page.reload();await screenshot(page,'genuine-completion');break
   }
   if(await page.locator('[data-guided-action]').getAttribute('data-guided-action')!==action.type||await page.locator('[data-guided-version]').getAttribute('data-guided-version')!==action.version){await page.reload();continue}
   if(count===0||count===5||action.items)await cross(context,page)
   if(count===5&&!fifth){await screenshot(page,'uninterrupted-after-fifth');fifth=true}
   const key=action.id+':'+action.version;assert(!seen.has(key),'A handled/deferred action looped');seen.add(key)
   try {
   if(action.type==='personal_exception_sweep'){await screenshot(page,'personal-exceptions');await clickSave(page,'Nothing here is personal')}
   else if(action.type==='mixed_use_sweep'){await screenshot(page,'mixed-exceptions');await clickSave(page,'Nothing is partly personal')}
   else if(action.type==='receipt_upload_sweep'){
    await screenshot(page,'receipts-with-later')
    assert(await page.getByRole('button',{name:'I’ll send receipts later',exact:true}).isVisible())
    if(process.argv.includes('--receipts-complete'))await clickSave(page,'Continue with Betti')
    else {
     const before=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
     await clickSave(page,'I’ll send receipts later')
     const after=await client.rpc('read_betti_work_context',{p_business_id:f.businessId});assert(!after.error)
     for(const item of action.items){const record=after.data.records.find(r=>r.record_id===item.recordId);assert(!record.receipt_unavailable);assert.equal(record.decision_id,item.decisionId)}
     const history=after.data.guidedReviews.filter(e=>e.action==='receipt_upload_sweep'&&e.disposition==='deferred');assert(history.length)
     const afterReport=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough);assert.equal(afterReport.businessExpensesCents,before.businessExpensesCents)
     later=true
    }
   }else if(action.type==='receipt_availability'){
    assert(process.argv.includes('--receipts-complete'))
    const before=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
    await screenshot(page,'receipt-confirmation');await clickSave(page,'That’s all the receipts I have')
    const after=await client.rpc('read_betti_work_context',{p_business_id:f.businessId});assert(!after.error)
    for(const item of action.items)assert(after.data.records.find(r=>r.record_id===item.recordId).receipt_unavailable)
    const visible=new Set(action.recordIds)
    for(const record of after.data.records.filter(r=>!visible.has(r.record_id)))assert.equal(record.receipt_unavailable,raw.data.records.find(r=>r.record_id===record.record_id).receipt_unavailable)
    assert.equal((await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)).businessExpensesCents,before.businessExpensesCents)
    confirmed=true
   }else if(action.question?.kind==='percentage'){
    await screenshot(page,'individual-merchant-question');await page.getByLabel('Business use percentage',{exact:true}).fill('80');await clickSave(page,'Continue')
    const pending=await api(context,'/api/bookkeeping/work')
    if(pending.betti.jobs.some(j=>j.recordIds.includes(action.recordIds[0]))){
     await page.goto(origin+'/check-in?record='+action.recordIds[0]);await screenshot(page,'processing-transition');processing=true
     console.log('Waiting for canonical assessments');await settled(context,page);console.log('Assessments settled');await page.goto(origin+'/check-in')
    }
   }else if(process.argv.includes('--receipts-complete')&&action.transaction?.merchant==='REFUND - OFFICE DEPOT'){
    const before=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
    if(await page.getByRole('button',{name:'Returned by the store',exact:true}).count())await clickSave(page,'Returned by the store')
    await page.getByRole('radio',{name:/OFFICE DEPOT/}).check()
    await clickSave(page,'Yes, link this return')
    const linked=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
    assert.equal(linked.businessIncomeCents,before.businessIncomeCents)
    assert.equal(linked.businessExpensesCents,before.businessExpensesCents-3210)
    assert.equal((await api(context,'/api/transactions/list?year=all')).rows.length,24)
   }else{
    const capture=action.type==='special_transaction'?'special-evidence-question':'individual-question';if(!captures.has(capture)){await screenshot(page,capture);captures.add(capture)}
    await page.getByRole('button',{name:/come back to this/i}).waitFor();await clickSave(page,await page.getByRole('button',{name:/come back to this/i}).innerText())
   }
   } catch(error){if(error.staleSnapshot){seen.delete(key);console.log('Canonical stale snapshot rejected; refresh and retry current action');await page.reload();continue}throw error}
   steps.push({type:action.type,merchant:action.question?.transaction.merchant??action.transaction?.merchant??null});count++;console.log('Guided action completed:',count,action.type)
   await page.waitForTimeout(700)
  }
  const final=await cross(context,page);assert.equal(final.w.customer.actionableCount,0)
  if(!process.argv.includes('--resume-existing'))assert(fifth,'The fifth-action continuation was not exercised')
  assert(later||confirmed||(process.argv.includes('--resume-existing')&&raw.data.guidedReviews.some(e=>['receipt_upload_sweep','receipt_availability'].includes(e.action))),'Receipt semantics were not exercised')
  assert.equal((await client.from('financial_account_use_events').select('id')).data.length,1)
  await page.goto(origin+'/transactions');assert(!(await page.locator('main').first().innerText()).includes('Financial activity'))
  await screenshot(page,'transactions-cleanup');assert.deepEqual(errors,[])
  await writeFile(`${dir}/flow.json`,JSON.stringify({result:'PASS',steps,count,later,confirmed,processing,fifth,finalActions:final.w.customer.actionableCount,deferred:final.w.customer.deferredCount,incomeCents:final.report.businessIncomeCents,expenseCents:final.report.businessExpensesCents},null,2))
 }
 await context.close()
} catch(e){console.error(e instanceof Error?e.message.split('Call log:')[0]:'Certification failed');process.exitCode=1}
finally{await browser.close()}
