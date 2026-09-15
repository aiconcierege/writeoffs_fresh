import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {randomBytes,createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co','Dedicated staging only')
const origin='https://writeoffs-fresh-staging.vercel.app',dir='/private/tmp/writeoffs-phase1-proof'+(process.argv.includes('--new-visual')?'-secondary':'')
await mkdir(dir,{recursive:true})
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Phoenix',acceptDownloads:true}),page=await context.newPage()
let stage='public',fixture
const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.name))
function pass(check){console.log(JSON.stringify({check,result:'passed'}))}
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');const key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function screenshot(name){await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(250);assert(!(await page.locator('img[alt="QR code for authenticator app setup"]').count()),'Never capture an MFA setup secret');await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal overflow')}
try {
 if(process.argv.includes('--resume')){
  fixture=JSON.parse(await readFile(`${dir}/fresh-fixture.json`,'utf8'))
  const identity=await admin.auth.admin.getUserById(fixture.userId);assert(identity.data.user?.user_metadata.synthetic_phase1_validation===true)
  await context.addCookies(JSON.parse(await readFile(`${dir}/cookies.json`,'utf8')))
  await page.goto(`${origin}/home`)
 }else{
  if(!process.argv.includes('--enroll')){
  await page.goto(origin);await page.getByRole('link',{name:'Get started',exact:true}).first().waitFor();await screenshot('landing-390')
  await page.getByRole('link',{name:'Get started',exact:true}).first().click();await page.waitForURL('**/signup');pass('landing to signup')
  stage='signup';fixture={email:`rick+phase1-${Date.now()}@writeoffs.io`,password:randomBytes(24).toString('base64url')+'aA1!'}
  await page.getByLabel('Email',{exact:true}).fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password)
  const signupResponse=page.waitForResponse(r=>r.url().includes('/auth/v1/signup')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Create account',exact:true}).click();const response=await signupResponse;assert(response.ok(),'Signup request succeeds');const signup=await response.json();fixture.userId=signup.id??signup.user?.id;assert(fixture.userId)
  await page.getByRole('heading',{name:'Check your email',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Create account'}).count(),0);await screenshot('signup-confirmation-390');pass('public signup confirmation replaces form')
  // The synthetic inbox is confirmed by the test operator, not by changing any
  // application verification rule. Rick's live customer is never selected.
  const confirmed=await admin.auth.admin.updateUserById(fixture.userId,{email_confirm:true,user_metadata:{synthetic_phase1_validation:true}});assert(!confirmed.error)
  await writeFile(`${dir}/fresh-fixture.json`,JSON.stringify(fixture),{mode:0o600})
  }else{fixture=JSON.parse(await readFile(`${dir}/fresh-fixture.json`,'utf8'));const identity=await admin.auth.admin.getUserById(fixture.userId);assert(identity.data.user?.user_metadata.synthetic_phase1_validation===true)}
  stage='login';await page.goto(`${origin}/login`);await page.getByLabel('Email address',{exact:true}).fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:/log in|sign in/i}).click()
  stage='mfa';await page.getByRole('heading',{name:'Protect your account',exact:true}).waitFor({timeout:30000});assert.equal(await page.getByLabel('Authenticated navigation').count(),0);await screenshot('mfa-gate-390');pass('required MFA controlled onboarding gate')
  await page.getByRole('button',{name:'Set up authenticator app',exact:true}).click();await page.getByLabel('Authenticator setup key').waitFor({state:'attached'});const secret=await page.getByLabel('Authenticator setup key').textContent();await page.getByLabel('Enter the 6-digit code').fill(totp(secret.trim()));await page.getByRole('button',{name:'Turn on two-factor authentication',exact:true}).click()
  stage='membership';await page.getByRole('button',{name:'Start WriteOffs — $39/month',exact:true}).waitFor({timeout:30000});await screenshot('membership-390');pass('MFA enrollment and single membership')
 }
 if(process.argv.includes('--connected-visuals')){
  stage='connected-visuals';await page.goto(`${origin}/get-started`);await page.getByRole('heading',{name:'Your accounts are connected.',exact:true}).waitFor()
  for(const width of [390,430,768,1280]){await page.setViewportSize({width,height:900});await screenshot(`connected-final-${width}`)}
  pass('connected-account instructions lead the setup screen')
 }
 if(process.argv.includes('--surfaces')){
  stage='home-check-in-surfaces'
  const queue=await context.request.get(`${origin}/api/bookkeeping/questions`);assert.equal(queue.status(),200);const questions=(await queue.json()).questions
  console.log(JSON.stringify({check:'synthetic queue',total:questions.length,historical:questions.filter(q=>q.transaction?.date<'2026-09-01').length}))
  for(const width of [390,430,768,1280]){
   await page.setViewportSize({width,height:900});await page.goto(`${origin}/home`);await screenshot(`home-final-${width}`)
   await page.goto(`${origin}/check-in`);await screenshot(`check-in-final-${width}`)
  }
  pass('Home and Check-in responsive surfaces')
 }
 if(process.argv.includes('--mileage')){
  stage='historical-mileage-entered';await page.setViewportSize({width:390,height:900});await page.goto(`${origin}/mileage`)
  const fields=page.locator('input[aria-label^="Business miles"]');await fields.first().waitFor();stage='historical-mileage-fields';assert.equal(await fields.count(),2)
  await fields.nth(0).fill('1000');await fields.nth(1).fill('200');stage='historical-mileage-save'
  const refreshed=page.waitForNavigation({waitUntil:'domcontentloaded'})
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/onboarding/historical-mileage'&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Save business miles',exact:true}).evaluate(button=>{button.click();button.click()});assert.equal((await saved).status(),200);await refreshed
  const current=await admin.from('current_historical_mileage').select('answer,periods,vehicle_id').eq('business_id',fixture.businessId).single()
  assert.equal(current.data.answer,'entered');assert.equal(current.data.periods.reduce((sum,p)=>sum+p.milesMilli,0),1200000);assert.equal(current.data.vehicle_id,null)
  await screenshot('historical-mileage-saved-390');pass('historical miles saved after deferral; missing vehicle facts remain unresolved')
 }
 if(process.argv.includes('--checkout-retries')){
  stage='catch-up-retries'
  const request=(data)=>context.request.post(`${origin}/api/onboarding/catch-up`,{data})
  const first=await request({startMonth:'2025-12',agreed:true,expectedTotalCents:2000});assert.equal(first.status(),200);const one=await first.json();assert(one.url)
  const retry=await request({startMonth:'2025-12',agreed:true,expectedTotalCents:2000});assert.equal(retry.status(),200);assert.equal((await retry.json()).url,one.url)
  const changed=await request({startMonth:'2025-11',agreed:true,expectedTotalCents:4000});assert.equal(changed.status(),200);assert((await changed.json()).url)
  const restored=await request({startMonth:'2026-01'});assert.equal(restored.status(),200);assert((await restored.json()).ready)
  const orders=await admin.from('customer_catch_up_orders').select('paid_at,canceled_at,amount_cents').eq('business_id',fixture.businessId)
  assert.equal(orders.data.filter(o=>o.paid_at).length,1);assert.equal(orders.data.filter(o=>!o.paid_at&&!o.canceled_at).length,0)
  pass('catch-up retries reuse checkout; changed months retire old payment pages; no extra payment')
 }
 if(process.argv.includes('--accounts')){
  stage='account-use';await page.goto(`${origin}/get-started`);await page.waitForTimeout(2000);await screenshot('account-use-before-390');
  const groups=page.getByRole('group',{name:'How do you use this account?',exact:true});const count=await groups.count();assert(count>=2)
  const premature=await context.request.post(`${origin}/api/onboarding/setup`,{data:{timezone:'America/Phoenix'}});assert.equal(premature.status(),409)
  for(let i=0;i<count;i++){
   const choice=groups.nth(i).getByRole('radio',{name:i===0?'Business and personal':'Business only',exact:true});if(await choice.isChecked())continue
   const saved=page.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/bookkeeping\/accounts\/.+\/use$/.test(new URL(r.url()).pathname),{timeout:90000})
   await choice.click();assert.equal((await saved).status(),200)
  }
  await page.getByText('0 accounts still need a choice',{exact:true}).waitFor()
  for(const width of [390,430,768,1280]){await page.setViewportSize({width,height:900});await screenshot(`account-use-complete-${width}`)}
  pass('all connected accounts classified with mixed and business-only semantics')
  await page.getByRole('button',{name:'Start using WriteOffs',exact:true}).click();await page.waitForURL('**/home',{timeout:30000})
  for(const width of [390,430,768,1280]){await page.setViewportSize({width,height:900});await screenshot(`home-fresh-${width}`)}
  pass('optional receipts and get started finish at Home')

 }
 if(process.argv.includes('--connect')){
  stage='plaid-connect';await page.goto(`${origin}/get-started`);await page.getByRole('button',{name:'Connect my accounts',exact:true}).click()
  const plaid=page.frameLocator('iframe[title="Plaid Link"]');await plaid.locator('button').first().waitFor({timeout:30000})
  await plaid.getByRole('button',{name:'Continue without phone number',exact:true}).click();await page.waitForTimeout(1500)
  await plaid.getByPlaceholder('Search',{exact:true}).fill('First Platypus');await plaid.getByRole('button',{name:/^First Platypus Bank/}).click();await page.waitForTimeout(1500)
  await plaid.getByRole('button',{name:'First Platypus Bank',exact:true}).click();await page.waitForTimeout(1500)
  await plaid.locator('input').nth(0).fill('user_good');await plaid.locator('input').nth(1).fill('pass_good');await plaid.getByRole('button',{name:'Submit',exact:true}).click();await page.waitForTimeout(10000);await screenshot('plaid-sandbox-selection-390')
  await plaid.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Tell Betti how you use these accounts',exact:true}).waitFor({timeout:90000});await screenshot('account-use-before-390');pass('First Platypus connection returns connected accounts')

 }
 if(process.argv.includes('--finish-onboarding')){
  stage='historical-mileage-defer';await page.getByRole('button',{name:'I’ll come back to this',exact:true}).click()
  await page.getByRole('radio',{name:/Connect my accounts/}).waitFor()
  const history=await admin.from('current_historical_mileage').select('answer,periods').eq('business_id',fixture.businessId).single();assert.deepEqual(history.data,{answer:'deferred',periods:null});pass('historical mileage deferral persists without zero')
  await page.getByRole('radio',{name:/Connect my accounts/}).check();await screenshot('connect-first-390');await page.getByRole('button',{name:'Continue',exact:true}).click()
  stage='welcome-summary';await page.getByRole('heading',{name:'You’re ready to use WriteOffs.',exact:true}).waitFor();assert(await page.getByText('Existing business · Started March 2022',{exact:true}).count());await screenshot('welcome-summary-390')
  await page.getByRole('button',{name:'Start using WriteOffs',exact:true}).click();await page.waitForURL('**/get-started')
  assert.equal(await page.getByText('Weekly check-in day',{exact:true}).count(),0);await screenshot('get-started-390');pass('welcome and get started without weekly-day requirement')
  stage='plaid-open';await page.getByRole('button',{name:'Connect my accounts',exact:true}).click()
  await page.locator('iframe').first().waitFor({timeout:30000});await page.waitForTimeout(2000)
  console.log(JSON.stringify({check:'Plaid frames',frames:await page.locator('iframe').evaluateAll(nodes=>nodes.map(n=>({title:n.title})))}));pass('Plaid Link opens')
 }
 if(process.argv.includes('--onboard')){
  stage='onboarding-business'
  await page.getByLabel(/Business name/).fill('Phase One Repair')
  await page.getByLabel('What does your business do?',{exact:true}).fill('I repair kitchen equipment for local cafes.')
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  stage='onboarding-fit';await page.getByRole('heading',{name:'How do you report this business on your taxes?',exact:true}).waitFor();await screenshot('product-fit-390')
  await page.getByRole('radio',{name:/With my personal tax return/}).check();await page.getByRole('button',{name:'Continue',exact:true}).click()
  stage='onboarding-history';await page.getByRole('radio',{name:'This business already exists',exact:true}).check();await page.getByLabel('When did the business start?',{exact:true}).fill('2022-03');await screenshot('business-month-390');await page.getByRole('button',{name:'Continue',exact:true}).click()
  stage='onboarding-materials';await page.getByRole('group',{name:'Customer-job materials',exact:true}).getByRole('radio').first().check();await page.getByRole('group',{name:'Products kept for future sale',exact:true}).getByRole('radio',{name:'No',exact:true}).check();await screenshot('materials-facts-390');await page.getByRole('button',{name:'Continue',exact:true}).click()
  stage='catch-up-quote';await page.getByRole('heading',{name:'How far back should Betti organize your books?',exact:true}).waitFor();assert.equal(await page.getByText('How have customer-job materials usually been handled at tax time?').count(),0)
  await page.getByText('No catch-up charge.',{exact:true}).waitFor();pass('current month is included')
  await page.getByRole('radio',{name:'Start with last month',exact:true}).check();await page.getByText('No catch-up charge.',{exact:true}).waitFor();pass('previous month is included')
  await page.getByRole('radio',{name:'Start January 1',exact:true}).check();await page.getByText('7 additional historical months × $20 = $140, one time.',{exact:true}).waitFor();await screenshot('catch-up-consent-390')
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('alert').waitFor()
  const before=await admin.from('customer_catch_up_orders').select('id').eq('business_id',fixture.businessId);assert.equal(before.data.length,0,'No silent catch-up order')
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL(u=>u.hostname==='checkout.stripe.com',{timeout:30000})
  await writeFile(`${dir}/catch-up-checkout-url.txt`,page.url(),{mode:0o600});pass('explicit $140 catch-up consent opens one-time checkout')
 }
 if(process.argv.includes('--pay-catch-up')){
  stage='catch-up-payment';await page.goto(await readFile(`${dir}/catch-up-checkout-url.txt`,'utf8'),{waitUntil:'commit'});await page.waitForTimeout(4000)
  await screenshot('catch-up-stripe-390')
  if(await page.locator('input[name="cardNumber"]').count()){
   await page.locator('input[name="cardNumber"]').fill('4242424242424242');await page.locator('input[name="cardExpiry"]').fill('1230');await page.locator('input[name="cardCvc"]').fill('123');await page.locator('input[name="billingName"]').fill('Phase One Synthetic Customer');await page.locator('input[name="billingPostalCode"]').fill('85001')
  }
  if(await page.locator('input[name="enableStripePass"]').count())await page.locator('input[name="enableStripePass"]').uncheck()
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(u=>u.origin===origin,{timeout:90000,waitUntil:'commit'})
  await page.getByRole('heading',{name:'How many business miles have you driven so far this year?',exact:true}).waitFor({timeout:45000})
  const order=await admin.from('customer_catch_up_orders').select('amount_cents,paid_at').eq('business_id',fixture.businessId).single();assert.equal(order.data.amount_cents,14000);assert(order.data.paid_at)
  await screenshot('historical-mileage-390');pass('one-time Sandbox catch-up payment activates selected months')
 }
 if(process.argv.includes('--pay')){
  stage='stripe-load';await page.goto(await readFile(`${dir}/checkout-url.txt`,'utf8'),{waitUntil:'commit'})
  stage='stripe-select-card';pass('checkout document loaded')
  await page.waitForTimeout(3000)
  await page.getByText('Card',{exact:true}).waitFor({timeout:30000});await page.getByText('Card',{exact:true}).click({force:true})
  stage='stripe-card-fields'
  await page.waitForTimeout(1500)
  await page.getByLabel('Card number',{exact:true}).fill('4242424242424242')
  await page.getByLabel('Expiration',{exact:true}).fill('1230')
  await page.locator('input[name="cardCvc"]').fill('123')
  stage='stripe-billing-name';await page.locator('input[name="billingName"]').fill('Phase One Synthetic Customer')
  stage='stripe-postal';await page.getByLabel('ZIP',{exact:true}).fill('85001')
  if(await page.locator('input[name="enableStripePass"]').count())await page.locator('input[name="enableStripePass"]').uncheck()
  stage='sandbox-payment'
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(u=>u.origin===origin,{timeout:90000,waitUntil:'commit'})
  await page.getByRole('heading',{name:'Tell us about your business.',exact:true}).waitFor({timeout:45000})
  const membership=await admin.from('businesses').select('id').eq('owner_user_id',fixture.userId).single();assert(!membership.error);fixture.businessId=membership.data.id
  const active=await admin.from('business_memberships').select('plan,lifecycle,authority').eq('business_id',fixture.businessId).single();assert.deepEqual(active.data,{plan:'business',lifecycle:'active',authority:'stripe'})
  await writeFile(`${dir}/fresh-fixture.json`,JSON.stringify(fixture),{mode:0o600})
  await screenshot('onboarding-business-390');pass('Sandbox payment activates the single membership')
 }
 if(process.argv.includes('--checkout')){
  stage='stripe-checkout'
  await page.getByRole('button',{name:'Start WriteOffs — $39/month',exact:true}).waitFor()
  const started=page.waitForResponse(r=>r.url().endsWith('/api/checkout')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Start WriteOffs — $39/month',exact:true}).click()
  assert((await started).ok(),'Checkout API succeeds')
  await page.waitForURL(u=>u.hostname==='checkout.stripe.com',{timeout:30000})
  await page.locator('input').first().waitFor()
  console.log(JSON.stringify({check:'sandbox checkout fields',fields:await page.locator('input,button,select').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,name:n.getAttribute('name'),type:n.getAttribute('type'),label:n.getAttribute('aria-label'),text:n.tagName==='BUTTON'?n.textContent?.slice(0,70):undefined})))}))
  await writeFile(`${dir}/checkout-url.txt`,page.url(),{mode:0o600})
 }
 await writeFile(`${dir}/cookies.json`,JSON.stringify(await context.cookies()),{mode:0o600})
 assert.equal(pageErrors.length,0,'No browser errors');pass('checkpoint');
} catch(error){if(!(await page.locator('img[alt="QR code for authenticator app setup"]').count()))await page.screenshot({path:`${dir}/failure-${stage}.png`,fullPage:true}).catch(()=>{});console.error(JSON.stringify({stage,result:'failed',errorType:error.name,...(stage.startsWith('historical-mileage')?{detail:error.message.replace(/https?:\/\/[^\s]+/g,'[url]').slice(0,700)}:{})}));process.exitCode=1}
finally{await browser.close()}
