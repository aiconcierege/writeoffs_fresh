// Synthetic, dedicated staging only. Does not open or mutate the frozen customer.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'

const dir='/private/tmp/writeoffs-routing-evidence-first',origin='https://writeoffs-fresh-staging.vercel.app'
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
async function documents(){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([650,850])
 const parts=[['DESERT PRINT SHOP','Receipt # PRINT104','May 9, 2026','500 business cards and promotional flyers','Subtotal $200.00','Tax $18.40','Total $218.40'],
  ['STATE FARM INSURANCE','Receipt # POLICY925','May 24, 2026','Commercial liability insurance','Total $118.75']]
 parts.forEach((part,index)=>part.forEach((text,line)=>page.drawText(text,{x:25+index*320,y:800-line*20,size:10,font})))
 await writeFile(`${dir}/two-receipts-one-page.pdf`,await pdf.save())
 const bill=await PDFDocument.create(),billFont=await bill.embedFont(StandardFonts.Helvetica)
 for(const lines of [['VERIZON WIRELESS','Invoice # VZ202605','May 8, 2026','Wireless phone service','Page 1 of 2'],
  ['VERIZON WIRELESS','Invoice # VZ202605','Wireless phone service continued','Total $146.28','Page 2 of 2']]){
  const p=bill.addPage([600,800]);lines.forEach((text,i)=>p.drawText(text,{x:40,y:740-i*25,size:13,font:billFont}))
 }
 await writeFile(`${dir}/phone-bill-two-pages.pdf`,await bill.save())
}
async function main(){
 process.umask(0o077)
 const mode=process.argv[2];assert(['--upload','--verify','--duplicate'].includes(mode))
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(process.env.WRITEOFFS_ENVIRONMENT,'staging');assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(`${dir}/fixture.json`,'utf8'))
 assert.notEqual(f.businessId,'d785186b-16db-47e5-ab02-e59fd1ae311b')
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 const jar=new Map<string,string>(),db=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 if(mode==='--verify'){
  const work=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
  const report=await getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-23',currency:'USD'})
  const questions=work.customer.actionable.filter(a=>a.question).map(a=>({merchant:a.question!.transaction.merchant,kind:a.question!.kind,prompt:a.question!.prompt}))
  const regions=await db.from('receipt_source_regions').select('receipt_id,source_sha256,regions').eq('business_id',f.businessId)
  const receipts=await db.from('current_bookkeeping_receipt_extractions').select('receipt_id,merchant,occurred_on,total_amount_cents,raw_payload').eq('business_id',f.businessId)
  const financial=await db.from('financial_transactions').select('id',{count:'exact',head:true}).eq('business_id',f.businessId)
  const receiptOnly=await db.from('bookkeeping_records').select('id',{count:'exact',head:true}).eq('business_id',f.businessId).eq('source_kind','receipt')
  const answers=await db.from('bookkeeping_review_events').select('id',{count:'exact',head:true}).eq('business_id',f.businessId).eq('event_type','answered')
  for(const result of [regions,receipts,financial,receiptOnly,answers])assert(!result.error,'SYNTHETIC_EVIDENCE_READ_FAILED')
  const evidence={synthetic:true,at:new Date().toISOString(),questions,financialTransactions:financial.count,receiptOnlyRecords:receiptOnly.count,transactionAnswers:answers.count,
   logicalReceipts:receipts.data?.length,splitReceiptParts:regions.data?.length,
   amounts:receipts.data?.map(r=>({merchant:r.merchant,total:r.total_amount_cents,tax:r.raw_payload?.taxAmountCents??null})),
   income:report.businessIncomeCents,expenses:report.businessExpensesCents,profit:report.businessProfitCents,
   evidenceOpportunityRemaining:work.customer.actionable.some(a=>a.type==='evidence_opportunity'),processing:work.betti.jobs.length}
  await writeFile(`${dir}/evidence-observed.json`,JSON.stringify(evidence,null,2))
  assert.equal(financial.count,24);assert.equal(receiptOnly.count,0);assert.equal(answers.count,0)
  assert.equal(receipts.data?.length,3);assert.equal(regions.data?.length,2)
  assert(!questions.some(q=>/print shop|state farm/i.test(q.merchant)),'RECEIPT_DID_NOT_RESOLVE_SPECIFIC_FACT')
  assert(questions.some(q=>/verizon/i.test(q.merchant)&&q.kind==='percentage'),'PHONE_ALLOCATION_FACT_WAS_LOST')
  assert.equal(evidence.evidenceOpportunityRemaining,false)
  assert.deepEqual([report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents],[210052,142573,67479])
  console.log(JSON.stringify({...evidence,passed:true}));return
 }
 if(mode==='--upload')await documents()
 else await Promise.all(['two-receipts-one-page.pdf','phone-bill-two-pages.pdf'].map(name=>readFile(`${dir}/${name}`)))
 const browser=await chromium.launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
  const page=await context.newPage();await page.goto(origin+(mode==='--duplicate'?'/import':'/check-in'))
  if(mode==='--upload')await page.getByRole('heading',{name:'Have receipts? Send them first.',exact:true}).waitFor()
  await page.screenshot({path:`${dir}/${mode.slice(2)}-evidence-before-1280.png`,fullPage:true})
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/${mode.slice(2)}-evidence-before-390.png`,fullPage:true})
  const result=mode==='--upload'?page.waitForResponse(r=>r.url().endsWith('/api/bookkeeping/work/evidence')&&r.request().method()==='POST',{timeout:60000}):null
  await page.locator('input[type=file]').first().setInputFiles([`${dir}/two-receipts-one-page.pdf`,`${dir}/phone-bill-two-pages.pdf`])
  if(mode==='--upload'){const response=await result!;assert(response.ok(),'EVIDENCE_ACKNOWLEDGMENT_FAILED')}
  else await page.getByRole('status').filter({hasText:/2 documents received/}).waitFor({timeout:60000})
  await page.screenshot({path:`${dir}/${mode.slice(2)}-evidence-received-390.png`,fullPage:true})
  console.log(JSON.stringify({synthetic:true,uploaded:true,mode}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'EVIDENCE_CERTIFICATION_FAILED');process.exitCode=1})
