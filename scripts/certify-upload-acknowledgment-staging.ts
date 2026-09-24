/** Hosted upload acknowledgment timings. Only explicit synthetic latency fixtures. */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
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

 const browser=await chromium.launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:process.env.LATENCY_DESKTOP==='1'?1280:390,height:900},reducedMotion:'reduce'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
  const page=await context.newPage();await page.goto(origin+'/import')
  await page.getByLabel('Send Betti documents',{exact:true}).waitFor({state:'attached'})
  let started=0,storageStartedMs:number|null=null,storageStoredMs:number|null=null,registrationStartedMs:number|null=null
  page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/storage/v1/object/'))storageStartedMs=Date.now()-started;if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/documents')registrationStartedMs=Date.now()-started})
  page.on('response',r=>{if(r.request().method()==='POST'&&new URL(r.url()).pathname.startsWith('/storage/v1/object/')&&r.ok())storageStoredMs=Date.now()-started})
  await page.evaluate(()=>{const w=window as unknown as {uploadClock:number;uploadAck?:number};w.uploadClock=performance.now();new MutationObserver(()=>{if(w.uploadAck==null&&/Received — Betti is reviewing it|1 document received/.test(document.body.innerText))w.uploadAck=performance.now()-w.uploadClock}).observe(document,{childList:true,subtree:true})})
  const registration=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/documents')
  started=Date.now();await page.getByLabel('Send Betti documents',{exact:true}).setInputFiles('/private/tmp/writeoffs-routing-evidence-first/two-receipts-one-page.pdf')
  const response=await registration;assert(response.ok(),'REGISTRATION_FAILED');const registeredQueuedMs=Date.now()-started,documentId=(await response.json()).document.id
  await page.waitForFunction(()=>(window as unknown as {uploadAck?:number}).uploadAck!=null)
  const acknowledgmentMs=await page.evaluate(()=>(window as unknown as {uploadAck:number}).uploadAck)
  const result:Record<string,unknown>={evidence:'HOSTED SYNTHETIC UPLOAD',storageStartedMs,storageStoredMs,registrationStartedMs,registeredQueuedMs,acknowledgmentMs,serverTiming:response.headers()['server-timing'],bytesReceivedAtServer:'not separately instrumented',completedMs:null}
  await writeFile(dir+'/upload-timing.json',JSON.stringify(result,null,2))
  const deadline=Date.now()+180000
  while(Date.now()<deadline){
   const status=await db.from('current_customer_document_status').select('state').eq('id',documentId).single();assert(!status.error)
   if(['completed','needs_attention','unreadable','dead_letter'].includes(status.data.state)){result.completedMs=Date.now()-started;result.state=status.data.state;break}
   await new Promise(r=>setTimeout(r,2000))
  }
  const jobs=await admin.from('receipt_processing_jobs').select('state,job_type,created_at,claimed_at,completed_at').eq('business_id',f.businessId).eq('document_id',documentId);assert(!jobs.error)
  result.jobs=jobs.data
  const regions=await admin.from('receipt_source_regions').select('receipt_id').eq('business_id',f.businessId).eq('document_id',documentId);assert(!regions.error)
  const receiptIds=(regions.data??[]).map(r=>r.receipt_id)
  result.receiptParts=receiptIds.length
  if(receiptIds.length){
   const extracted=await admin.from('bookkeeping_receipt_extractions').select('created_at').eq('business_id',f.businessId).in('receipt_id',receiptIds);assert(!extracted.error)
   const links=await admin.from('bookkeeping_document_links').select('created_at,bookkeeping_record_id').eq('business_id',f.businessId).in('receipt_id',receiptIds).is('revoked_at',null);assert(!links.error)
   const registeredAt=Math.min(...(jobs.data??[]).map(j=>Date.parse(j.created_at)))
   result.extractionEventAfterRegistrationMs=(extracted.data??[]).map(e=>Date.parse(e.created_at)-registeredAt)
   result.matchEventAfterRegistrationMs=(links.data??[]).map(e=>Date.parse(e.created_at)-registeredAt)
   result.matchedDocuments=links.data?.length??0
   const records=[...new Set((links.data??[]).map(l=>l.bookkeeping_record_id))]
   if(records.length)while(Date.now()<deadline){
    const pending=await admin.from('bookkeeping_processing_jobs').select('id').eq('business_id',f.businessId).in('bookkeeping_record_id',records).in('state',['pending','processing','retryable']);assert(!pending.error)
    if(!pending.data.length){result.reassessmentReadyObservedMs=Date.now()-started;break}
    await new Promise(r=>setTimeout(r,2000))
   }
  }
  await writeFile(dir+'/upload-timing.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'FAILED');process.exitCode=1})
