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
const dir='/private/tmp/writeoffs-scope-repair',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'),'Explicit certification flag required')
await mkdir(`${dir}/browser`,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));return{context,client}}

let fixtures=await readFile(`${dir}/fixtures.json`,'utf8').then(JSON.parse).catch(()=>[])
for(const scenario of ['A','B','C','D','G']){
 if(fixtures.some(f=>f.scenario===scenario))continue
 const nonce=randomUUID(),email=`scope-contract-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_scope_contract:true}});assert(!made.error&&made.data.user)
 const userId=made.data.user.id,customer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 assert(!(await customer.auth.signInWithPassword({email,password})).error)
 const b=await customer.from('businesses').select('id').single();assert(b.data);const businessId=b.data.id
 assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:new Date(Date.now()-86400000).toISOString(),p_ends_at:null,p_request_key:`scope-contract:${nonce}`,p_reason:'Isolated scope integration certification',p_provenance:'admin',p_actor_user_id:null})).error)
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
await statement('september','September 1, 2026','September 30, 2026',[['09/03','GOOGLE WORKSPACE',-1800],['09/12','OFFICE DEPOT',-6419]])
const canvas=createCanvas(760,900),ink=canvas.getContext('2d');ink.fillStyle='white';ink.fillRect(0,0,760,900);ink.fillStyle='black';ink.font='bold 36px Arial'
ink.fillText("McDonald's Restaurant",35,90);ink.font='28px Arial'
;['09/08/2026 08:30 AM','Sausage McMuffin       $4.00','Hash Brown             $2.54','Medium Coffee          $3.00','TOTAL                  $9.54','VISA ending 1234','SYNTHETIC TEST RECEIPT'].forEach((line,i)=>ink.fillText(line,35,170+i*85))
await writeFile(`${dir}/food.png`,canvas.toBuffer('image/png'))
const browser=await chromium.launch({headless:true}),results=[]
const save=()=>writeFile(`${dir}/fixtures.json`,JSON.stringify(fixtures),{mode:0o600})
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
async function api(context,path){const r=await context.request.get(origin+path);assert.equal(r.status(),200,`${path}: ${r.status()}`);return r.json()}
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
 const states=[]
 for(let n=0;n<100;n++){
  const docs=await api(context,'/api/documents'),doc=docs.documents.find(d=>d.id===id)
  const work=await api(context,'/api/bookkeeping/work');states.push({document:doc?.state,phase:work.readiness.phase,actions:work.customer.actionableCount,processing:work.betti.genuinelyProcessing})
  if(doc&&!['pending','processing','retryable'].includes(doc.state)){assert.equal(doc.state,'completed',JSON.stringify(doc));break}
  await page.waitForTimeout(2000)
 }
 await writeFile(`${dir}/browser/${f.scenario}-${id}-transitions.json`,JSON.stringify(states,null,2))
 return id
}
async function settled(context,page){
 let w
 for(let n=0;n<100;n++){w=await api(context,'/api/bookkeeping/work');if(w.betti.jobs.length===0)return w;await page.waitForTimeout(2000)}
 assert.fail('Normal workers did not settle: '+JSON.stringify(w.betti.jobs))
}
async function compare(f,context,page){
 const w=await settled(context,page),q=await api(context,'/api/bookkeeping/questions')
 assert.equal(q.count,w.customer.actionableCount);assert.deepEqual(q.actions.map(a=>a.id),w.customer.actionable.map(a=>a.id))
 const ledger=await api(context,'/api/transactions/list?year=all');assert(ledger.ok)
 const report=await api(context,'/api/reports/summary?start=2026-01-01&end=2026-09-17')
 await page.goto(origin+'/home');assert.equal(await page.locator('[data-customer-action-count]').getAttribute('data-customer-action-count'),String(w.customer.actionableCount))
 assert.equal(await page.locator('[data-betti-state="unavailable"]').count(),0)
 for(const [selector,field]of[['income','businessIncomeCents'],['spent','businessExpensesCents'],['profit','businessProfitCents']])assert.equal(await page.locator(`.home-financial-${selector} dd`).innerText(),money(report[field]))
 await page.goto(origin+'/check-in');assert.equal(await page.locator('[data-customer-action-count]').getAttribute('data-customer-action-count'),String(w.customer.actionableCount))
 await page.goto(origin+'/reports');assert(new URL(page.url()).pathname==='/reports')
 await page.goto(origin+'/transactions');assert(new URL(page.url()).pathname==='/transactions')
 for(const width of [390,430,768,1280])for(const path of ['/home','/check-in','/transactions','/reports']){
  await page.setViewportSize({width,height:900});await page.goto(origin+path);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} overflow ${width}`)
  await page.screenshot({path:`${dir}/browser/${f.scenario}-${path.slice(1)}-${width}.png`,fullPage:true})
 }
 return{w,q,ledger,report}
}
try{
 for(const f of fixtures){
  assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_scope_contract,true)
  const{context,client}=await session(f,browser),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message));await onboard(f,page)
  if(f.scenario==='D'&&!f.authorized){
   // Synthetic commercial-coverage fixture only. No fabricated payment or bookkeeping result.
   assert(!(await admin.from('business_customer_setup').update({grandfathered_start_date:'2026-01-01'}).eq('business_id',f.businessId)).error)
   const r=await context.request.post(origin+'/api/onboarding/catch-up',{data:{startMonth:'2026-01',agreed:true,expectedTotalCents:0}})
   assert.equal(r.status(),200);f.authorized=true;await save()
  }
  const files=f.scenario==='A'?['/private/tmp/writeoffs-unified-documents/checking.pdf']:f.scenario==='B'?[`${dir}/august.pdf`]:f.scenario==='C'?[`${dir}/mixed.pdf`]:f.scenario==='D'?[`${dir}/may-small.pdf`,`${dir}/september.pdf`]:[`${dir}/food.png`]
  for(const file of files)await upload(f,page,context,file)
  let before=await compare(f,context,page)
  if(f.scenario==='A'){
   assert.equal(before.w.scope.catchUp,null);assert.equal(before.w.progress.outsideScopeActivity,24)
   assert.equal(before.w.customer.actionableCount,0);assert.equal(before.q.questions.length,0);assert.equal(before.ledger.rows.length,0)
   assert.equal(before.report.businessExpensesCents,0);assert.equal(before.report.businessIncomeCents,0)
   assert.equal(before.w.readiness.phase,'outside_scope')
   const docs=await api(context,'/api/documents');assert.equal(docs.documents[0].outside_scope_transaction_count,24);assert.equal(docs.documents[0].active_transaction_count,0);assert.equal(docs.accountUseAccounts.length,0)
  }else if(f.scenario==='G'){
   assert.equal(before.w.scope.catchUp,null);assert.equal(before.ledger.rows.length,1)
   assert(before.q.questions.length>0);assert(before.q.questions.every(q=>!/^what did you buy|how will you use what/i.test(q.prompt)))
  }else{
   if(f.scenario==='C'){assert.equal(before.w.progress.outsideScopeActivity,1);assert.equal(before.ledger.rows.length,1);assert(before.ledger.rows.every(r=>r.posted_at>='2026-08-01'))}
   if(f.scenario==='D'){assert(before.w.scope.catchUp);assert.equal(before.w.progress.catchUp.activity,2);assert.equal(before.w.progress.current.activity,2)}
   else assert.equal(before.w.scope.catchUp,null)
   if(!f.accountAnswered){
    assert.equal(before.w.customer.actionableCount,1);assert.equal(before.w.nextAction.type,'account_use')
    if(f.scenario==='D')assert.equal(before.w.customer.sharedCount,1)
    const stale=await context.newPage();await stale.goto(origin+'/check-in')
    await page.goto(origin+'/check-in');const saved=page.waitForResponse(r=>r.url().includes('/api/bookkeeping/accounts/')&&r.request().method()==='POST')
    await page.getByRole('radio',{name:'Business only',exact:true}).check();assert.equal((await saved).status(),200)
    f.accountAnswered=true;await save();await settled(context,page)
    await stale.evaluate(()=>window.dispatchEvent(new Event('focus')))
    await stale.getByRole('radio',{name:'Business only',exact:true}).waitFor({state:'detached',timeout:30000});await stale.close()
   }
   const after=await compare(f,context,page)
   const uses=await client.from('current_financial_account_use').select('*');assert(!uses.error);assert.equal(uses.data.length,1);assert.equal(uses.data[0].designation,'business_only')
   assert(!after.w.customer.actionable.some(a=>a.type==='account_use'))
   const expected=f.scenario==='B'?8718:f.scenario==='C'?1800:16937
   assert.equal(after.report.businessExpensesCents,expected,'Supported ordinary expenses stay in working books without receipts')
   assert(after.ledger.rows.every(r=>!r.has_receipt))
   before=after
  }
  assert.deepEqual(errors,[])
  results.push({scenario:f.scenario,result:'PASS',active:before.ledger.rows.length,actions:before.w.customer.actionableCount,income:before.report.businessIncomeCents,expenses:before.report.businessExpensesCents,profit:before.report.businessProfitCents})
  await writeFile(`${dir}/browser/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));await context.close()
 }
}finally{await browser.close()}
