/** Dedicated staging, explicitly synthetic owners only. Never load frozen customers. */
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium,webkit} from '@playwright/test'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'
const origin='https://writeoffs-fresh-staging.vercel.app',dir=process.env.ROUTING_FIXTURE_DIR!
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
async function main(){
 process.umask(0o077);assert(/^\/private\/tmp\/writeoffs-routing-catchup-v2-[a-z0-9-]+$/.test(dir))
 const engine=process.env.CERT_BROWSER??'chromium';assert(['chromium','webkit'].includes(engine));const mode=process.argv[2];assert(['statement','account','complete','visual','slow','heic','photos','retry-photos','finish-receipts','receipts','reviews','inspect','none','later'].includes(mode))
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(process.env.WRITEOFFS_ENVIRONMENT,'staging');assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(`${dir}/fixture.json`,'utf8'));assert(!['d785186b-16db-47e5-ab02-e59fd1ae311b','2c0ddbb3-6650-42a4-aafa-3685f7efe288'].includes(f.businessId))
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 const jar=new Map<string,string>(),db=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const baselineAnswers=await db.from('bookkeeping_review_events').select('id',{count:'exact',head:true}).eq('business_id',f.businessId).eq('event_type','answered');assert(!baselineAnswers.error)
 await mkdir(`${dir}/proof`,{recursive:true});const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:process.env.CERT_DESKTOP!=='1',hasTouch:process.env.CERT_DESKTOP!=='1',timezoneId:'America/Phoenix',reducedMotion:'reduce'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
  const page=await context.newPage(),errors:string[]=[],transitions:{type:string|null;heading:string|null}[]=[]
  page.on('pageerror',e=>errors.push(e.name))
  await page.exposeFunction('recordCatchupState',(s:{type:string|null;heading:string|null})=>{const last=transitions.at(-1);if(!last||last.type!==s.type||last.heading!==s.heading)transitions.push(s)})
  await page.addInitScript(()=>{new MutationObserver(()=>{const root=document.querySelector('[data-guided-action]');if(root)(window as unknown as {recordCatchupState:(s:unknown)=>void}).recordCatchupState({type:root.getAttribute('data-guided-action'),heading:root.querySelector('h1')?.textContent??null})}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-guided-action']})})
  const work=()=>loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
  const screenshot=async(label:string)=>{for(const width of [390,430,1280,1440]){await page.setViewportSize({width,height:900});await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete),{timeout:10000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'HORIZONTAL_OVERFLOW');await page.screenshot({path:`${dir}/proof/${engine}-${process.env.CERT_DESKTOP==='1'?'desktop':'mobile'}-${label}-${width}.png`,fullPage:true})}await page.setViewportSize({width:390,height:844})}
  const waitSettled=async()=>{for(let n=0;n<240;n++){const w=await work();if(!w.betti.jobs.length&&!w.betti.missingJobs.length)return w;await page.waitForTimeout(2000)}throw Error('SYNTHETIC_PROCESSING_NOT_SETTLED')}
  const upload=async(paths:string[])=>{const registered=page.waitForResponse(r=>r.url()===origin+'/api/documents'&&r.request().method()==='POST',{timeout:30000});await page.getByLabel('Send Betti documents',{exact:true}).setInputFiles(paths);assert.equal((await registered).status(),200,'DOCUMENT_REGISTRATION_FAILED')}
  if(mode==='statement'||mode==='account'){
   if(mode==='statement'){
   const count=await admin.from('financial_transactions').select('id',{count:'exact',head:true}).eq('business_id',f.businessId);assert.equal(count.count,0,'EXPECTED_EMPTY_SYNTHETIC_OWNER')
   await page.goto(origin+'/import');await page.getByRole('heading',{name:'Send it to Betti.'}).waitFor();await screenshot('import-empty')
   await upload(['/private/tmp/writeoffs-routing-evidence-first/may.pdf']);
   for(let i=0;i<120;i++){const accounts=await db.from('financial_accounts').select('id').eq('business_id',f.businessId);if(accounts.data?.length)break;await page.waitForTimeout(2000)}
   }
   await page.goto(origin+'/check-in');const use=await db.from('current_financial_account_use').select('designation').eq('business_id',f.businessId);if(!use.data?.length)await page.getByRole('button',{name:/Business only/}).click()
   for(let i=0;i<240;i++){if(await page.getByRole('heading',{name:'Let’s gather your earlier statements.'}).isVisible())break;const check=page.getByRole('button',{name:'Check for the next step',exact:true});if(await check.isVisible())await check.click();await page.waitForTimeout(2000)}await page.getByRole('heading',{name:'Let’s gather your earlier statements.'}).waitFor();await waitSettled();await screenshot('statements')
   const w=await work();assert.equal(w.nextAction?.journey?.stage,'statements');assert.equal(w.customer.substantiveCount,0)
   assert.deepEqual(w.nextAction.journey.missingPeriods,[{from:'2026-01-01',through:'2026-04-30'},{from:'2026-06-01',through:'2026-07-31'}])
   await page.getByRole('button',{name:'Keep working with what I sent'}).click()
   await page.getByRole('heading',{name:'Before I ask you anything, send me the receipts you have.'}).waitFor({timeout:30000});await screenshot('receipts-first')
  }
  if(['receipts','finish-receipts','none','later'].includes(mode)){
   await page.goto(origin+'/check-in');assert.equal((await work()).nextAction?.journey?.stage,'receipts')
   if(mode==='receipts'){
    await upload(['/private/tmp/writeoffs-routing-evidence-first/two-receipts-one-page.pdf','/private/tmp/writeoffs-routing-evidence-first/phone-bill-two-pages.pdf'])
    await page.locator('[data-document-review]').waitFor({timeout:30000});await screenshot('document-processing')
    await page.locator('[data-document-review="ready"]').waitFor({timeout:240000});await screenshot('document-ready')
    assert(!transitions.some(t=>t.type==='material_question'),'SUBSTANTIVE_QUESTION_DURING_EVIDENCE')
    await page.getByRole('button',{name:'Continue →',exact:true}).click();await page.getByRole('heading',{name:'Any more receipts?'}).waitFor({timeout:30000});await screenshot('more-receipts')
    await page.getByRole('button',{name:'That’s all I have',exact:true}).click()
   }else if(mode==='finish-receipts'){await page.getByRole('heading',{name:'Any more receipts?'}).waitFor();await page.getByRole('button',{name:'That’s all I have',exact:true}).click()}else await page.getByRole('button',{name:mode==='none'?'I don’t have any':'I’ll do this later',exact:true}).click()
   await page.getByRole('heading',{name:'Are any of these personal?',exact:true}).waitFor({timeout:30000});await screenshot('personal-review')
  }
  if(mode==='visual'){
   await page.goto(origin+'/import');await page.getByRole('heading',{name:'Send it to Betti.'}).waitFor();await screenshot('import-populated')
   assert(await page.locator('.document-betti').evaluate(e=>e.getBoundingClientRect().height>50),'BETTI_COLLAPSED')
   await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor();await screenshot('check-in-final')
   await page.goto(origin+'/home');await page.getByRole('main').waitFor();await screenshot('home-final')
  }
  if(mode==='slow'){
   await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor()
   const before=await page.locator('[data-guided-action]').getAttribute('data-guided-id');assert(before)
   let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
   await page.route('**/api/bookkeeping/records/*/special',async route=>{const response=await route.fetch();await gate;await route.fulfill({response})})
   await page.getByRole('button',{name:'I’ll come back to this',exact:true}).click()
   await page.locator('.betti-transition-feedback').waitFor({timeout:1000})
   await page.waitForTimeout(2000);assert.equal(await page.locator('[data-guided-action]').getAttribute('data-guided-id'),before)
   assert.equal(await page.locator('.betti-transition-feedback').count(),1);release()
   await page.waitForFunction(id=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-id')!==id,before,{timeout:60000})
   assert.equal(await page.locator('.betti-error').count(),0);await screenshot('slow-response-next-turn')
  }
  if(mode==='heic'){
   assert.equal(engine,'webkit');await page.goto(origin+'/import');await page.getByRole('heading',{name:'Send it to Betti.'}).waitFor()
   assert.equal(await page.getByRole('checkbox',{name:'These photos are pages of one receipt or document',exact:true}).isChecked(),false)
   await upload(['/private/tmp/writeoffs-routing-catchup-v2-photos/two-receipts.heic']);await screenshot('heic-received');await waitSettled()
   const beforeDocs=await db.from('business_documents').select('id',{count:'exact',head:true}).eq('business_id',f.businessId)
   await upload(['/private/tmp/writeoffs-routing-catchup-v2-photos/two-receipts.heic'])
   const afterDocs=await db.from('business_documents').select('id',{count:'exact',head:true}).eq('business_id',f.businessId)
   assert.equal(afterDocs.count,beforeDocs.count,'DUPLICATE_PHOTO_CREATED_DOCUMENT')
  }
  if(mode==='complete'){
   await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor()
   const seen=new Set<string>();
   for(let n=0;n<20;n++){
    const current=await work();if(!current.nextAction)break
    const id=current.nextAction.id;assert(!seen.has(id),'ANSWERED_ACTION_REAPPEARED');seen.add(id)
    const root=page.locator('[data-guided-action]');await page.waitForFunction(id=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-id')===id,id)
    const unsure=page.getByRole('button',{name:'I’m not sure',exact:true}),defer=page.getByRole('button',{name:'I’ll come back to this',exact:true})
    await unsure.or(defer).first().waitFor();if(await unsure.isVisible())await unsure.click();else{assert(await defer.isVisible(),'NO_SUPPORTED_SYNTHETIC_UNKNOWN_RESPONSE');await defer.click()}
    await page.waitForFunction(id=>{const r=document.querySelector('[data-guided-action]');return r&&!document.querySelector('.betti-transition-feedback')&&r.getAttribute('data-guided-id')!==id},id,{timeout:60000})
    assert.equal(await page.locator('.betti-error').count(),0,'ANSWER_FAILED')
    await root.waitFor()
   }
   await page.getByRole('heading',{name:'You’re all set for now.',exact:true}).waitFor({timeout:60000})
   assert.equal(await page.getByText(/\d+ questions? left/).count(),0)
   assert(await page.getByRole('link',{name:'Back to Home',exact:true}).isVisible())
   await screenshot('completed');await page.reload();await page.getByRole('heading',{name:'You’re all set for now.',exact:true}).waitFor()
   await writeFile(`${dir}/proof/completion-actions.json`,JSON.stringify({submittedDistinctActions:seen.size,refreshStable:true},null,2))
  }
  if(mode==='photos'||mode==='retry-photos'){
   if(mode==='retry-photos'){
    const doc=await admin.from('business_documents').select('id').eq('business_id',f.businessId).eq('original_name','Receipt photos.pdf').single();assert(doc.data&&!doc.error)
    const job=await admin.from('receipt_processing_jobs').select('id,state').eq('business_id',f.businessId).eq('document_id',doc.data.id).eq('job_type','document_intake').single();assert(job.data&&!job.error)
    const retry=await admin.rpc('requeue_terminal_document_processing_job',{p_job_id:job.data.id,p_expected_state:job.data.state,p_reason:'SYNTHETIC_FIXED_SCANNED_PDF_RETRY'});assert(!retry.error&&retry.data===true)
    assert.equal((await context.request.post(origin+`/api/documents/${doc.data.id}/retry`)).status(),202)
   }else{
   await page.goto(origin+'/import');await page.getByRole('heading',{name:'Send it to Betti.'}).waitFor()
   await upload(['/private/tmp/writeoffs-routing-catchup-v2-photos/two-receipts-one-page-1.jpg'])
   const grouping=page.getByRole('checkbox',{name:'These photos are pages of one receipt or document',exact:true})
   await grouping.check();await upload(['/private/tmp/writeoffs-routing-catchup-v2-photos/phone-bill-two-pages-1.jpg','/private/tmp/writeoffs-routing-catchup-v2-photos/phone-bill-two-pages-2.jpg'])
   await screenshot('mobile-photos-received');}
   await waitSettled()
   await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor();await screenshot('after-mobile-evidence')
  }
  if(mode==='reviews'){
   await page.goto(origin+'/check-in');assert.equal((await work()).nextAction?.journey?.stage,'personal')
   await page.getByRole('button',{name:'Everything here was for my business',exact:true}).click()
   await page.getByRole('heading',{name:'Are any of these not expenses for this business?',exact:true}).waitFor({timeout:30000});await screenshot('nonexpense-review')
   await page.getByRole('button',{name:'These were all business expenses',exact:true}).click()
   await page.waitForFunction(()=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-action')!=='catch_up_journey',{timeout:30000});await screenshot('remaining-question')
  }
  if(mode==='inspect'){await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor();await screenshot('inspect');await writeFile(`${dir}/proof/canonical-inspect.json`,JSON.stringify(await work(),null,2))}
  const w=await work(),report=await getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-24',currency:'USD'})
  const answered=await db.from('bookkeeping_review_events').select('id',{count:'exact',head:true}).eq('business_id',f.businessId).eq('event_type','answered')
  const events=await db.from('betti_catch_up_events').select('stage,response,items,document_ids').eq('business_id',f.businessId).order('created_at')
  const receipts=await db.from('current_bookkeeping_receipt_extractions').select('merchant,total_amount_cents,receipt_id').eq('business_id',f.businessId)
  const tx=await db.from('financial_transactions').select('id',{count:'exact',head:true}).eq('business_id',f.businessId)
  for(const r of [answered,events,receipts,tx])assert(!r.error,'SYNTHETIC_READ_FAILED')
  const questions=w.customer.actionable.filter(a=>a.question).map(a=>({merchant:a.question!.transaction.merchant,kind:a.question!.kind,prompt:a.question!.prompt}))
  if(mode==='photos'||mode==='retry-photos'||mode==='reviews'&&dir.endsWith('-receipts')){
   assert(!questions.some(q=>/print shop|state farm/i.test(q.merchant)),'EVIDENCE_DID_NOT_REMOVE_QUESTION')
   assert(questions.some(q=>/verizon/i.test(q.merchant)&&q.kind==='percentage'),'PERCENTAGE_LOST')
   assert.equal(receipts.data?.length,3)
  }
  assert.equal(tx.count,24);if(mode!=='complete')assert.equal(answered.count,baselineAnswers.count,'UNEXPECTED_TRANSACTION_ANSWER');else assert((answered.count??0)>0,'NO_UNCERTAINTY_PERSISTED')
  assert.deepEqual([report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents],[210052,142573,67479],'WORKING_BOOKS_CHANGED')
  assert.equal(errors.length,0,'BROWSER_ERRORS')
  const result={passed:true,synthetic:true,mode,engine,at:new Date().toISOString(),transactions:tx.count,transactionAnswers:answered.count,income:report.businessIncomeCents,expenses:report.businessExpensesCents,profit:report.businessProfitCents,events:events.data?.map(e=>({stage:e.stage,response:e.response,itemCount:e.items.length,documents:e.document_ids.length})),receipts:receipts.data?.map(r=>({merchant:r.merchant,cents:r.total_amount_cents})),next:w.nextAction?.journey?.stage??w.nextAction?.type,questions,transitions,browserErrors:errors,widths:mode==='inspect'?[]:[390,430,1280,1440]}
  await writeFile(`${dir}/proof/${mode}${engine==='webkit'?'-webkit':''}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,mode,next:result.next,transactions:tx.count,answers:answered.count}))
 }catch(error){for(const context of browser.contexts())for(const page of context.pages()){await page.screenshot({path:`${dir}/proof/failure-${mode}.png`,fullPage:true}).catch(()=>{});await writeFile(`${dir}/proof/failure-${mode}.txt`,await page.locator('body').innerText().catch(()=>''))}throw error}finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'CATCH_UP_CERTIFICATION_FAILED');process.exitCode=1})
