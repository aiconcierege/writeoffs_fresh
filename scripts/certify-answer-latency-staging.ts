/** REAL HOSTED STAGING: one isolated synthetic requested-loan upload, no customer answers. */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'
const dir=process.env.ROUTING_FIXTURE_DIR!,origin=process.env.CERTIFICATION_ORIGIN??'https://writeoffs-fresh-staging.vercel.app'; assert(/^\/private\/tmp\/writeoffs-routing-latency-[a-z0-9-]+$/.test(dir))
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
async function main(){
 process.umask(0o077)
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(process.env.WRITEOFFS_ENVIRONMENT,'staging');assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(`${dir}/fixture.json`,'utf8'))
 assert(!['d785186b-16db-47e5-ab02-e59fd1ae311b','2c0ddbb3-6650-42a4-aafa-3685f7efe288'].includes(f.businessId))
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 const jar=new Map<string,string>(),db=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)

 const browser=await chromium.launch({headless:true}),samples:Record<string,unknown>[]=[]
 try{
 const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'})
 await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
 const page=await context.newPage();page.setDefaultTimeout(20000)
 const seen=new Set<string>(),deadline=Date.now()+20*60_000
 for(let turn=0;turn<35;turn++){
  if(['refund_confirmation','incoming_classification','outgoing_classification','hypothesis_confirmation','percentage','insurance','purchase_purpose','exception_sweep','uncertainty','deferral'].every(kind=>samples.some(row=>row.kind===kind)))break
  const w=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'}),a=w.nextAction
  if(!a){
   if(w.betti.genuinelyProcessing+w.betti.queued+w.betti.retryScheduled>0){assert(Date.now()<deadline,'PROCESSING_DID_NOT_SETTLE');await page.waitForTimeout(3000);turn--;continue}
   break
  }
  assert(!seen.has(a.id+':'+a.version),'REPEATED_ACTION');seen.add(a.id+':'+a.version)
  let path='',data:Record<string,unknown>={},kind='',label=''
  const headers:Record<string,string>={'x-betti-guided':'1'}
  const q=a.question,merchant=q?.transaction.merchant??a.transaction?.merchant??''
  if(a.type==='evidence_opportunity'){
   path='/api/bookkeeping/work/evidence';data={requestId:randomUUID(),actionId:a.id,version:a.version,items:a.items,response:'none',documentIds:[]};kind='receipt_none'
  }else if(a.type==='personal_exception_sweep'){
   path='/api/bookkeeping/work/answer';data={requestId:randomUUID(),actionId:a.id,version:a.version,items:a.items,disposition:'completed',answers:{}};kind='exception_sweep'
  }else if(a.type==='special_transaction'){
   const r=await context.request.get(origin+`/api/bookkeeping/records/${a.recordIds[0]}/special`);assert(r.ok());const special=(await r.json()).work
   path=`/api/bookkeeping/records/${a.recordIds[0]}/special`
   if(special.kind==='refund'&&special.candidates.length===1){data={expected:special.decisionId,requestId:randomUUID(),action:'refund_link',original:special.candidates[0].recordId};kind='refund_confirmation';label='Yes, that’s it'}
   else {data={expected:special.decisionId,requestId:randomUUID(),action:'defer'};kind='special_deferral'}
  }else if(q){
   path=`/api/bookkeeping/questions/${q.id}`;headers['if-match']=q.version
   if(q.kind==='percentage'){data={action:'deduction_fact',value:60};kind='percentage'}
   else if(q.kind==='business_purpose'){data={action:'business_purpose',businessPurpose:/STATE FARM/i.test(merchant)?'business insurance':'Business cards and marketing flyers for my business'};kind=/STATE FARM/i.test(merchant)?'insurance':'purchase_purpose'}
   else if(q.confirmation){data={action:'transaction_type',activity:'earned_money'};kind='hypothesis_confirmation'}
   else if(q.kind==='transaction_type'){
    if(/ATM|EMILY/.test(merchant)){data={action:'not_sure'};kind='uncertainty'}
    else if(/CASH DEPOSIT/.test(merchant)){data={action:'defer'};kind='deferral'}
    else {assert(q.transaction.amountCents!=null);data={action:'transaction_type',activity:q.transaction.amountCents>0?'earned_money':'purchase'};kind=q.transaction.amountCents>0?'incoming_classification':'outgoing_classification'}
   }else throw Error('UNSUPPORTED_QUESTION_'+q.kind)
  }else throw Error('UNSUPPORTED_ACTION_'+a.type)
  if(process.env.LATENCY_BROWSER_ALL==='1')label=({receipt_none:'I don’t have any',exception_sweep:'They’re all for the business',special_deferral:'I’ll come back to this',percentage:'Continue',insurance:'Business insurance',purchase_purpose:'Continue',hypothesis_confirmation:'Yes, that’s right',uncertainty:'I’m not sure',deferral:'I’ll come back to this',incoming_classification:'Payment from a customer',outgoing_classification:'A purchase'} as Record<string,string>)[kind]??label
  let started=0,requestMs:number|null=null,ackMs:number|null=null,renderMs:number|null=null
  let r
  if(label){
   await page.goto(origin+'/check-in');await page.getByRole('button',{name:label,exact:true}).waitFor()
   if(kind==='percentage')await page.getByLabel('Business use percentage',{exact:true}).fill('60')
   if(kind==='purchase_purpose')await page.locator('#purpose').fill(String(data.businessPurpose))
   page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===path)requestMs=Date.now()-started})
   await page.evaluate(()=>{const w=window as unknown as {latency?:{old:string|null;ids:string[];click?:number;ack?:number}};w.latency={old:document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id')??null,ids:[]};document.addEventListener('click',()=>{w.latency!.click=performance.now()},{once:true,capture:true});new MutationObserver(()=>{const m=w.latency!;if(m.click&&!m.ack&&document.querySelector('.betti-transition-feedback'))m.ack=performance.now()-m.click;const id=document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id');if(id&&id!==m.old&&!m.ids.includes(id))m.ids.push(id)}).observe(document,{subtree:true,childList:true,attributes:true})})
   const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===path)
   started=Date.now();await page.getByRole('button',{name:label,exact:true}).click()
   await page.locator('.betti-transition-feedback').waitFor();ackMs=Date.now()-started;r=await response
  }else {started=Date.now();r=await context.request.post(origin+path,{data,headers,timeout:30000})}
  const responseMs=Date.now()-started,payload=await r.json()
  samples.push({turn,kind,status:r.status(),responseMs,requestMs,ackMs,timing:r.headers()['server-timing'],nextType:payload.work?.nextAction?.type});await writeFile(`${dir}/latency-samples.json`,JSON.stringify(samples,null,2))
  assert(r.ok(),'ANSWER_FAILED_'+kind+'_'+r.status());assert(payload.ok)
  assert(payload.work&&(!payload.work.index||payload.work.index.summaryCurrent===true),'CONTINUATION_REQUIRED')
  if(label){const next=payload.work.nextAction;if(next)await page.waitForFunction(id=>document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id')===id,next.id,{timeout:20000}).catch(async()=>{await page.getByText(next.question?.transaction.merchant??next.transaction?.merchant,{exact:true}).first().waitFor()});renderMs=Date.now()-started;const observed=await page.evaluate(()=>(window as unknown as {latency:{ids:string[];ack?:number}}).latency);assert.deepEqual(observed.ids,next?[next.id]:[],'INTERMEDIATE_ACTION_FLASH');Object.assign(samples.at(-1)!,{renderMs,visibleAcknowledgmentMs:observed.ack,noIntermediateAction:true});await writeFile(`${dir}/latency-samples.json`,JSON.stringify(samples,null,2))}
  console.log(JSON.stringify({kind,responseMs,renderMs}))
  // Verify the post-command continuation against a fresh canonical read before
  // another fact is supplied; no optimistic local queue advancement.
  const current=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
  if(!current.betti.genuinelyProcessing&&!current.betti.queued)assert.equal(payload.work.nextAction?.id,current.nextAction?.id,'CONTINUATION_MISMATCH')
 }
 assert(samples.length>=10,'INSUFFICIENT_MEASUREMENTS')
 const report=await getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-24',currency:'USD'})
 const tx=await db.from('financial_transactions').select('id',{count:'exact',head:true}).eq('business_id',f.businessId);assert.equal(tx.count,24)
 await writeFile(`${dir}/latency-result.json`,JSON.stringify({samples,transactions:tx.count,totals:[report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents]},null,2));console.log(JSON.stringify({passed:true,samples:samples.length,totals:[report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents]}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'FAILED');process.exitCode=1})
