// Presentation-only browser review. Existing explicitly synthetic staging account.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
process.loadEnvFile('.env.staging.local')
const origin=process.env.POLISH_ORIGIN??'https://writeoffs-fresh-staging.vercel.app'
assert(['http://localhost:3110','http://localhost:3112','https://writeoffs-fresh-staging.vercel.app'].includes(origin))
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
const fixture=JSON.parse(await readFile(process.env.POLISH_FIXTURE??'/private/tmp/writeoffs-polish-fixture.json','utf8'))
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const metadata=(await admin.auth.admin.getUserById(fixture.userId)).data.user?.user_metadata
assert(metadata?.synthetic_ux1===true||metadata?.synthetic_guided_contract===true,'Explicit synthetic customer required')
const cookies=new Map(),client=createServerClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}})
assert(!(await client.auth.signInWithPassword({email:fixture.email,password:fixture.password})).error,'Synthetic login failed')
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...fixture.totpSecret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8)
counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15,code=String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
assert(!(await client.auth.mfa.challengeAndVerify({factorId:fixture.factorId,code})).error,'Synthetic MFA failed')
const dir=process.env.POLISH_OUTPUT??(origin.includes('localhost')?'/private/tmp/writeoffs-utility-local':'docs/audits/authenticated-utilities/screenshots')
await mkdir(dir,{recursive:true})
const browser=await chromium.launch({headless:true}),results=[]
try{
 const context=await browser.newContext({timezoneId:'America/Phoenix'})
 await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:origin.startsWith('https:'),sameSite:'Lax'})))
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(/hydration/i.test(error.message)?'hydration':/chunk/i.test(error.message)?'chunk-load':error.name))
 if(process.env.POLISH_INSPECT==='1'){const r=await context.request.get(origin+'/api/bookkeeping/work');assert(r.ok());const w=await r.json();console.log(JSON.stringify({next:w.nextAction?.type,prompt:w.nextAction?.question?.prompt,actions:w.customer?.actionable?.map(a=>({type:a.type,prompt:a.question?.prompt})),deferred:w.customer?.deferredCount}));await browser.close();process.exit()}
 if(process.env.POLISH_VEHICLE_ONLY==='1'){
  await page.goto(origin+'/mileage',{waitUntil:'networkidle'})
  if(await page.getByLabel('Vehicle name',{exact:true}).count()){
   await page.getByLabel('Vehicle name',{exact:true}).fill('My car')
   const response=page.waitForResponse(r=>r.url().endsWith('/api/mileage/vehicles')&&r.request().method()==='POST')
   await page.getByRole('button',{name:'Save vehicle',exact:true}).click();assert((await response).ok())
  }
  await page.getByRole('heading',{name:'Add a business trip',exact:true}).waitFor()
  assert.equal(await page.locator('.mileage-log-row').count(),0)
  for(const width of [390,430,1280,1440]){await page.setViewportSize({width,height:900});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:`${dir}/mileage-no-trips-${width}.png`,fullPage:true})}
  await writeFile(`${dir}/vehicle-setup.json`,JSON.stringify({syntheticOnly:true,vehicleSetupThroughUI:true,tripEntryAvailable:true,emptyHistory:true,overflow:false},null,2)+'\n');await browser.close();process.exit()
 }
 if(process.env.POLISH_TRIP_ONLY==='1'){
  await page.goto(origin+'/mileage',{waitUntil:'networkidle'})
  const purpose='Synthetic premium utility review',trip=page.locator('article.record-row').filter({hasText:purpose})
  let created=false
  if(!await trip.count()){
   await page.getByLabel('Business miles',{exact:true}).fill('12.5');await page.getByLabel(/Business purpose/).fill(purpose)
   const response=page.waitForResponse(r=>r.url().endsWith('/api/mileage/create')&&r.request().method()==='POST')
   await page.getByRole('button',{name:'Save mileage',exact:true}).click();assert((await response).ok());created=true
  }
  await trip.waitFor();assert(/12\.5\s+miles/.test(await trip.innerText()))
  const csv=await context.request.get(origin+'/api/mileage/export?year='+new Date().getFullYear());assert(csv.ok());assert((await csv.text()).includes(purpose))
  for(const width of [390,430,1280,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await page.screenshot({path:`${dir}/mileage-populated-${width}.png`,fullPage:true})}
  await writeFile(`${dir}/trip-behavior.json`,JSON.stringify({syntheticOnly:true,createdThroughUI:created,recordedMiles:12.5,historyVisible:true,csvContainsTrip:true,overflow:false},null,2)+'\n')
  console.log('Synthetic trip entry, history and export passed.');await browser.close();process.exit()
 }
 if(process.env.POLISH_SELECTION_ONLY==='1'){
  for(const width of [390,430,1280,1440]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/transactions',{waitUntil:'networkidle'})
   assert.equal(await page.getByRole('checkbox').count(),0)
   await page.getByRole('button',{name:'Select',exact:true}).focus();await page.keyboard.press('Enter')
   await page.getByRole('checkbox').nth(1).check()
   assert(await page.locator('.review-bulk-actions').isVisible())
   await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})})
   assert.equal(await page.evaluate(()=>scrollY),0)
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))
   await page.screenshot({path:`${dir}/transactions-selection-${width}.png`,fullPage:true})
   await page.getByRole('button',{name:'Done selecting',exact:true}).click();assert.equal(await page.getByRole('checkbox').count(),0)
  }
  await writeFile(`${dir}/selection-behavior.json`,JSON.stringify({normalModeNoCheckboxes:true,keyboardEntry:true,selectedActionsVisible:true,exitClearsSelection:true,widths:[390,430,1280,1440],overflow:false},null,2)+'\n')
  console.log('Selection mode passed at all four widths.');await browser.close();process.exit()
 }
 if(process.env.POLISH_LEASED_ACTUAL==='1'||process.env.POLISH_LEASED_ONLY==='1'){
  await page.goto(origin+'/mileage',{waitUntil:'networkidle'})
  const ownership=page.getByRole('combobox',{name:/Do you own or lease it/})
  if(!await ownership.isVisible())await page.locator('.vehicle-settings>summary').click()
  if(await ownership.inputValue()!=='leased'){
   const response=page.waitForResponse(r=>r.url().includes('/tax')&&r.request().method()==='PATCH')
   await ownership.selectOption('leased');assert((await response).ok(),'Synthetic lease choice');await page.waitForLoadState('networkidle')
  }
  const actual=page.getByRole('button',{name:/^Track my vehicle costs/})
  if(await actual.getAttribute('aria-pressed')!=='true'){
   await actual.waitFor({state:'visible'});await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(x=>x.textContent.startsWith('Track my vehicle costs'))?.disabled)
   const response=page.waitForResponse(r=>r.url().includes('/tax')&&r.request().method()==='PATCH')
   await actual.click();assert((await response).ok(),'Synthetic actual-cost choice');await page.waitForLoadState('networkidle')
  }
  await page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.startsWith('Track my vehicle costs'));return button?.getAttribute('aria-pressed')==='true'&&!button.disabled})
  if(!await ownership.isVisible())await page.locator('.vehicle-settings>summary').click()
  await page.getByText(/We’ll finish the yearly mileage total after/).waitFor()
  assert.equal(await page.getByLabel(new RegExp('total miles.*'+new Date().getFullYear(),'i')).count(),0,'No premature annual denominator')
  assert(await page.getByRole('heading',{name:'Add a business trip',exact:true}).isVisible())
  for(const width of [390,430,1280,1440]){await page.setViewportSize({width,height:900});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${dir}/mileage-leased-actual-${width}.png`,fullPage:true})}
  await writeFile(`${dir}/mileage-behavior.json`,JSON.stringify({syntheticOnly:true,leased:true,actualCosts:true,currentYearAnnualQuestionAbsent:true,tripEntryAvailable:true},null,2)+'\n')
  if(process.env.POLISH_LEASED_ONLY==='1'){console.log('Leased actual-cost timing passed through staging UI.');await browser.close();process.exit()}
 }
 const routes=(process.env.POLISH_ROUTES??'home,check-in,transactions,mileage,invoices,reports').split(',');assert(routes.every(x=>['home','check-in','transactions','mileage','invoices','reports'].includes(x)))
 for(const route of process.env.POLISH_ZOOM_ONLY==='1'?[]:routes){
  for(const width of [390,430,1280,1440]){
   await page.setViewportSize({width,height:900})
   await page.goto(origin+'/'+route,{waitUntil:'networkidle'})
   assert.equal(new URL(page.url()).pathname,'/'+route,'Unexpected route redirect')
   await page.evaluate(()=>document.fonts.ready)
   if(route==='reports')await page.locator('.reports-summary').waitFor()
   await page.screenshot({path:`${dir}/${route}-${width}.png`,fullPage:true})
   if(width===390&&process.env.POLISH_AXE==='1'){
    await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'})
    const violations=await page.evaluate(async()=>{const r=await window.axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))})
    await writeFile(`${dir}/${route}-accessibility.json`,JSON.stringify(violations,null,2)+'\n')
    assert.equal(violations.length,0,`${route}: accessibility violations`)
   }
   const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,mainCount:document.querySelectorAll('main').length,title:document.querySelector('h1')?.textContent,contentTop:document.querySelector('h1')?.getBoundingClientRect().top,menuRight:[...document.querySelectorAll('header summary')].find(x=>x.textContent.includes('Menu'))?.getBoundingClientRect().right}))
   assert(!metrics.overflow,`${route} ${width}: overflow`);assert.equal(metrics.mainCount,1)
   assert(metrics.menuRight>width/2,'Menu must remain on the right')
   results.push({route,width,...metrics})
  }
 }
 if(process.env.POLISH_SKIP_EXTRA==='1'){await writeFile(`${dir}/browser-errors.json`,JSON.stringify(errors)+'\n');assert.equal(errors.length,0);await writeFile(`${dir}/results.json`,JSON.stringify({origin,results,browserErrors:errors.length},null,2)+'\n');console.log('Selected presentation screenshots captured.');process.exitCode=0;await browser.close();process.exit()}
 if(process.env.POLISH_INVOICE_CREATE==='1'){
  await page.goto(origin+'/reports',{waitUntil:'networkidle'})
  const before=await page.locator('.reports-summary').innerText()
  await page.goto(origin+'/invoices',{waitUntil:'networkidle'})
  let createdThisRun=false
  const existing=page.locator('.invoice-row').filter({hasText:process.env.POLISH_INVOICE_CUSTOMER??'Synthetic utility review'})
  if(!await existing.count()){
   if(!await page.getByLabel('Customer',{exact:true}).isVisible())await page.locator('.invoice-create-toggle').click()
   await page.getByLabel('Customer',{exact:true}).fill(process.env.POLISH_INVOICE_CUSTOMER??'Synthetic utility review')
   await page.getByLabel('Amount in US dollars',{exact:true}).fill('175.25')
   await page.getByLabel('What was the work?',{exact:true}).fill('Synthetic design review')
   const response=page.waitForResponse(r=>r.url().endsWith('/api/invoices')&&r.request().method()==='POST')
   await page.locator('.invoice-composer form').getByRole('button',{name:'Create invoice',exact:true}).click()
   assert((await response).ok(),'Synthetic invoice creation');createdThisRun=true
   await page.waitForURL(/\/invoices\/[^/]+$/)
  }
  await page.goto(origin+'/reports',{waitUntil:'networkidle'})
  assert.equal(await page.locator('.reports-summary').innerText(),before,'Creating an invoice must not record income')
  for(const width of [390,430,1280,1440]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/invoices',{waitUntil:'networkidle'})
   assert(!await page.getByLabel('Customer',{exact:true}).isVisible(),'Returning invoices start with activity')
   assert(await page.locator('.invoice-row').filter({hasText:process.env.POLISH_INVOICE_CUSTOMER??'Synthetic utility review'}).count())
   await page.screenshot({path:`${dir}/invoices-populated-${width}.png`,fullPage:true})
   await page.locator('.invoice-create-toggle').focus();await page.keyboard.press('Enter')
   assert(await page.getByLabel('Customer',{exact:true}).isVisible(),'Keyboard opens invoice creation')
   await page.screenshot({path:`${dir}/invoices-create-${width}.png`,fullPage:true})
   await page.getByLabel('Customer',{exact:true}).fill('Unsaved synthetic draft')
   const email=page.locator('.workspace-disclosure summary').filter({hasText:'Add customer email'});await email.focus();await page.keyboard.press('Enter')
   assert(await page.getByLabel(/Customer email/).isVisible(),'Optional email opens by keyboard')
   await page.getByRole('button',{name:/Back to invoices/}).click()
   await page.waitForFunction(()=>document.activeElement===document.querySelector('.invoice-create-toggle'),{},{timeout:5000})
   assert(await page.locator('.invoice-create-toggle').evaluate(el=>el===document.activeElement),'Closing returns keyboard focus')
   await page.locator('.invoice-create-toggle').click();assert.equal(await page.getByLabel('Customer',{exact:true}).inputValue(),'Unsaved synthetic draft','Closing preserves the unsaved draft')
  }
  await writeFile(`${dir}/invoice-behavior.json`,JSON.stringify({syntheticOnly:true,createdThroughUI:createdThisRun,reusedExistingInvoice:!createdThisRun,canonicalReportsUnchanged:true,returningActivityFirst:true,keyboardCreation:true,keyboardOptionalFields:true,closeRestoresFocus:true,closePreservesDraft:true},null,2)+'\n')
 }
 for(const width of [390,430,1280,1440]){
  await page.setViewportSize({width,height:900})
  const view=process.env.POLISH_CAPTURE_VIEWS==='receipts'?'receipts':'review'
  await page.goto(origin+'/transactions?view='+view,{waitUntil:'networkidle'})
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))
  await page.screenshot({path:`${dir}/transactions-${process.env.POLISH_CAPTURE_VIEWS==='receipts'?'receipts':'attention'}-${width}.png`,fullPage:true})
 }
 await page.goto(origin+'/home',{waitUntil:'networkidle'})
 const coverage=page.locator('.source-coverage summary')
 if(await coverage.count()){
  await coverage.click();await page.setViewportSize({width:390,height:900})
  await page.screenshot({path:`${dir}/home-missing-records-390.png`,fullPage:true})
 }
 await page.goto(origin+'/transactions',{waitUntil:'networkidle'})
 const firstMerchant=await page.locator('.transaction-merchant').first().textContent().catch(()=>null)
 if(firstMerchant){await page.getByRole('searchbox',{name:'Search transactions'}).fill(firstMerchant);await page.getByRole('searchbox',{name:'Search transactions'}).press('Enter');await page.waitForURL(url=>url.searchParams.get('q')===firstMerchant);assert(await page.locator('.transaction-merchant').filter({hasText:firstMerchant}).count(),'Search preserves matching activity')}
 // Read-only keyboard, filtering and zoom checks; no financial facts changed.
 await page.setViewportSize({width:390,height:900})
 await page.goto(origin+'/transactions',{waitUntil:'networkidle'})
 const filters=page.locator('.transaction-filters summary');await filters.focus();await page.keyboard.press('Enter')
 assert(await page.getByLabel('From',{exact:true}).isVisible(),'Keyboard opens date filters')
 await page.screenshot({path:`${dir}/transactions-filters-390.png`,fullPage:true})
 await page.keyboard.press('Tab');assert(await page.getByLabel('From',{exact:true}).evaluate(el=>el===document.activeElement),'Date filter focus order')
 const mode=page.getByRole('button',{name:'Select',exact:true});if(await mode.count()){assert.equal(await page.getByRole('checkbox').count(),0,'Normal activity has no checkbox column');await mode.focus();await page.keyboard.press('Enter')}
 const selectAll=page.getByLabel('Select all on this page',{exact:true});if(await selectAll.count()){await selectAll.check();assert(await page.locator('.review-bulk-actions').isVisible(),'Bulk controls remain available');await selectAll.uncheck();await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})});await page.screenshot({path:`${dir}/transactions-selection-390.png`,fullPage:true});await page.getByRole('button',{name:'Done selecting',exact:true}).click();assert.equal(await page.getByRole('checkbox').count(),0,'Exit clears selection mode')}
 await page.goto(origin+'/mileage',{waitUntil:'networkidle'})
 let radioKeyboard=false
 if(await page.getByRole('radio',{name:'Yes',exact:true}).count()){
  await page.getByRole('radio',{name:'Yes',exact:true}).focus();await page.keyboard.press('ArrowRight')
  assert(await page.getByRole('radio',{name:'No, business only',exact:true}).isChecked(),'Native radio keyboard behavior');radioKeyboard=true
 }
 const zoom=[]
 for(const route of routes){
  await page.goto(origin+'/'+route,{waitUntil:'networkidle'})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(async()=>{document.documentElement.style.fontSize='200%';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})
  if(route==='invoices'&&await page.locator('.invoice-create-toggle').count()){await page.locator('.invoice-create-toggle').scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollTo(0,0))}
  zoom.push({route,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),documentHeight:await page.evaluate(()=>document.documentElement.scrollHeight)})
  await page.screenshot({path:`${dir}/${route}-text200.png`,fullPage:true})
 }
 assert(zoom.every(x=>!x.overflow),'200% text must not overflow')
 await writeFile(`${dir}/accessibility.json`,JSON.stringify({keyboardFilters:true,bulkSelection:true,radioKeyboard,reducedMotion:true,textScaling:zoom},null,2)+'\n')
 if(process.env.POLISH_VEHICLE_SETUP==='1'){
  await page.goto(origin+'/mileage',{waitUntil:'networkidle'})
  if(await page.getByLabel('Vehicle name',{exact:true}).count()){
   await page.getByLabel('Vehicle name',{exact:true}).fill('Synthetic review vehicle')
   await page.getByRole('radio',{name:'Yes',exact:true}).check()
   const saved=page.waitForResponse(r=>r.url().endsWith('/api/mileage/vehicles')&&r.request().method()==='POST')
   await page.getByRole('button',{name:'Save vehicle',exact:true}).click()
   assert((await saved).ok(),'Synthetic vehicle setup')
  }
  await page.getByRole('heading',{name:'Add a business trip',exact:true}).waitFor()
  for(const width of [390,430,1280,1440]){
   await page.setViewportSize({width,height:900})
   await page.screenshot({path:`${dir}/mileage-trip-${width}.png`,fullPage:true})
  }
 }
 assert.equal(errors.length,0,'Browser runtime error')
 if(results.length)await writeFile(`${dir}/results.json`,JSON.stringify({origin,results,browserErrors:errors.length},null,2)+'\n')
 console.log(`Captured ${results.length} real authenticated renders; no overflow or browser errors.`)
}finally{await browser.close()}
