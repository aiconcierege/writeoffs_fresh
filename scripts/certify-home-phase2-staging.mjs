// Explicit isolated staging certification; never resolves a customer by email.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac,randomUUID} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
const origin='https://writeoffs-fresh-staging.vercel.app',dir='/private/tmp/writeoffs-home-phase2',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--isolated-onboarding'),'Explicit isolated certification option required')
await mkdir(`${dir}/staging`,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));return{context,client}}
let fixtures=await readFile(`${dir}/onboarding-fixtures.json`,'utf8').then(JSON.parse).catch(()=>[])
for(const method of ['statement_uploads','connected_financial_accounts']) {
 if(fixtures.some(f=>f.method===method))continue
 const nonce=randomUUID(),email=`home-phase2-${nonce}@staging.writeoffs.invalid`,password=`Proof-${nonce}!`
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_home_phase2:true}});assert(!made.error&&made.data.user)
 const userId=made.data.user.id,customer=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}})
 assert(!(await customer.auth.signInWithPassword({email,password})).error)
 const b=await customer.from('businesses').select('id').single();assert(b.data);const businessId=b.data.id
 assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:new Date(Date.now()-86400000).toISOString(),p_ends_at:null,p_request_key:`home-phase2:${nonce}`,p_reason:'Isolated Phase 2 onboarding UI certification',p_provenance:'admin',p_actor_user_id:null})).error)
 const enrolled=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:'Home phase2 proof'});assert(enrolled.data&&!enrolled.error)
 const totpSecret=enrolled.data.totp.secret,factorId=enrolled.data.id
 assert(!(await customer.auth.mfa.challengeAndVerify({factorId,code:totp(totpSecret)})).error)
 fixtures.push({method,userId,businessId,email,password,factorId,totpSecret})
 await writeFile(`${dir}/onboarding-fixtures.json`,JSON.stringify(fixtures),{mode:0o600});await customer.auth.signOut()
}
const browser=await chromium.launch({headless:true}),results=[]
try {
 for(const f of fixtures){
  assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_home_phase2,true)
  const {context}=await session(f,browser),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.name))
  const saved=await admin.from('businesses').select('onboarding_state').eq('id',f.businessId).single()
  if(saved.data.onboarding_state!=='completed'){
   await page.goto(origin+'/onboarding')
   await page.getByLabel(/Business name/).fill('Home Phase Two Studio')
   await page.getByLabel('What does your business do?',{exact:true}).fill('Independent design consulting for small businesses.')
   const next=()=>page.getByRole('button',{name:'Continue',exact:true}).click()
   await next();await page.getByRole('radio',{name:/With my personal tax return/}).check();await next()
   await page.getByRole('radio',{name:'This business already exists',exact:true}).check()
   await page.getByLabel('When did the business start?',{exact:true}).fill('2022-03');await next()
   await page.getByRole('group',{name:'Customer-job materials',exact:true}).getByRole('radio',{name:'No',exact:true}).check()
   await page.getByRole('group',{name:'Products kept for future sale',exact:true}).getByRole('radio',{name:'No',exact:true}).check();await next()
   await page.getByRole('radio',{name:'Start with last month',exact:true}).check()
   await page.getByText('No catch-up charge.',{exact:true}).waitFor();await next()
   await page.getByRole('heading',{name:'Give Betti your financial activity',exact:true}).waitFor()
   assert.equal(await page.getByText('How many business miles have you driven so far this year?',{exact:true}).count(),0)
   await page.getByRole('radio',{name:f.method==='statement_uploads'?/Send Betti documents/:/Connect my accounts/}).check();await next()
   await page.getByRole('button',{name:'Start using WriteOffs',exact:true}).click()
   await page.waitForURL('**/home',{timeout:60000})
  } else await page.goto(origin+'/home')
  await page.getByRole('heading',{name:'I’m ready to start your books.',exact:true}).waitFor()
  const expected=f.method==='statement_uploads'?'/import':'/get-started'
  assert.equal(await page.locator('.home-betti-action a').getAttribute('href'),expected)
  const setup=await admin.from('business_customer_setup').select('timezone_name').eq('business_id',f.businessId).single()
  assert.equal(setup.data.timezone_name,'America/Phoenix')
  for(const table of ['financial_accounts','current_historical_mileage']){
   const {count,error}=await admin.from(table).select('*',{count:'exact',head:true}).eq('business_id',f.businessId);assert(!error);assert.equal(count,0)
  }
  const workResponse=await context.request.get(origin+'/api/bookkeeping/work');assert.equal(workResponse.status(),200)
  const work=await workResponse.json();assert.equal(work.progress.totalCanonicalActivity,0)
  for(const width of [390,430,768,1280]){
   await page.setViewportSize({width,height:900});await page.locator('.home-betti-art').evaluate(img=>img.decode())
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   await page.screenshot({path:`${dir}/staging/${f.method}-${width}.png`,fullPage:true})
  }
  await page.reload();await page.getByRole('heading',{name:'I’m ready to start your books.',exact:true}).waitFor()
  await page.goto(origin+'/mileage');await page.getByText('Add earlier business mileage',{exact:true}).waitFor()
  await page.goto(origin+'/transactions');assert(new URL(page.url()).pathname==='/transactions')
  assert.equal(errors.length,0);await context.close()
  const fresh=await session(f,browser),again=await fresh.context.newPage();await again.goto(origin+'/home')
  await again.getByRole('heading',{name:'I’m ready to start your books.',exact:true}).waitFor();await fresh.context.close()
  results.push({method:f.method,result:'passed',home:true,mileageNotRequired:true,noPlaid:true,timezonePersisted:true,relogin:true})
  console.log(JSON.stringify(results.at(-1)))
 }
 // Read-only existing synthetic books: verify orchestration and financial output together.
 const existing=JSON.parse(await readFile('/private/tmp/writeoffs-workflow/fixtures.json','utf8'))[0]
 assert.equal((await admin.auth.admin.getUserById(existing.userId)).data.user?.user_metadata.synthetic_workflow,true)
 const {context}=await session(existing,browser),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name))
 const workResponse=await context.request.get(origin+'/api/bookkeeping/work');assert.equal(workResponse.status(),200);const work=await workResponse.json()
 await page.goto(origin+'/home');await page.locator('.home-betti-hero').waitFor()
 assert.equal(await page.locator('[data-betti-state="unavailable"]').count(),0,'Projection unavailable on Home')
 if(work.nextAction?.href.startsWith('/check-in'))assert.equal(await page.locator('.home-betti-action a').getAttribute('href'),work.nextAction.href+'&returnTo=%2Fhome')
 const business=await admin.from('businesses').select('catch_up_start_date').eq('id',existing.businessId).single()
 const today=new Date().toISOString().slice(0,10),yearStart=today.slice(0,4)+'-01-01',start=business.data.catch_up_start_date>yearStart?business.data.catch_up_start_date:yearStart
 const reportResponse=await context.request.get(`${origin}/api/reports/summary?start=${start}&end=${today}`);assert.equal(reportResponse.status(),200);const report=await reportResponse.json()
 const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)
 for(const [selector,field] of [['income','businessIncomeCents'],['spent','businessExpensesCents'],['profit','businessProfitCents']])assert.equal(await page.locator(`.home-financial-${selector} dd`).innerText(),money(report[field]))
 for(const width of [390,430,768,1280]){
  await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:`${dir}/staging/existing-books-${width}.png`,fullPage:true})
 }
 assert.equal(errors.length,0);await context.close()
 results.push({existingSyntheticBooks:'passed',customerActions:work.customer.actionableCount,financialTotalsMatchReports:true})
 await writeFile(`${dir}/staging/results.json`,JSON.stringify(results,null,2));console.log('Dedicated staging Home certification passed')
}finally{await browser.close()}
