// Real dedicated-staging scope contract. Only explicitly marked isolated tenants are mutable.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
import {PDFDocument,StandardFonts} from 'pdf-lib'
const origin=process.env.CERTIFICATION_ORIGIN??'https://writeoffs-fresh-staging.vercel.app'
assert(/^https:\/\/writeoffs-fresh-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Phoenix',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dir=process.env.CERTIFICATION_ARTIFACT_DIR??'/private/tmp/writeoffs-phase3',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(/^\/private\/tmp\/writeoffs-phase3(?:-[a-z0-9-]+)?$/.test(dir))
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'),'Explicit certification flag required')
await mkdir(`${dir}/browser`,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));const jar=await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'');for(const line of jar.split('\n')){if(!line.includes('\t'))continue;const parts=line.replace(/^#HttpOnly_/,'').split('\t');if(parts[0]===new URL(origin).hostname)await context.addCookies([{domain:parts[0],path:parts[2],secure:parts[3]==='TRUE',name:parts[5],value:parts[6],httpOnly:true,sameSite:'None'}])}return{context,client}}


const fixtures=JSON.parse(await readFile(`${dir}/fixtures.json`,'utf8')),save=()=>writeFile(`${dir}/fixtures.json`,JSON.stringify(fixtures),{mode:0o600})
const browser=await chromium.launch({headless:true})
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
async function api(context,path){for(let attempt=0;attempt<3;attempt++){const r=await context.request.get(origin+path);if(r.status()===503&&attempt<2){await new Promise(resolve=>setTimeout(resolve,500));continue}assert.equal(r.status(),200,`${path}: ${r.status()}`);return r.json()}}
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
async function screenshot(page,name){
 for(const width of [390,430,768,1280]){
  await page.setViewportSize({width,height:900});await page.screenshot({path:`${dir}/browser/${name}-${width}.png`,fullPage:true})
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
 const report=await api(context,'/api/reports/summary?start=2026-01-01&end='+today)
 assert.equal(report.categoryTotals.reduce((n,c)=>n+c.amountCents,0)+report.uncategorizedBusinessExpensesCents,report.businessExpensesCents)
 assert.equal(report.businessIncomeCents-report.businessExpensesCents,report.businessProfitCents)
 const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
 for(const [selector,field]of[['income','businessIncomeCents'],['spent','businessExpensesCents'],['profit','businessProfitCents']])assert.equal(await home.locator(`.home-financial-${selector} dd`).innerText(),money(report[field]))
 await home.close();return{w,report}
}
async function clickSave(page,label){const response=page.waitForResponse(r=>r.request().method()==='POST'&&(r.url().includes('/api/bookkeeping/work/answer')||r.url().includes('/api/bookkeeping/questions/')&&!r.url().endsWith('/reconcile')||r.url().includes('/api/bookkeeping/accounts/')));await page.getByRole('button',{name:label,exact:!['Business only','Business + personal'].includes(label)}).click();const r=await response;assert.equal(r.status(),200,await r.text());await page.waitForTimeout(500)}

const checks=[]
async function accessibility(page){
 const issue=await page.locator('.betti-work').evaluate(root=>Array.from(root.querySelectorAll('button,input,textarea')).filter(el=>el.getBoundingClientRect().width>0).flatMap(el=>{
  const name=el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.labels?.[0]?.textContent||el.textContent
  return name?.trim()?[]:[el.tagName+' has no accessible name']
 }))
 assert.deepEqual(issue,[])
 await page.keyboard.press('Tab')
 assert(await page.evaluate(()=>document.activeElement?.tagName!=='BODY'))
 await page.emulateMedia({reducedMotion:'reduce'})
 assert(await page.locator('.betti-work').evaluate(root=>Array.from(root.querySelectorAll('*')).every(el=>getComputedStyle(el).animationName==='none')))
 await page.emulateMedia({reducedMotion:'no-preference'})
}
let diagnostic
try{
 for(const scenario of ['2','6']){
  const f=fixtures.find(f=>f.scenario===scenario)
  assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
  const {context,client}=await session(f,browser),page=await context.newPage();diagnostic=page
  const before=await api(context,'/api/reports/summary?start=2026-01-01&end='+today)
  const file=scenario==='2'?'historical-phone-followup':'payment-followup'
  await statement(file,scenario==='2'?'May 1, 2026':'September 1, 2026',scenario==='2'?'May 31, 2026':'September 30, 2026',scenario==='2'?[['05/19','VERIZON WIRELESS',-14628]]:[[today.slice(5,10).replace('-','/'),'CREDIT CARD PAYMENT',-128437],[today.slice(5,10).replace('-','/'),'LOAN PAYMENT EQUIPMENT',-45000]])
  await upload(f,page,context,`${dir}/${file}.pdf`);await settled(context,page);await page.goto(origin+'/check-in')
  const stages=[]
  for(let turn=0;turn<25;turn++){
   if(await page.getByRole('button',{name:'Keep going with Betti',exact:true}).count())await page.getByRole('button',{name:'Keep going with Betti',exact:true}).click()
   const work=await api(context,'/api/bookkeeping/work'),a=work.nextAction
   if(!a){if(work.betti.jobs.length){await settled(context,page);await page.reload();continue}break}
   await page.waitForFunction(type=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-action')===type,a.type)
   stages.push(a.type);await accessibility(page);await screenshot(page,`followup-${scenario}-${a.type}-${a.question?.kind??'batch'}-${a.workstream}`)
   assert.notEqual(a.type,'account_use','Account fact was asked again for new activity')
   if(a.type==='personal_exception_sweep')await clickSave(page,'Nothing here is personal')
   else if(a.type==='mixed_use_sweep')await clickSave(page,'Nothing is partly personal')
   else if(a.type==='receipt_upload_sweep')await clickSave(page,'Continue with Betti')
   else if(a.type==='receipt_availability')await clickSave(page,'That’s all the receipts I have')
   else if(a.question?.kind==='percentage'){await page.locator('input[inputmode="decimal"]').fill('80');await clickSave(page,'Continue')}
   else{
    const merchant=a.question?.transaction.merchant??''
    const label=merchant.includes('CREDIT CARD')?'Credit card payment':await page.getByRole('button',{name:'Payment on a business loan',exact:true}).count()?'Payment on a business loan':'I’ll come back to this'
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/special'))
    await page.getByRole('button',{name:label,exact:true}).click();assert.equal((await response).status(),200)
    await page.waitForTimeout(700)
    if(label==='Credit card payment')assert((await page.locator('main').innerText()).includes('outside business income and expenses'))
   }
   await page.waitForTimeout(700)
  }
  const after=await cross(context,page);assert.equal(after.w.customer.actionableCount,0)
  assert.equal(after.report.businessExpensesCents-before.businessExpensesCents,scenario==='2'?11702:0)
  const history=await client.from('financial_account_use_events').select('id');assert.equal(history.data.length,1)
  await screenshot(page,`followup-completion-${scenario}`)
  checks.push({scenario,stages,expenseChange:after.report.businessExpensesCents-before.businessExpensesCents,accountFactAskedAgain:false,accessibility:'PASS'})
  await context.close()
 }
 await writeFile(`${dir}/browser/followups.json`,JSON.stringify(checks,null,2))
 console.log('Historical context, special payment, loan, shared-fact reuse and accessibility passed')
}catch(error){if(diagnostic){await diagnostic.screenshot({path:`${dir}/browser/followup-failure.png`,fullPage:true});await writeFile(`${dir}/browser/followup-failure.txt`,await diagnostic.locator('body').innerText())}throw error}finally{await browser.close()}
