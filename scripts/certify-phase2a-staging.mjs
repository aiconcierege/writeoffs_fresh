import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,origin='https://writeoffs-fresh-staging.vercel.app'
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
const fixture=JSON.parse(await readFile(process.argv.includes('--empty')?'/private/tmp/writeoffs-phase2a-empty.json':'/private/tmp/writeoffs-phase2a-fixture.json','utf8'))
const finalSmoke=process.argv.includes('--final-smoke')
const dir='/private/tmp/writeoffs-phase2a-proof';await mkdir(dir,{recursive:true})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
const cookies=new Map(),supabase=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}})
const login=await supabase.auth.signInWithPassword({email:fixture.email,password:fixture.password});assert(!login.error);assert.equal(login.data.user.user_metadata.synthetic_phase2a_validation,true)
const enrollment=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:`Phase 2A ${Date.now()}`});assert(!enrollment.error)
const factorId=enrollment.data.id;assert(!(await supabase.auth.mfa.challengeAndVerify({factorId,code:totp(enrollment.data.totp.secret)})).error)
const browser=await chromium.launch({headless:true});let stage='start',failurePage
try {
 const context=await browser.newContext({viewport:{width:1280,height:800},timezoneId:'America/Phoenix'})
 await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
 const page=await context.newPage(),errors=[];failurePage=page;console.log('Synthetic MFA verified; browser started.');
 const work=await supabase.from('customer_transaction_work').select('record_id').limit(1);console.log(JSON.stringify({workRead:work.status,error:work.error?.message}));
 const started=Date.now(),bounded=await supabase.rpc('list_customer_transaction_work',{});console.log(JSON.stringify({boundedRead:bounded.status,rows:bounded.data?.length,elapsedMs:Date.now()-started,error:bounded.error?.message}));assert(!bounded.error);if(process.argv.includes('--query-only')){await browser.close();await supabase.auth.mfa.unenroll({factorId});await supabase.auth.signOut();process.exit(0)}page.on('pageerror',()=>errors.push('pageerror'));page.on('console',msg=>{if(msg.type()==='error')errors.push('consoleerror')})
 const snapshot=async(name)=>{await page.waitForTimeout(350);await page.evaluate(()=>scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.screenshot({path:`${dir}/${name}.png`,fullPage:true});await page.screenshot({path:`${dir}/${name}-viewport.png`,fullPage:false})}
 const queue=async()=>{const r=await context.request.get(`${origin}/api/bookkeeping/questions`);assert.equal(r.status(),200);return (await r.json()).questions}
 if(process.argv.includes('--empty')){for(const width of [390,430,768,1280]){await page.setViewportSize({width,height:844});await page.goto(`${origin}/home`);await page.getByRole('heading',{name:'Your books are current.',exact:true}).waitFor();await snapshot(`home-current-${width}`)}console.log('Passed: no-work/current-books Home at four widths.')}
 if(!process.argv.includes('--actions-only')&&!process.argv.includes('--empty')) {
 stage='views'
 for(const width of [390,430,768,1280]) {
  await page.setViewportSize({width,height:width<500?844:800})
  for(const [view,label] of [['all','All'],['receipts','Needs a receipt'],['receipt-only','Receipt only'],['review','Needs review']]){
   await page.goto(`${origin}/transactions?view=${view}`);await page.getByRole('heading',{name:'Transactions',exact:true}).waitFor();await page.getByRole('navigation',{name:'Transaction work views'}).getByRole('link',{name:label,exact:true}).waitFor();await snapshot(`${view}-${width}`)
   if(finalSmoke&&view==='all'){await page.locator('.review-row-select input').nth(1).check();await page.locator('.review-transaction-row').last().scrollIntoViewIfNeeded();const toolbar=await page.locator('.review-bulk-actions').boundingBox();const header=await page.locator('header').first().boundingBox();assert(toolbar&&header&&toolbar.y>=header.y+header.height&&toolbar.y+toolbar.height<=page.viewportSize().height,'Selected count and actions stay below navigation while scrolling');await page.screenshot({path:`${dir}/selected-scrolled-${width}.png`});await page.getByRole('button',{name:'Clear selection',exact:true}).click()}
  }
  await page.goto(`${origin}/check-in`);await page.locator('h1').waitFor();await snapshot(`check-in-${width}`)
  const button=page.getByRole('button',{name:'Continue',exact:true});if(await button.count()) {const box=await button.boundingBox();assert(box&&box.y+box.height<=page.viewportSize().height,'Continue fits viewport')}
  await page.goto(`${origin}/home`);await page.getByRole('link',{name:finalSmoke?'Answer Betti’s questions':'Review missing receipts',exact:true}).waitFor();await snapshot(`home-${width}`)
 }
 stage='filters-selection'
 await page.goto(`${origin}/transactions?view=all&q=FUN`);assert.equal(await page.locator('.review-transaction-row').count(),5)
 await page.getByLabel('Select all on this page',{exact:true}).check();await page.getByText('5 selected',{exact:true}).waitFor()
 await page.getByLabel('Select all on this page',{exact:true}).uncheck();await page.getByText('0 selected',{exact:true}).waitFor()
 await page.locator('.review-row-select input').first().focus();await page.keyboard.press('Space');await page.getByText('1 selected',{exact:true}).waitFor()
 await page.locator('.review-row-open').first().click();await page.getByRole('heading',{name:'How Betti handled this'}).waitFor();await page.getByRole('link',{name:'← Transactions',exact:true}).click()
 await page.goto(`${origin}/transactions?view=all&category=meals`);assert((await page.locator('.review-transaction-row').count())>0)
 await page.goto(`${origin}/transactions?view=all`);assert.equal(await page.locator('.review-transaction-row').count(),50);await page.getByLabel('Select all on this page',{exact:true}).check();await page.getByText('50 selected',{exact:true}).waitFor();await page.getByRole('link',{name:'Next page',exact:true}).click();await page.getByText('0 selected',{exact:true}).waitFor();assert.equal(await page.locator('.review-transaction-row').count(),finalSmoke?16:15)
 if(finalSmoke){
  await page.goto(`${origin}/transactions?view=receipt-only`);await page.getByLabel('Select all on this page',{exact:true}).check();await page.getByText('1 selected',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Remove from business',exact:true}).isDisabled());await snapshot('receipt-only-selected');await page.locator('.review-row-open').first().click();await page.waitForURL(`${origin}/receipts`);assert.equal(new URL(page.url()).pathname,'/receipts');
 }
 console.log('Passed: four views at 390/430/768/1280, laptop/mobile Continue visibility, search/category, keyboard selection, scoped 50-row select-all, pagination reset, independent row opening.')
 }
 if(process.argv.includes('--actions')||process.argv.includes('--actions-only')) {
  stage='account-use'
  for(let index=0;index<fixture.accounts.length;index++) {const current=await supabase.from('current_financial_account_use').select('designation').eq('financial_account_id',fixture.accounts[index]).maybeSingle();if(current.data?.designation===(index?'business_and_personal':'business_only'))continue;const response=await context.request.post(`${origin}/api/bookkeeping/accounts/${fixture.accounts[index]}/use`,{data:{designation:index?'business_and_personal':'business_only',effectiveAt:'2025-01-01T00:00:00Z',requestId:crypto.randomUUID()}});assert.equal(response.status(),200)}
  stage='receipt-bulk'
  await page.setViewportSize({width:390,height:844});await page.goto(`${origin}/home`);await page.getByRole('link',{name:'Review missing receipts',exact:true}).click()
  for(let i=0;i<3;i++)await page.locator('.review-row-select input').nth(i).check()
  await page.getByRole('button',{name:'Continue with 3 purchases',exact:true}).click();await snapshot('receipt-confirm-390')
  let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/bookkeeping/guided-review'))posts++})
  const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/bookkeeping/guided-review'))
  await page.getByRole('button',{name:'I don’t have these receipts',exact:true}).evaluate(button=>{button.click();button.click()})
  const response=await saved;assert.equal(response.status(),200);assert.equal(posts,1)
  const payload=response.request().postDataJSON();const retry=await context.request.post(`${origin}/api/bookkeeping/guided-review`,{data:payload});assert.equal(retry.status(),200)
  const receiptResult=await response.json();await page.getByRole('heading',{name:'Your review is saved.',exact:true}).waitFor();await snapshot('receipt-saved-390')
  await page.reload();for(const item of receiptResult.results) {const state=await supabase.from('customer_transaction_work').select('receipt_unavailable,treatment').eq('record_id',item.recordId).single();assert.equal(state.data.receipt_unavailable,true);assert.equal(state.data.treatment,'business')}
  stage='personal-sweep'
  const before=await queue();await page.goto(`${origin}/transactions?scope=historical&q=FUN`);await page.locator('.review-row-select input').first().check();await page.getByRole('button',{name:'Remove from business',exact:true}).click();const removed=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/bookkeeping/guided-review'));await page.getByRole('button',{name:'Remove from business',exact:true}).click();const removalResponse=await removed;assert.equal(removalResponse.status(),200);const removalResult=await removalResponse.json();await page.getByRole('heading',{name:'Your review is saved.',exact:true}).waitFor();const after=await queue();assert(!after.some(q=>removalResult.results.some(item=>item.recordId===q.recordId)),'Removed purchases have no askable questions');console.log(JSON.stringify({beforeSweep:before.length,afterSweep:after.length,removedQuestionsAbsent:true}))
  stage='defer'
  await page.goto(`${origin}/check-in`);const defer=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/questions/'));await page.getByRole('button',{name:'I’ll come back to this',exact:true}).click();assert.equal((await defer).status(),200);assert.equal(await page.getByText('1 answered',{exact:false}).count(),0);await page.reload();assert((await queue()).length<after.length)
  await page.goto(`${origin}/home`);await page.getByRole('link',{name:'Review missing receipts',exact:true}).waitFor()
  stage='finish-receipt-guidance'
  for(let pass=0;pass<5;pass++) {
   await page.goto(`${origin}/transactions?view=receipts`)
   if(!await page.getByLabel('Select all on this page',{exact:true}).count())break
   await page.getByLabel('Select all on this page',{exact:true}).check()
   await page.getByRole('button',{name:/Continue with \d+ purchases?/}).click()
   const save=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/bookkeeping/guided-review'))
   await page.getByRole('button',{name:'I don’t have these receipts',exact:true}).click();assert.equal((await save).status(),200)
   await page.getByRole('heading',{name:'Your review is saved.',exact:true}).waitFor()
  }
  await page.goto(`${origin}/home`);await page.getByRole('link',{name:'Review older purchases',exact:true}).waitFor();await snapshot('home-after-receipts-390')
  stage='complete-personal-sweep'
  await page.getByRole('link',{name:'Review older purchases',exact:true}).click();await page.getByLabel('Select all on this page',{exact:true}).check()
  await page.getByRole('button',{name:'Mark selected as reviewed',exact:true}).click()
  const swept=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/bookkeeping/guided-review'))
  await page.getByRole('button',{name:'I’ve reviewed these purchases',exact:true}).click();assert.equal((await swept).status(),200)
  await page.getByRole('heading',{name:'Your review is saved.',exact:true}).waitFor()
  await page.goto(`${origin}/home`);await page.getByRole('link',{name:'Answer Betti’s questions',exact:true}).waitFor();await snapshot('home-exceptions-390')
  stage='answer-exception'
  await page.getByRole('link',{name:'Answer Betti’s questions',exact:true}).click()
  await page.locator('#purpose').fill('Printer paper for customer design projects')
  const answer=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/questions/'))
  await page.getByRole('button',{name:'Continue',exact:true}).evaluate(button=>{button.click();button.click()});assert.equal((await answer).status(),200)
  await page.getByText('1 answered',{exact:false}).waitFor();await page.reload()
  console.log('Passed: completing receipt review advances Home to older purchases; explicit sweep completion advances Home to remaining questions; synthetic exception answer saves and refreshes.')
  console.log('Passed: guided Home→receipts→selection→confirmation, single double-click request, replay idempotency, durable unavailable state, personal sweep reduces questions, deferral does not count as answered, refresh preserves progress.')
 }
 assert.deepEqual(errors,[],'No browser page or console errors')
 await writeFile(`${dir}/result.json`,JSON.stringify({passed:true,widths:[390,430,768,1280],actions:process.argv.includes('--actions')||process.argv.includes('--actions-only'),browserErrors:errors.length},null,2))
} catch(error){if(failurePage){await failurePage.screenshot({path:`${dir}/failure.png`,fullPage:true});console.log('Failure path: '+new URL(failurePage.url()).pathname)}console.error(`Phase 2A browser failure at ${stage}: ${error.message}`);process.exitCode=1} finally {await browser.close();await supabase.auth.mfa.unenroll({factorId});await supabase.auth.signOut()}
