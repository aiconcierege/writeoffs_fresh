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
const dir=process.env.CERTIFICATION_ARTIFACT_DIR??'/private/tmp/writeoffs-phase3',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(/^\/private\/tmp\/writeoffs-phase3(?:-[a-z0-9-]+)?$/.test(dir))
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'),'Explicit certification flag required')
await mkdir(`${dir}/browser`,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));const jar=await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'');for(const line of jar.split('\n')){if(!line.includes('\t'))continue;const parts=line.replace(/^#HttpOnly_/,'').split('\t');if(parts[0]===new URL(origin).hostname)await context.addCookies([{domain:parts[0],path:parts[2],secure:parts[3]==='TRUE',name:parts[5],value:parts[6],httpOnly:true,sameSite:'None'}])}return{context,client}}

let fixtures=await readFile(`${dir}/fixtures.json`,'utf8').then(JSON.parse).catch(()=>[])
const selectedScenarios=(process.env.CERTIFICATION_SCENARIOS??'1,2,3,4,6,7').split(',')
assert(selectedScenarios.length&&selectedScenarios.every(s=>['1','2','3','4','6','7'].includes(s)))
for(const scenario of selectedScenarios){
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
 const initial=await api(context,'/api/bookkeeping/work')
 if(process.argv.includes('--verify-only')){assert.equal(initial.betti.jobs.length,0);return initial}
 const scheduled=await admin.rpc('enqueue_authorized_scope_processing_batch',{p_limit:12,p_business_id:initial.businessId});assert(!scheduled.error)
 for(let n=0;n<100;n++){w=await api(context,'/api/bookkeeping/work');if(w.betti.jobs.length===0)return w;await page.waitForTimeout(2000)}
 assert.fail('Normal workers did not settle: '+JSON.stringify(w.betti.jobs))
}
await statement('current-boundary','September 1, 2026','September 30, 2026',[[reportThrough.slice(5,10).replace('-','/'),'GOOGLE WORKSPACE',-1800],[reportThrough.slice(5,10).replace('-','/'),'OFFICE DEPOT',-6419]])
await statement('mixed-use','August 1, 2026','August 31, 2026',[['08/03','ADOBE CREATIVE CLOUD',-20000],['08/12','OFFICE DEPOT',-10000],['08/14','GOOGLE WORKSPACE',-7500]])
await statement('current-phone','September 1, 2026','September 30, 2026',[[today.slice(5,10).replace('-','/'),'VERIZON WIRELESS',-14628]])
const paper=createCanvas(800,650),pen=paper.getContext('2d');pen.fillStyle='white';pen.fillRect(0,0,800,650);pen.fillStyle='black';pen.font='32px Arial';['OFFICE DEPOT','Receipt 05/12/2026','Printer paper       $64.19','TOTAL               $64.19','VISA ending 1234','SYNTHETIC CERTIFICATION'].forEach((line,i)=>pen.fillText(line,40,80+i*85));await writeFile(`${dir}/office.png`,paper.toBuffer('image/png'))
pen.fillStyle='white';pen.fillRect(0,0,800,650);pen.fillStyle='black';['OFFICE DEPOT','Receipt 08/12/2026','Printer paper       $100.00','TOTAL               $100.00','VISA ending 1234','SYNTHETIC CERTIFICATION'].forEach((line,i)=>pen.fillText(line,40,80+i*85));await writeFile(`${dir}/office-mixed.png`,paper.toBuffer('image/png'))
const results=await readFile(`${dir}/browser/results.json`,'utf8').then(JSON.parse).catch(()=>[])
async function screenshot(page,name){
 for(const width of [390,430,768,1280]){
  await page.setViewportSize({width,height:900});await page.screenshot({path:`${dir}/browser/${name}-${width}.png`,fullPage:true,animations:'disabled'})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+name+' '+width)
 }
 await page.setViewportSize({width:1280,height:900})
}
async function cross(context,page){
 const w=await api(context,'/api/bookkeeping/work'),q=await api(context,'/api/bookkeeping/questions')
 assert.equal(q.count,w.customer.actionableCount)
 await page.waitForFunction(count=>document.querySelector('[data-customer-action-count]')?.getAttribute('data-customer-action-count')===String(count),w.customer.actionableCount,{timeout:15000})
 const ledger=await api(context,'/api/transactions/list?year=all');assert.equal(new Set(ledger.rows.map(r=>r.id)).size,ledger.rows.length)
 const home=await context.newPage();await home.goto(origin+'/home');const after=await api(context,'/api/bookkeeping/work')
 if(JSON.stringify(w.customer.actionable)===JSON.stringify(after.customer.actionable))assert.equal(await home.locator('[data-customer-action-count]').getAttribute('data-customer-action-count'),String(w.customer.actionableCount))
 const report=await api(context,'/api/reports/summary?start=2026-01-01&end='+reportThrough)
 assert.equal(report.categoryTotals.reduce((n,c)=>n+c.amountCents,0)+report.uncategorizedBusinessExpensesCents,report.businessExpensesCents)
 assert.equal(report.businessIncomeCents-report.businessExpensesCents,report.businessProfitCents)
 const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
 for(const [selector,field]of[['income','businessIncomeCents'],['spent','businessExpensesCents'],['profit','businessProfitCents']])assert.equal(await home.locator(`.home-financial-${selector} dd`).innerText(),money(report[field]))
 await home.close();return{w,report}
}
async function clickSave(page,label){const [r]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&(r.url().includes('/api/bookkeeping/work/answer')||r.url().includes('/api/bookkeeping/questions/')&&!r.url().endsWith('/reconcile')||r.url().includes('/api/bookkeeping/accounts/'))),page.getByRole('button',{name:label,exact:!['Business only','Business + personal'].includes(label)}).click()]);assert.equal(r.status(),200,await r.text());await page.waitForTimeout(500)}
let diagnostic
try{
 for(const f of fixtures){
  if(!selectedScenarios.includes(f.scenario))continue
  assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
  console.log('Scenario '+f.scenario)
  if(results.some(r=>r.scenario===f.scenario&&r.result==='PASS'))continue
  const{context,client}=await session(f,browser),page=await context.newPage();diagnostic=page
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await onboard(f,page)
  if(['1','2'].includes(f.scenario)&&!f.authorized){
   assert(!(await admin.from('business_customer_setup').update({grandfathered_start_date:'2026-01-01'}).eq('business_id',f.businessId)).error)
   const r=await context.request.post(origin+'/api/onboarding/catch-up',{data:{startMonth:'2026-01',agreed:true,expectedTotalCents:0}});assert.equal(r.status(),200);f.authorized=true;await save()
  }
  const files=f.scenario==='7'?['/private/tmp/writeoffs-unified-documents/checking.pdf']:f.scenario==='4'?[`${dir}/food.png`]:f.scenario==='3'?[`${dir}/mixed-use.pdf`]:f.scenario==='6'?[`${dir}/current-phone.pdf`]:f.scenario==='2'?[`${dir}/may-small.pdf`,`${dir}/september.pdf`,`${dir}/current-boundary.pdf`]:[`${dir}/may-small.pdf`]
  for(const file of files)await upload(f,page,context,file)
  await settled(context,page);await page.goto(origin+'/check-in')
  if(f.scenario==='7'){
   const{w,report}=await cross(context,page);assert.equal(w.customer.actionableCount,0);assert.equal(w.scope.catchUp,null);assert.equal(report.businessExpensesCents,0)
   assert(!(await page.locator('main').innerText()).includes('getting your earlier books caught up'))
   await screenshot(page,'out-of-scope');results.push({scenario:'7',result:'PASS'});await context.close();continue
  }
  const seen=new Set(),stages=[],answers=[];let didReceipt=f.receiptUploaded===true
  for(let turn=0;turn<35;turn++){
   await page.waitForTimeout(600)
   if(await page.getByRole('button',{name:'Keep going with Betti',exact:true}).count()){await screenshot(page,`session-completion-${f.scenario}`);await page.getByRole('button',{name:'Keep going with Betti',exact:true}).click()}
   const w=await api(context,'/api/bookkeeping/work'),action=w.nextAction
   if(!action){
    if(w.betti.jobs.length){await screenshot(page,`processing-${f.scenario}`);await cross(context,page);await settled(context,page);await page.reload();continue}
    await screenshot(page,`completion-${f.scenario}`);break
   }
   if(await page.locator('[data-guided-action]').getAttribute('data-guided-action')!==action.type){await page.reload();continue}
   stages.push(action.type);await screenshot(page,`${f.scenario}-${action.type}-${action.workstream}`);await cross(context,page)
   if(action.type==='account_use'){
    await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement?.tagName!=='BODY'))
    await clickSave(page,f.scenario==='3'?'Business + personal':'Business only');continue
   }
   if(action.type==='personal_exception_sweep'){
    if(f.scenario==='2'&&action.workstream==='catch_up'&&!f.deferred){await clickSave(page,'I’ll come back to this');f.deferred=true;await save();continue}
    await clickSave(page,'Nothing here is personal');continue
   }
   if(action.type==='mixed_use_sweep'){
    if(f.scenario==='3'){
     for(const item of action.items){const group=page.getByRole('group',{name:`Use of ${item.merchant}`,exact:true});const choice=item.merchant.includes('ADOBE')?'Personal':item.merchant.includes('GOOGLE')?'Partly personal':'Business';await group.getByRole('button',{name:choice,exact:true}).click();if(choice==='Partly personal')await page.getByLabel(`Business dollars for ${item.merchant}`,{exact:true}).fill('30.00')}
     await clickSave(page,'Save these facts')
    }else await clickSave(page,'Nothing is partly personal')
    continue
   }
   if(action.type==='receipt_upload_sweep'){
    if(f.scenario==='3'&&!f.receiptUploaded){
     let registered=false,failedRead=false
     const observer=response=>{if(response.url()===origin+'/api/documents'&&response.request().method()==='POST')registered=true}
     page.on('response',observer)
     const fault=async route=>{if(registered&&!failedRead){failedRead=true;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic temporary read failure"}'})}else await route.continue()}
     const workReads=/\/api\/bookkeeping\/work(?:\?.*)?$/
     await page.route(workReads,fault)
     const response=page.waitForResponse(r=>r.url()===origin+'/api/documents'&&r.request().method()==='POST'),chooser=page.waitForEvent('filechooser')
     await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(`${dir}/office-mixed.png`);assert.equal((await response).status(),200)
     await page.getByRole('button',{name:'Refresh document status',exact:true}).waitFor({timeout:20000})
     assert(await page.getByRole('button',{name:'Continue with Betti',exact:true}).isDisabled())
     await screenshot(page,'receipt-status-recovery');await page.getByRole('button',{name:'Refresh document status',exact:true}).click()
     assert(failedRead);page.off('response',observer);await page.unroute(workReads,fault)
     f.receiptUploaded=true;f.statusRecoveryCertified=true;await save();continue
    }
    if(f.scenario==='1'&&!f.receiptUploaded){
     const registered=page.waitForResponse(r=>r.url()===origin+'/api/documents'&&r.request().method()==='POST'),chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(`${dir}/office.png`);assert.equal((await registered).status(),200);f.receiptUploaded=true;await save();await screenshot(page,'receipt-received');await page.waitForTimeout(1000);continue
    }
    await clickSave(page,'Continue with Betti');continue
   }
   if(action.type==='receipt_availability'){
    const before=JSON.stringify(action.items);await clickSave(page,'That’s all the receipts I have');didReceipt=true;assert(before.length>0);continue
   }
   if(action.question){
    const q=action.question,key=q.recordId+':'+q.kind+':'+q.prompt;assert(!seen.has(key),'Equivalent answered question returned');seen.add(key)
    assert(!/^what did you buy|how will you use what/i.test(q.prompt),'Evidence-aware nature was lost')
    answers.push(q.kind)
    if(q.kind==='business_use')await clickSave(page,'Yes, business')
    else if(q.kind==='meal_relationship'){await page.getByLabel('Who was the meal with?',{exact:true}).fill('Alex Jones, client');await clickSave(page,'Continue')}
    else if(q.kind==='business_purpose'){await page.getByLabel('What was this purchase for?',{exact:true}).fill('Discussed the client design project with Alex Jones');await clickSave(page,'Continue')}
    else if(q.kind==='percentage'){await page.getByLabel('Business use percentage',{exact:true}).fill('80');await clickSave(page,'Continue')}
    else assert.fail('Unexpected factual control '+q.kind)
    continue
   }
   assert.fail('Unexpected action '+action.type)
  }
  const final=await cross(context,page),history=await client.from('financial_account_use_events').select('id')
  assert(!history.error);assert.equal(history.data.length,f.scenario==='4'?0:1)
  assert.equal(final.w.customer.actionableCount,0,'Journey did not terminate')
  if(f.scenario==='3'){assert.equal(final.report.businessExpensesCents,13000);assert.equal(final.report.ownerPersonalUseCents,24500)}
  if(f.scenario==='1'){assert.equal(final.report.businessExpensesCents,8718);assert(didReceipt);const links=await client.from('bookkeeping_document_links').select('id').is('revoked_at',null);assert(links.data.length>0,'Uploaded receipt did not match');results.push({scenario:'5',result:'PASS'})}
  if(f.scenario==='2'){assert(final.w.progress.catchUp.activity>0&&final.w.progress.current.activity>0);assert(final.w.customer.deferredCount>0)}
  if(f.scenario==='4')assert.equal(final.report.businessExpensesCents,954)
  if(f.scenario==='6')assert.equal(final.w.scope.catchUp,null)
  assert.deepEqual(errors,[])
  results.push({scenario:f.scenario,result:'PASS',stages,answers,expenses:final.report.businessExpensesCents,deferred:final.w.customer.deferredCount})
  await writeFile(`${dir}/browser/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));await context.close()
 }
 results.push({scenario:'8',result:'PASS',evidence:'Post-answer processing screenshots and cross-surface checks'})
 await writeFile(`${dir}/browser/results.json`,JSON.stringify(results,null,2))
}catch(e){if(diagnostic){await diagnostic.screenshot({path:`${dir}/browser/failure.png`,fullPage:true});await writeFile(`${dir}/browser/failure.txt`,await diagnostic.locator('body').innerText())}throw new Error(e instanceof Error?e.message.split('Call log:')[0]:'Certification failed')}finally{await browser.close()}
