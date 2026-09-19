// UX-1 browser journeys. Only explicitly marked synthetic staging tenants.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac,randomUUID} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
process.loadEnvFile('.env.staging.local')
const origin=process.env.UX_ORIGIN??'http://localhost:3100'
assert(['http://localhost:3100','https://writeoffs-fresh-staging.vercel.app'].includes(origin)||/^https:\/\/writeoffs-fresh-staging-[a-z0-9]+-ricks-projects-3ba59ab5\.vercel\.app$/.test(origin))
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'))
const dir='/private/tmp/writeoffs-ux1',prefix=origin==='https://writeoffs-fresh-staging.vercel.app'?'staging':origin.startsWith('https:')?'candidate':'local'
await mkdir(`${dir}/${prefix}`,{recursive:true})
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
const browser=await chromium.launch({headless:true}),results=[]
async function session(f){
 const user=(await admin.auth.admin.getUserById(f.userId)).data.user
 assert(user?.user_metadata.synthetic_guided_contract===true||user?.user_metadata.synthetic_ux1===true,'Synthetic tenants only')
 const cookies=new Map(),client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}})
 assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'})
 await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:origin.startsWith('https:'),sameSite:'Lax'})))
 for(const line of (await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'')).split('\n')){
  if(!line.includes('\t'))continue
  const p=line.replace(/^#HttpOnly_/,'').split('\t')
  if(p[0]===new URL(origin).hostname)await context.addCookies([{domain:p[0],path:p[2],secure:p[3]==='TRUE',name:p[5],value:p[6],httpOnly:true,sameSite:'None'}])
 }
 return context
}
async function capture(page,state){
 await page.locator('.wo-experience:not([aria-busy="true"])').first().waitFor({timeout:60000})
 if(new URL(page.url()).pathname==='/home')await page.locator('[data-customer-action-count]').waitFor()
 if(new URL(page.url()).pathname==='/check-in')await page.locator('[data-guided-action]').waitFor()
 for(const width of [390,430,768,1280]){
  await page.setViewportSize({width,height:900})
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:0,behavior:'instant'})})
  await page.mouse.move(0,0)
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})))})
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,main:document.querySelectorAll('main').length,heading:document.querySelector('h1')?.textContent,betti:document.querySelector('.wo-betti')?.getBoundingClientRect().height,images:[...document.querySelectorAll('.wo-betti img')].map(i=>({src:i.getAttribute('src'),width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,complete:i.complete,naturalWidth:i.naturalWidth,display:getComputedStyle(i).display})),primary:[...document.querySelectorAll('.wo-experience .btn-primary')].filter(el=>el.getClientRects().length).map(el=>({text:el.textContent,top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height}))}))
  assert(!metrics.overflow,`${state}/${width} overflow`)
  assert.equal(metrics.main,1,`${state} main landmarks`)
  await page.screenshot({path:`${dir}/${prefix}/${state}-${width}.png`,fullPage:true})
  results.push({state,width,...metrics})
 }
 await writeFile(`${dir}/${prefix}/results.json`,JSON.stringify(results,null,2))
}

async function guidedJourney(f,context,page){
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user.user_metadata.synthetic_ux1,true)
 const retained=await readFile(`${dir}/${prefix}-guided-${f.userId}.json`,'utf8').then(JSON.parse).catch(()=>readFile(`${dir}/${prefix}-guided-fixture.json`,'utf8').then(JSON.parse).catch(()=>null));if(retained?.userId===f.userId)Object.assign(f,retained)
 // Test-only coverage fixture. Normal scope authorization still runs through the
 // existing command; no pricing or real customer coverage is changed.
 if(!f.guidedScope&&!process.argv.includes('--simple')){
  assert(!(await admin.from('business_customer_setup').update({grandfathered_start_date:'2026-01-01'}).eq('business_id',f.businessId)).error)
  const scope=await context.request.post(origin+'/api/onboarding/catch-up',{data:{startMonth:'2026-01',agreed:true,expectedTotalCents:0}})
  assert.equal(scope.status(),200);f.guidedScope=true
 }
 const history=[]
 const read=async path=>{const r=await context.request.get(origin+path);assert.equal(r.status(),200);return r.json()}
 if(!f.guidedDocument){
  await page.goto(origin+'/import')
  const registered=page.waitForResponse(r=>r.url().endsWith('/api/documents')&&r.request().method()==='POST')
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(process.argv.includes('--simple')?'/private/tmp/writeoffs-phase3/august.pdf':'/private/tmp/writeoffs-unified-documents/checking.pdf')
  const registeredResponse=await registered;assert.equal(registeredResponse.status(),200);f.guidedDocument=(await registeredResponse.json()).document.id
  await writeFile(`${dir}/${prefix}-guided-${f.userId}.json`,JSON.stringify(f),{mode:0o600})
  await page.goto(origin+'/home');await capture(page,'home-upload-received')
  await page.goto(origin+'/check-in');await capture(page,'work-upload-transition')
 }
 for(let i=0;i<60;i++){
  const docs=await read('/api/documents'),doc=docs.documents.find(d=>d.id===f.guidedDocument)
  history.push({document:doc?.state,at:new Date().toISOString()})
  if(doc?.state==='completed')break
  assert(!['failed','unsupported'].includes(doc?.state));await page.waitForTimeout(2000)
 }
 await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor()
 const timeOrigin=await page.evaluate(()=>performance.timeOrigin),seen=new Set(),sequence=[]
 for(let i=0;i<45;i++){
  let work=await read('/api/bookkeeping/work')
  if(!work.nextAction){
   if(work.betti.genuinelyProcessing||work.betti.queued||work.index?.summaryCurrent===false){
    await capture(page,'work-processing');
    for(let n=0;n<90;n++){await page.waitForTimeout(2000);work=await read('/api/bookkeeping/work');if(work.nextAction||(!work.betti.genuinelyProcessing&&!work.betti.queued&&work.index?.summaryCurrent!==false))break}
   }
   if(!work.nextAction){const pending=work.betti.genuinelyProcessing||work.betti.queued||work.index?.summaryCurrent===false;await capture(page,pending?'work-pending':work.customer.deferredCount?'work-only-deferred':'work-completion');if(pending)throw Error('Canonical processing still pending; resume this same synthetic fixture after workers settle');break}
  }
  const action=work.nextAction
  const resume=page.getByRole('button',{name:'Check for the next step',exact:true});if(await resume.isVisible())await resume.click()
  await page.waitForFunction(v=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-version')===v,action.version,{timeout:30000})
  if(action.type==='special_transaction'||action.question?.kind==='transaction_type'){
   await page.locator('.betti-special h1,.question-conversation h1').waitFor({timeout:3000}).catch(()=>{});
   if(await page.locator('[data-guided-action]').getAttribute('data-guided-version')!==action.version)continue
  }
  const label=`work-${action.type}${action.question?'-'+action.question.kind:''}`
  if(!seen.has(label)){await capture(page,label);seen.add(label)}
  let button,disposition='completed'
  if(action.type==='account_use')button=page.getByRole('button',{name:/Business only/})
  else if(action.type==='personal_exception_sweep')button=page.getByRole('button',{name:'Nothing here is personal',exact:true})
  else if(action.type==='mixed_use_sweep')button=page.getByRole('button',{name:'Nothing is partly personal',exact:true})
  else if(action.type==='receipt_upload_sweep')button=page.getByRole('button',{name:'Continue with Betti',exact:true})
  else if(action.type==='receipt_availability')button=page.getByRole('button',{name:'That’s all the receipts I have',exact:true})
  else {button=page.getByRole('button',{name:'I’ll come back to this',exact:true});disposition='deferred'}
  if(!await button.count())throw Error('No known safe synthetic response for '+action.type)
  const start=performance.now(),response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/')&&!r.url().endsWith('/reconcile'))
  await button.click();const r=await response;assert.equal(r.status(),200,await r.text())
  await page.waitForFunction(v=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-version')!==v,action.version,{timeout:30000})
  sequence.push({type:action.type,question:action.question?.kind,disposition,ms:performance.now()-start,next:await page.locator('[data-guided-action]').getAttribute('data-guided-action')})
  assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin,'Unnecessary navigation')
  await writeFile(`${dir}/${prefix}/guided-sequence-${f.userId}.json`,JSON.stringify({history,sequence},null,2))
 }
 await page.goto(origin+'/home');await capture(page,'home-guided-finished')
 const work=await read('/api/bookkeeping/work'),questions=await read('/api/bookkeeping/questions')
 assert.equal(work.customer.actionableCount,questions.count)
 assert.equal(Number(await page.locator('[data-customer-action-count]').getAttribute('data-customer-action-count')),questions.count)
 const report=await read('/api/reports/summary?start='+work.scope.bookkeepingStart+'&end='+new Date().toISOString().slice(0,10))
 assert.equal(report.businessIncomeCents-report.businessExpensesCents,report.businessProfitCents)
 const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100)
 for(const [name,key] of [['income','businessIncomeCents'],['spent','businessExpensesCents'],['profit','businessProfitCents']])assert.equal(await page.locator(`.home-financial-${name} dd`).innerText(),money(report[key]))
 console.log('Guided journey:',sequence.length,'actions; Home/Check-in and Reports agree')
}
try {
 if(process.argv.includes('--existing')){
  const fixtures=JSON.parse(await readFile(process.env.UX_FIXTURES??'/private/tmp/writeoffs-phase3-final/fixtures.json','utf8'))
  for(const f of fixtures.slice(0,process.argv.includes('--catalog')?fixtures.length:3)){
   const context=await session(f),page=await context.newPage()
   page.on('pageerror',e=>console.error('BROWSER ERROR:',e.message))
   await page.goto(origin+'/home');await capture(page,`home-existing-${f.scenario}`)
   await page.goto(origin+'/check-in');await capture(page,`work-existing-${f.scenario}`)
   await context.close()
  }
 } else {
  let fixtures=await readFile(`${dir}/${prefix}-fixtures.json`,'utf8').then(JSON.parse).catch(()=>[])
  let f=process.argv.includes('--fresh')?null:process.env.UX_FIXTURE_INDEX===undefined?fixtures.at(-1):fixtures[Number(process.env.UX_FIXTURE_INDEX)]
  if(!f){
   const nonce=randomUUID(),email=`ux1-${nonce}@staging.writeoffs.invalid`,password=`Ux1-${nonce}!`
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_ux1:true}});assert(!created.error)
   const customer=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
   assert(!(await customer.auth.signInWithPassword({email,password})).error)
   const b=await customer.from('businesses').select('id').single();assert(b.data)
   assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:b.data.id,p_plan:'business',p_starts_at:new Date().toISOString(),p_ends_at:null,p_request_key:`ux1:${nonce}`,p_reason:'Isolated UX-1 browser certification',p_provenance:'admin',p_actor_user_id:null})).error)
   const enrolled=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:'UX-1 certification'});assert(enrolled.data&&!enrolled.error)
   f={email,password,userId:created.data.user.id,businessId:b.data.id,factorId:enrolled.data.id,totpSecret:enrolled.data.totp.secret}
   assert(!(await customer.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
   fixtures.push(f);await writeFile(`${dir}/${prefix}-fixtures.json`,JSON.stringify(fixtures),{mode:0o600})
  }
  const context=await session(f),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/onboarding')
  await page.waitForFunction(()=>location.pathname==='/home'||Boolean(document.querySelector('[data-onboarding-step]')))
  if(!page.url().endsWith('/home')){
   await capture(page,'onboarding-business')
   await page.getByLabel(/Business name/).fill('Juniper Design Studio')
   await page.getByLabel('What does your business do?',{exact:true}).fill('I design websites and brand identities for independent businesses.')
   const next=async()=>{const previous=await page.locator('[data-onboarding-step]').getAttribute('data-onboarding-step');await page.getByRole('button',{name:'Continue',exact:false}).click();await page.waitForFunction(previous=>document.querySelector('[data-onboarding-step]')?.getAttribute('data-onboarding-step')!==previous,previous)}
   await next();await capture(page,'onboarding-eligibility')
   await page.getByRole('radio',{name:/With my personal tax return/}).check();await next()
   await capture(page,'onboarding-history')
   await page.getByRole('radio',{name:'This business already exists',exact:true}).check()
   const start=page.getByRole('group',{name:'When did the business start?',exact:true})
   assert.equal(await page.locator('input[type=month],input[type=date]').count(),0);
   await start.getByLabel('Year',{exact:true}).selectOption(String(new Date().getFullYear()));
   const maxMonth=new Date().getMonth()+1;
   if(maxMonth<12)assert(await start.getByLabel('Month',{exact:true}).locator('option[value=\"12\"]').isDisabled());
   await start.getByLabel('Year',{exact:true}).selectOption('2022');await start.getByLabel('Month',{exact:true}).selectOption('03')
   await capture(page,'onboarding-start-date');
   const historySaved=page.waitForResponse(r=>r.url().endsWith('/api/onboarding/business')&&r.request().method()==='PATCH');
   await next();const historyResponse=await historySaved;assert.equal(historyResponse.status(),200);assert.equal(historyResponse.request().postDataJSON().data.business_start_month,'2022-03')
   await capture(page,'onboarding-operations')
   await page.getByRole('group',{name:'Customer-job materials',exact:true}).getByRole('radio',{name:'No',exact:true}).check()
   await page.getByRole('group',{name:'Products kept for future sale',exact:true}).getByRole('radio',{name:'No',exact:true}).check();await next()
   await page.getByRole('radio',{name:'Start with last month',exact:true}).check()
   await page.getByText('No catch-up charge.',{exact:true}).waitFor()
   await capture(page,'onboarding-scope');await next()
   await capture(page,'onboarding-activity')
   await page.getByRole('radio',{name:process.argv.includes('--connected')?/Connect my accounts/:/Send Betti documents/}).check();await next()
   await capture(page,'onboarding-handoff')
   assert.equal(await page.locator('.wo-onboarding-review').getAttribute('open'),null)
   await page.getByText('Review your details',{exact:true}).click();await capture(page,'onboarding-review')
   await page.getByText('Review your details',{exact:true}).click()
   await page.getByRole('button',{name:/Go to WriteOffs/}).click();await page.waitForURL('**/home',{timeout:60000})
  }
  await capture(page,'home-first-use')
  const before=await context.request.get(origin+'/api/bookkeeping/work');assert.equal(before.status(),200)
  const work=await before.json()
  assert.equal(Number(await page.locator('[data-customer-action-count]').getAttribute('data-customer-action-count')),work.customer.actionableCount)
  await page.locator('.wo-menu > summary').click();await page.screenshot({path:`${dir}/${prefix}/menu-1280.png`})
  await page.keyboard.press('Escape');assert.equal(await page.locator('.wo-menu').getAttribute('open'),null)
  await page.locator('.wo-menu > summary').click();await page.locator('h1').click();assert.equal(await page.locator('.wo-menu').getAttribute('open'),null)
  await page.reload();await capture(page,'home-first-use-reload')
  assert.equal(errors.length,0,errors.join('\n'))
  if(process.argv.includes('--guided'))await guidedJourney(f,context,page)
  assert.equal(errors.length,0,errors.join('\n'))
  await context.close()
 }
 console.log(`PASS ${results.length} layout captures; originals and Rick customers untouched`)
} finally {await browser.close()}
