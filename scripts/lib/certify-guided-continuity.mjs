import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'

// Invoked only by the dedicated-staging runner after its synthetic-tenant checks.
// No reloads or page navigation are permitted after entering the conversation.
export async function certifyContinuity({page,context,client,api,screenshot,cross,origin,dir,businessId}){
 const raw=await client.rpc('read_betti_work_context',{p_business_id:businessId});assert(!raw.error)
 const loan=raw.data.records.find(r=>r.merchant==='LOAN PAYMENT - EQUIPMENT FINANCE CO');assert(loan)
 const initialHome=await context.newPage();await initialHome.goto(origin+'/home');await screenshot(initialHome,'home-catch-up-status');await initialHome.close()
 const homeEntry=process.env.CERTIFICATION_HOME_ENTRY==='true'
 const path='/api/bookkeeping/work'+(homeEntry?'':'?record='+loan.record_id)
 if(homeEntry){await page.goto(origin+'/home');await page.getByRole('link',{name:'Continue with Betti',exact:true}).click()}
 else await page.goto(origin+'/check-in?record='+loan.record_id+'&returnTo=%2Fhome')
 const navigation=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigation.push(frame.url())})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const steps=[],seen=new Set(),captures=new Set(),processingWaits=[];let persistenceMs=0,clickAt=0,expectedVersion=''
 let responseLossTested=false
 const performanceMode=process.env.CERTIFICATION_PERFORMANCE==='true', httpTimings=[]
 let renderedMs=0,acknowledgmentMs=null,commandServerTiming=null
 page.on('response',async r=>{if(r.url().includes('/api/bookkeeping/'))httpTimings.push({path:new URL(r.url()).pathname,method:r.request().method(),status:r.status(),serverTiming:(await r.allHeaders())['server-timing']??null})})
 async function save(label,loseResponse=false){
  clickAt=Date.now()
  if(performanceMode)loseResponse=false
  await page.evaluate(()=>{window.__bettiPerf={};document.addEventListener('click',event=>{const button=event.target.closest('button');window.__bettiPerf.click=performance.now();requestAnimationFrame(()=>{window.__bettiPerf.pending=performance.now();window.__bettiPerf.pendingVisible=Boolean(button?.disabled||[...document.querySelectorAll('[role="status"]')].some(node=>/saving/i.test(node.textContent)))})},{once:true,capture:true})})
  let resolveSaved
  const saved=new Promise(resolve=>{resolveSaved=resolve})
  const handler=async route=>{
   if(route.request().method()!=='POST'||route.request().url().endsWith('/reconcile'))return route.continue()
   try{
    const response=await route.fetch({timeout:60000})
    resolveSaved({status:response.status(),body:await response.text(),serverTiming:response.headers()['server-timing']??null})
    if(loseResponse){responseLossTested=true;await route.abort('failed')}
    else await route.fulfill({response}).catch(()=>{}) // Client timeout can precede a confirmed commit.
   }catch(error){resolveSaved({status:0,body:String(error)});await route.abort().catch(()=>{})}
  }
  await page.route('**/api/bookkeeping/**',handler)
  try{
   await page.locator(`[data-guided-version="${expectedVersion}"]`).getByRole('button',{name:label,exact:typeof label==='string'}).click()
   const response=await saved;persistenceMs=Date.now()-clickAt;commandServerTiming=response.serverTiming??null
   assert.equal(response.status,200,response.body)
   // Observe actual screen advancement, not an obsolete independently read snapshot.
   await page.waitForFunction(version=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-version')!==version,expectedVersion,{timeout:60000})
   renderedMs=Date.now()-clickAt
   acknowledgmentMs=await page.evaluate(()=>window.__bettiPerf.pending-window.__bettiPerf.click)
   if(performanceMode)assert(await page.evaluate(()=>window.__bettiPerf.pendingVisible),'No immediate pending acknowledgment')
  }finally{await page.unroute('**/api/bookkeeping/**',handler)}
 }
 try{for(let turn=0;turn<200;turn++){
  const work=await api(context,path),action=work.nextAction
  if(!action){
   if(work.betti.jobs.length){
    if(!captures.has('processing')){await screenshot(page,'genuine-processing');captures.add('processing')}
    // Normal worker completion only. A long wait may require the explicit bounded-read control.
    let ready=false;const startedAt=Date.now();let explicitChecks=0
    for(let n=0;n<45;n++){
     await page.waitForTimeout(4000)
     if(await page.getByRole('button',{name:'Check for the next step',exact:true}).isVisible()){await page.getByRole('button',{name:'Check for the next step',exact:true}).click();explicitChecks++}
     const next=await api(context,path)
     if(next.nextAction||!next.betti.jobs.length){ready=true;break}
    }
    processingWaits.push({elapsedMs:Date.now()-startedAt,explicitChecks,settled:ready});
    if(!ready){
     const held=await api(context,path)
     assert.equal(held.customer.actionableCount,0,'Ready work was stranded during processing')
     assert(held.betti.genuinelyProcessing+held.betti.queued+held.betti.retryScheduled>0,'Processing claim lacks actual work')
     assert(await page.getByRole('heading',{name:'I’m updating your books.',exact:true}).isVisible())
     assert(await page.getByRole('link',{name:'Back to your books',exact:true}).isVisible())
     break // Truthful long-processing exit, not a claim that workers settled.
    }
    continue
   }
   assert.equal(work.customer.actionableCount,0)
   await screenshot(page,'only-deferred-completion');break
  }
  if(await page.locator('[data-guided-action]').getAttribute('data-guided-version')!==action.version){await page.waitForTimeout(1500);continue}
  assert.equal(await page.getByRole('button',{name:'Keep going with Betti',exact:true}).count(),0)
  const key=action.id+':'+action.version;assert(!seen.has(key),'Repeated handled action');seen.add(key)
  const merchant=action.transaction?.merchant??action.question?.transaction.merchant??null
  if(!captures.has(action.type)){await screenshot(page,action.type);captures.add(action.type)}
  await cross(context,page)
  await page.locator('.betti-error').waitFor({state:'hidden',timeout:45000})
  if(await page.locator('[data-guided-action]').getAttribute('data-guided-version')!==action.version){seen.delete(key);continue}
  expectedVersion=action.version
  let disposition='completed'
  if(action.type==='account_use')await save(/Business only/)
  else if(action.type==='personal_exception_sweep')await save('Nothing here is personal')
  else if(action.type==='mixed_use_sweep')await save('Nothing is partly personal')
  else if(action.type==='receipt_upload_sweep'){
   if(process.env.CERTIFICATION_RECEIPT_LATER==='true'&&action.workstream==='catch_up'){
    const before=await client.rpc('read_betti_work_context',{p_business_id:businessId});assert(!before.error)
    const receiptStates=state=>state.records.filter(r=>action.recordIds.includes(r.record_id)).map(r=>[r.record_id,r.receipt_unavailable,r.decision_id]).sort()
    disposition='deferred';await save('I’ll send receipts later')
    const after=await client.rpc('read_betti_work_context',{p_business_id:businessId});assert(!after.error)
    assert.deepEqual(receiptStates(after.data),receiptStates(before.data),'Later changed documentation availability or working treatment')
    assert(after.data.guidedReviews.some(event=>event.action==='receipt_upload_sweep'&&event.disposition==='deferred'),'Missing canonical receipt deferral')
   }else await save('Continue with Betti')
  }
  else if(action.type==='receipt_availability')await save('That’s all the receipts I have')
  else if(merchant==='REFUND - OFFICE DEPOT'){
   if(await page.getByRole('button',{name:'Returned by the store',exact:true}).count())await save('Returned by the store')
   else{await page.getByRole('radio',{name:/OFFICE DEPOT/}).check();await save('Yes, link this return')}
  }else if(['ZELLE FROM JANE MORRIS - INV 1041','ACH DEPOSIT UNIDENTIFIED'].includes(merchant)){
   // Explicit synthetic-customer facts: these two deposits paid for client work.
   await save('Payment from a customer')
  }else if(action.question?.kind==='percentage'){
   await page.getByLabel('Business use percentage',{exact:true}).fill('80');await save('Continue')
  }else{
   if(merchant==='LOAN PAYMENT - EQUIPMENT FINANCE CO')await screenshot(page,'loan-document-request')
   disposition='deferred';await save(/come back to this/i,merchant==='LOAN PAYMENT - EQUIPMENT FINANCE CO'&&!responseLossTested)
  }
  const after=await api(context,path)
  // Do not wait for an old API snapshot to reappear after a worker advances priority.
  await page.waitForTimeout(100)
  const visibleMs=Date.now()-clickAt
  steps.push({at:new Date().toISOString(),number:steps.length+1,type:action.type,merchant,workstream:action.workstream,disposition,next:after.nextAction?{type:after.nextAction.type,workstream:after.nextAction.workstream}:null,persistedMs:persistenceMs,nextVisibleMs:visibleMs,renderedMs,acknowledgmentMs,commandServerTiming,unnecessaryStop:false})
  await writeFile(`${dir}/continuity-progress.json`,JSON.stringify(steps,null,2))
  console.log('Continuous action',steps.length,action.type,action.workstream,disposition,'next:',after.nextAction?.type??after.readiness.phase)
  if(merchant==='LOAN PAYMENT - EQUIPMENT FINANCE CO')await screenshot(page,'post-deferral-continuation')
  if(steps.length===6)await screenshot(page,'after-six-actions')
 }
 }catch(error){
  await page.screenshot({path:`${dir}/browser/continuity-failure.png`,fullPage:true})
  await writeFile(`${dir}/continuity-failure.json`,JSON.stringify({error:String(error),steps,httpTimings,processingWaits,navigation,ui:await page.locator('[data-guided-action]').getAttribute('data-guided-action'),version:await page.locator('[data-guided-action]').getAttribute('data-guided-version'),projection:await api(context,path)},null,2))
  throw error
 }
 if(!performanceMode)assert(responseLossTested,'Committed-response-loss recovery was not exercised')
 assert(steps.length>=10,'Fewer than ten actions exercised')
 assert(steps.some(s=>s.workstream==='current'),'Current work was not exercised')
 assert(steps.some(s=>s.merchant==='LOAN PAYMENT - EQUIPMENT FINANCE CO'&&s.disposition==='deferred'))
 assert(steps.some(s=>s.merchant==='REFUND - OFFICE DEPOT'&&s.disposition==='completed'))
 assert(steps.some(s=>s.type==='receipt_availability'))
 assert.deepEqual(navigation,[],'Conversation navigated or reloaded');assert.deepEqual(errors,[])
 const final=await cross(context,page);assert.equal(final.w.customer.actionableCount,0)
 const home=await context.newPage();await home.goto(origin+'/home');await screenshot(home,'home-only-deferred');await home.close()
 await writeFile(`${dir}/continuity-result.json`,JSON.stringify({result:'PASS',steps,httpTimings,processingWaits,responseLossTested,navigation,errors,finalActions:final.w.customer.actionableCount,deferred:final.w.customer.deferredCount,finalProcessing:final.w.betti.genuinelyProcessing+final.w.betti.queued+final.w.betti.retryScheduled},null,2))
}
