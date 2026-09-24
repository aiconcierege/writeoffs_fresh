// Synthetic, dedicated staging only. Does not open or mutate the frozen customer.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac,createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'

const dir=process.env.ROUTING_FIXTURE_DIR??'/private/tmp/writeoffs-routing-evidence-first',origin='https://writeoffs-fresh-staging.vercel.app'
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
 const mode=process.argv[2];assert(['--upload','--verify','--duplicate','--receipt-only','--inspect-only','--profile','--loan','--irrelevant','--bank-only','--retry-loan','--set-aside','--screenshots','--scope-upload','--scope-verify','--defer-evidence'].includes(mode))
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(process.env.WRITEOFFS_ENVIRONMENT,'staging');assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(`${dir}/fixture.json`,'utf8'))
 assert.notEqual(f.businessId,'d785186b-16db-47e5-ab02-e59fd1ae311b')
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 const jar=new Map<string,string>(),db=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 if(mode==='--scope-verify'){
  const work=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
  const actions=work.customer.actionable
  assert(actions.length>0);assert.equal(work.betti.jobs.length,0,'SCOPE_PROCESSING_NOT_SETTLED')
  assert.equal(actions[0].workstream,'current');assert(actions.some(a=>a.workstream==='catch_up'),'EARLIER_WORK_MISSING')
  const result={synthetic:true,processing:work.betti.jobs.length,actions:actions.map(a=>({type:a.type,workstream:a.workstream,priority:a.priority.routingTier,question:a.question?.prompt}))}
  await writeFile(`${dir}/scope-result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));return
 }
 if(mode==='--inspect-only'){
  const report=await getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-23',currency:'USD'})
  const work=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
  const timingRead=await db.rpc('read_betti_work_inputs',{p_business_id:f.businessId,p_as_of:new Date().toISOString()})
  const receipts=await db.from('current_bookkeeping_receipt_extractions').select('merchant,total_amount_cents').eq('business_id',f.businessId)
  console.log(JSON.stringify({synthetic:true,inputTimings:timingRead.data?.timings,receiptExtractions:receipts.data,income:report.businessIncomeCents,expenses:report.businessExpensesCents,profit:report.businessProfitCents,rows:report.rows.length,processing:work.betti.jobs.length,questions:work.customer.actionable.map(a=>({type:a.type,merchant:a.question?.transaction.merchant,prompt:a.question?.prompt}))}));return
 }
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
  await writeFile(`${dir}/evidence-observed-${Date.now()}.json`,JSON.stringify(evidence,null,2))
  assert.equal(financial.count,24);assert.equal(receiptOnly.count,0);assert.equal(answers.count,0)
  assert.equal(receipts.data?.length,3);assert.equal(regions.data?.length,2)
  assert.equal(evidence.processing,0,'REASSESSMENT_NOT_SETTLED')
  assert(!questions.some(q=>/print shop|state farm/i.test(q.merchant)),'RECEIPT_DID_NOT_RESOLVE_SPECIFIC_FACT')
  assert(questions.some(q=>/verizon/i.test(q.merchant)&&q.kind==='percentage'),'PHONE_ALLOCATION_FACT_WAS_LOST')
  assert.equal(evidence.evidenceOpportunityRemaining,false)
  assert.deepEqual([report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents],[210052,142573,67479])
  const stored=await db.from('receipts').select('id,upload_fingerprint,bytes').eq('business_id',f.businessId)
  assert(!stored.error)
  for(const receipt of stored.data??[]){
   const response=await fetch(`${origin}/api/receipts/${receipt.id}/view`,{headers:{cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; ')}})
   assert(response.ok,'AUTHENTICATED_RECEIPT_PREVIEW_FAILED')
   const bytes=Buffer.from(await response.arrayBuffer())
   assert.equal(bytes.length,receipt.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.upload_fingerprint)
  }
  const passed={...evidence,verifiedReceiptPreviews:stored.data?.length,passed:true}
  await writeFile(`${dir}/evidence-passed-${Date.now()}.json`,JSON.stringify(passed,null,2))
  console.log(JSON.stringify(passed));return
 }
 if(mode==='--scope-upload'){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
  for(const [month,label,end] of [['09','September','23'],['06','June','30']]){
   const p=pdf.addPage([612,792]),put=(t:string,x:number,y:number)=>p.drawText(t,{x,y,font,size:10})
   ;['FIRST PLATYPUS BANK','Checking Statement','Account ending 0000',`Statement period: ${label} 1, 2026 - ${label} ${end}, 2026`,'Beginning balance $0.00','Ending balance $67.01'].forEach((t,i)=>put(t,40,750-i*22))
   put('Date',40,600);put('Description',100,600);put('Credits',410,600);put('Debits',500,600)
   put(`${month}/20`,40,570);put('ADOBE CREATIVE CLOUD',100,570);put('$22.99',500,570)
   put(`${month}/21`,40,540);put('ACH DEPOSIT - UNKNOWN SOURCE',100,540);put('$90.00',410,540)
  }
  await writeFile(`${dir}/current-and-earlier.pdf`,await pdf.save())
 }else if(['--profile','--retry-loan','--set-aside','--screenshots','--defer-evidence'].includes(mode)){}else if(mode==='--bank-only'){
  const before=await getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-23',currency:'USD'})
  assert.equal(before.rows.length,1);assert.equal(before.businessExpensesCents,21840,'RECEIPT_NOT_YET_ESTABLISHED')
  await writeFile(`${dir}/bank-only.csv`,'Date,Description,Amount\n2026-05-09,DESERT PRINT SHOP,-218.40\n')
 }else if(mode==='--loan'||mode==='--irrelevant'){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),p=pdf.addPage([600,800])
  const lines=mode==='--loan'?['EQUIPMENT FINANCE','Loan statement','Payment date: May 15, 2026','Total payment $450.00','Principal paid $400.00','Interest paid $50.00']:['WEEKEND GARDEN WALK','Meet at the park after breakfast.','Bring a hat and enjoy the flowers.','This is a personal invitation, not a financial record.']
  lines.forEach((t,i)=>p.drawText(t,{x:40,y:750-i*25,font,size:13}))
  await writeFile(`${dir}/${mode.slice(2)}.pdf`,await pdf.save())
 }else if(mode==='--receipt-only'){
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),p=pdf.addPage([600,800])
  ;['DESERT PRINT SHOP','Receipt # PRINT104','May 9, 2026','500 business cards and promotional flyers','Subtotal $200.00','Tax $18.40','Total $218.40'].forEach((t,i)=>p.drawText(t,{x:40,y:750-i*25,font,size:13}))
  await writeFile(`${dir}/printing-only.pdf`,await pdf.save())
 }else if(mode==='--upload')await documents()
 else await Promise.all(['two-receipts-one-page.pdf','phone-bill-two-pages.pdf'].map(name=>readFile(`${dir}/${name}`)))
 const browser=await chromium.launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
  const page=await context.newPage()
  if(mode==='--defer-evidence'){
   await page.goto(origin+'/check-in');await page.getByRole('heading',{name:'Have receipts? Send them first.',exact:true}).waitFor()
   const previous=await page.locator('[data-guided-id]').getAttribute('data-guided-id')
   await page.getByRole('button',{name:'I’ll do this later',exact:true}).click()
   await page.waitForFunction(old=>{const e=document.querySelector('[data-guided-id]');return e&&e.getAttribute('data-guided-id')!==old},previous)
   await page.getByRole('heading',{name:'What was this money from?',exact:true}).waitFor()
   const next=await page.locator('[data-guided-id]').getAttribute('data-guided-id')
   await page.reload();await page.locator('[data-guided-id]').waitFor();assert.equal(await page.locator('[data-guided-id]').getAttribute('data-guided-id'),next)
   const work=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
   assert.equal(work.nextAction?.workstream,'current')
   assert(!work.customer.actionable.some(a=>a.type==='evidence_opportunity'&&a.workstream==='current'))
   await page.setViewportSize({width:390,height:900});await page.screenshot({path:`${dir}/current-evidence-deferred.png`,fullPage:true})
   console.log(JSON.stringify({synthetic:true,deferred:true,nextScope:'current',nextQuestion:'What was this money from?',repeatInvitation:false,refreshStable:true}));return
  }
  if(mode==='--screenshots'){
   const results=[]
   for(const route of ['home','check-in','reports'])for(const width of [390,430,1280]){
    await page.setViewportSize({width,height:900});await page.goto(`${origin}/${route}`);await page.waitForLoadState('networkidle')
    assert.equal(new URL(page.url()).pathname,`/${route}`,'UNEXPECTED_AUTHENTICATED_ROUTE')
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
    assert(!overflow,'HORIZONTAL_OVERFLOW')
    await page.screenshot({path:`${dir}/final-${route}-${width}.png`,fullPage:true});results.push({route,width,overflow})
   }
   console.log(JSON.stringify({synthetic:true,screenshots:results}));return
  }
  if(mode==='--profile'){
   const results:Array<Record<string,unknown>>=[]
   await page.goto(origin+'/check-in');await page.locator('[data-guided-id]').waitFor({timeout:300000})
   for(let i=0;i<24;i++){
    const stage=page.locator('[data-guided-id]');if(!await stage.count())break
    const id=await stage.getAttribute('data-guided-id'),heading=await stage.locator('h1').innerText(),text=await stage.innerText()
    let button=page.getByRole('button',{name:'I’m not sure',exact:true}),answer='uncertain'
    const exact=(name:string)=>page.getByRole('button',{name,exact:true})
    if(await exact('I don’t have any').count()){button=exact('I don’t have any');answer='no receipts'}
    else if(await exact('They’re all for the business').count()){button=exact('They’re all for the business');answer='exception confirmation'}
    else if(await page.locator('#percentage').count()){await page.locator('#percentage').fill('60');button=exact('Continue');answer='business percentage'}
    else if(await exact('Business insurance').count()){button=exact('Business insurance');answer='insurance coverage'}
    else if(await page.locator('#purpose').count()){
     answer=/PRINT SHOP/i.test(text)?'Business cards and marketing flyers for my business':'Paid a freelance graphic designer to create a logo for my business'
     await page.locator('#purpose').fill(answer);button=exact('Continue')
    }else if(await exact('Payment from a customer').count()){button=exact('Payment from a customer');answer='customer payment'}
    else if(await exact('A purchase').count()&&/MARK REYNOLDS/i.test(text)){button=exact('A purchase');answer='purchase'}
    else if(await exact('Yes, that’s right').count()){button=exact('Yes, that’s right');answer='hypothesis confirmation'}
    else if(!await button.count()||await stage.getAttribute('data-guided-action')==='special_transaction'){button=exact('I’ll come back to this');answer='defer'}
    if(!await button.count()){results.push({heading,unhandled:true});break}
    let responseMs:number|null=null,serverTiming:string|null=null
    const started=Date.now()
    const observe=async(r:import('@playwright/test').Response)=>{if(r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/')){responseMs=Date.now()-started;serverTiming=r.headers()['server-timing']??null}}
    page.on('response',observe)
    await button.click()
    await page.waitForFunction(old=>{const el=document.querySelector('[data-guided-id]');return (!el||el.getAttribute('data-guided-id')!==old)&&!document.body.innerText.includes('I’m checking the next question.')},id,{timeout:60000})
    const elapsedMs=Date.now()-started;page.off('response',observe)
    const next=await stage.getAttribute('data-guided-id').catch(()=>null)
    results.push({heading,answer,responseMs,elapsedMs,serverTiming,width:i%2?390:1280})
    await writeFile(`${dir}/answer-timings.json`,JSON.stringify(results,null,2))
    await page.screenshot({path:`${dir}/answer-${i}.png`,fullPage:true})
    if(!next)break
    await page.reload();await stage.waitFor();assert.equal(await stage.getAttribute('data-guided-id'),next,'REFRESH_CHANGED_AUTHORITATIVE_TURN')
    await page.setViewportSize({width:i%2?1280:390,height:900})
   }
   console.log(JSON.stringify({synthetic:true,results}));return
  }
  await page.goto(origin+(mode==='--upload'||mode==='--loan'?'/check-in':'/import'))
  if(mode==='--retry-loan'||mode==='--set-aside'){
   const row=page.getByRole('list',{name:'Your documents'}).getByRole('listitem').filter({hasText:mode==='--retry-loan'?'loan.pdf':'irrelevant.pdf'})
   await row.getByRole('button',{name:mode==='--retry-loan'?'Try again':'Not for my books',exact:true}).click()
   if(mode==='--set-aside')await row.getByText('Set aside — not used in your books',{exact:true}).waitFor()
   console.log(JSON.stringify({synthetic:true,mode,submitted:true}));return
  }
  if(mode==='--loan')await page.getByRole('heading',{name:'Send me the loan statement.',exact:true}).waitFor()
  if(mode==='--upload')await page.getByRole('heading',{name:'Have receipts? Send them first.',exact:true}).waitFor()
  await page.screenshot({path:`${dir}/${mode.slice(2)}-evidence-before-1280.png`,fullPage:true})
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/${mode.slice(2)}-evidence-before-390.png`,fullPage:true})
  const result=mode==='--upload'?page.waitForResponse(r=>r.url().endsWith('/api/bookkeeping/work/evidence')&&r.request().method()==='POST',{timeout:60000}):null
  await page.locator('input[type=file]').first().setInputFiles(mode==='--scope-upload'?[`${dir}/current-and-earlier.pdf`]:mode==='--bank-only'?[`${dir}/bank-only.csv`]:mode==='--loan'||mode==='--irrelevant'?[`${dir}/${mode.slice(2)}.pdf`]:mode==='--receipt-only'?[`${dir}/printing-only.pdf`]:[`${dir}/two-receipts-one-page.pdf`,`${dir}/phone-bill-two-pages.pdf`])
  if(mode==='--upload'){const response=await result!;assert(response.ok(),'EVIDENCE_ACKNOWLEDGMENT_FAILED')}
  else await page.getByRole('status').filter({hasText:['--receipt-only','--loan','--irrelevant','--bank-only','--retry-loan','--set-aside','--scope-upload'].includes(mode)?/1 document received/:/2 documents received/}).waitFor({timeout:60000})
  await page.screenshot({path:`${dir}/${mode.slice(2)}-evidence-received-390.png`,fullPage:true})
  console.log(JSON.stringify({synthetic:true,uploaded:true,mode}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'EVIDENCE_CERTIFICATION_FAILED');process.exitCode=1})
