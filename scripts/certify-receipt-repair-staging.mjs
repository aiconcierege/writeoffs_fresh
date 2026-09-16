// Real provider + normal customer UI certification; synthetic tenants only.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {createCanvas} from '@napi-rs/canvas'
import {chromium} from '@playwright/test'
const origin='https://writeoffs-fresh-staging.vercel.app',dir='/private/tmp/writeoffs-receipt-repair',url=process.env.NEXT_PUBLIC_SUPABASE_URL
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
const fixtures=JSON.parse(await readFile(`${dir}/fixtures.json`,'utf8')),admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
for(const f of fixtures){const u=await admin.auth.admin.getUserById(f.userId);assert.equal(u.data.user?.user_metadata.synthetic_receipt_repair,true)}
const cases=[{key:'wrong',merchant:"McDonald's",date:'09/08/2026',total:'9.54',state:'receipt_only'},
 {key:'exact',merchant:"McDonald's",date:'09/08/2026',total:'12.00',state:'matched'},
 {key:'unmatched',merchant:'Northstar Paper',date:'September 8, 2026',total:'18.40',state:'receipt_only'},
 {key:'multiple',state:'details_unavailable'},
 {key:'ambiguous',merchant:'Ambiguous Shop',date:'09/08/2026',total:'25.00',state:'details_unavailable'},
 {key:'tolerance',merchant:'Date Tolerance Shop',date:'09/08/2026',total:'18.65',state:'matched'}]
await mkdir(`${dir}/proof`,{recursive:true})
function receipt(context,x,merchant,date,total){context.fillStyle='white';context.fillRect(x,0,700,950);context.fillStyle='#111';context.font='bold 44px Arial';context.fillText(merchant,x+45,90);context.font='28px Arial';context.fillText(date,x+45,155);context.fillText('Purchase receipt',x+45,215);context.fillText('Item purchased',x+45,325);context.fillText(`$${total}`,x+510,325);context.font='bold 38px Arial';context.fillText('TOTAL',x+45,450);context.fillText(`$${total}`,x+480,450);context.font='24px Arial';context.fillText('Paid by card',x+45,545);context.fillText('Thank you',x+45,650);context.font='18px Arial';context.fillText('SYNTHETIC STAGING TEST — NOT A REAL PURCHASE',x+35,845)}
for(const c of cases){const canvas=createCanvas(c.key==='multiple'?1420:700,950),ctx=canvas.getContext('2d');if(c.key==='multiple'){receipt(ctx,0,'STARBUCKS','09/08/2026','4.33');receipt(ctx,720,'Uber','September 11, 2026','5.40')}else receipt(ctx,0,c.merchant,c.date,c.total);await writeFile(`${dir}/${c.key}.png`,canvas.toBuffer('image/png'))}
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
async function session(f,browser){const cookies=new Map(),client=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookies.set(name,value))}});assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error);assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error);const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'});await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));return{context,client}}
const browser=await chromium.launch({headless:true}),errors=[],results=[]
let state={};try{state=JSON.parse(await readFile(`${dir}/browser-state.json`,'utf8'))}catch{}
let page,stage='login'
try{
 const {context,client}=await session(fixtures[0],browser);page=await context.newPage()
 page.on('pageerror',()=>errors.push('pageerror'));page.on('console',m=>{if(m.type()==='error')errors.push('consoleerror')})
 const snapshot=async(name)=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.screenshot({path:`${dir}/proof/${name}.png`,fullPage:true})}
 const receipts=async()=>{const r=await context.request.get(`${origin}/api/receipts`);assert.equal(r.status(),200);return(await r.json()).receipts}
 for(const c of cases){stage=c.key
  if(!state[c.key]){
   await page.goto(`${origin}/${c.key==='unmatched'?'home':'transactions?view=receipts'}`)
   const routeBefore=page.url(),registration=page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===`${origin}/api/receipts`)
   const chooser=page.waitForEvent('filechooser')
   await(c.key==='unmatched'?page.locator('.home-add-receipt button').first():page.getByRole('button',{name:'Upload receipts',exact:true})).click()
   await(await chooser).setFiles(`${dir}/${c.key}.png`)
   const response=await registration;assert.equal(response.status(),200);const body=await response.json();assert(body.receipt.id)
   state[c.key]={id:body.receipt.id,registration:response.request().postDataJSON()};await writeFile(`${dir}/browser-state.json`,JSON.stringify(state),{mode:0o600})
   assert.equal(page.url(),routeBefore,'Upload stays in its review context')
   if(c.key==='unmatched')for(const width of [390,430,1280]){await page.setViewportSize({width,height:900});await page.locator('.home-add-receipt [role="status"]').first().waitFor();const box=await page.locator('.home-add-receipt [role="status"]').first().boundingBox(),card=await page.locator('.home-add-receipt').boundingBox();assert(box.width>=card.width-35,'Receipt status spans the card instead of collapsing beside the icon');await snapshot(`home-status-${width}`)}
  }
  let item;for(let i=0;i<65;i++){item=(await receipts()).find(r=>r.id===state[c.key].id);if(item&&item.displayStatus!=='processing')break;await page.waitForTimeout(3000)}
  assert(item&&item.displayStatus!=='processing',`${c.key}: terminal state reached`)
  assert.equal(item.displayStatus,c.state,`${c.key}: correct outcome`)
  if(c.key==='multiple'){assert.equal(item.processingReason,'MULTIPLE_RECEIPTS_DETECTED');assert.equal(item.totalAmountCents,null)}
  else{assert.equal(item.occurredOn,'2026-09-08');assert.equal(item.totalAmountCents,Math.round(Number(c.total)*100));assert.equal(item.merchant.toLowerCase().replace(/[^a-z0-9]/g,''),c.merchant.toLowerCase().replace(/[^a-z0-9]/g,''))}
  let jobs;for(let attempt=0;attempt<20;attempt++){jobs=await admin.from('receipt_processing_jobs').select('state,attempt_count,terminal_reason').eq('receipt_id',item.id).eq('business_id',fixtures[0].businessId).eq('job_type','canonical_receipt_extraction');assert(!jobs.error);assert.equal(jobs.data.length,1);if(['completed','needs_attention','unreadable'].includes(jobs.data[0].state))break;await page.waitForTimeout(500)}assert(['completed','needs_attention','unreadable'].includes(jobs.data[0].state))
  results.push({case:c.key,receiptId:item.id,status:item.displayStatus,merchant:item.merchant,date:item.occurredOn,totalCents:item.totalAmountCents,job:jobs.data[0]});console.log(`${c.key}: ${item.displayStatus}`)
 }
 stage='reconciliation'
 const exact=state.exact.id,record=fixtures[0].records[0]
 const links=await admin.from('bookkeeping_document_links').select('id').eq('receipt_id',exact).eq('bookkeeping_record_id',record.recordId).is('revoked_at',null);assert.equal(links.data.length,1)
 const events=await admin.from('bookkeeping_receipt_events').select('event_type,sequence_number').eq('receipt_id',exact).order('sequence_number');assert.equal(events.data.filter(e=>e.event_type==='matched').length,1)
 const retry=await context.request.post(`${origin}/api/receipts`,{data:state.exact.registration});assert.equal(retry.status(),200);assert.equal((await retry.json()).receipt.id,exact)
 const again=await admin.from('bookkeeping_receipt_events').select('event_type,sequence_number').eq('receipt_id',exact).order('sequence_number');assert.deepEqual(again.data,events.data)
 const recordCount=await admin.from('bookkeeping_financial_sources').select('id',{count:'exact',head:true}).eq('business_id',fixtures[0].businessId).eq('financial_transaction_id',record.transactionId).is('revoked_at',null);assert.equal(recordCount.count,1)
 const receiptRecords=await admin.from('bookkeeping_records').select('id').eq('business_id',fixtures[0].businessId).eq('ingestion_key',`receipt:${exact}`);assert.equal(receiptRecords.data.length,0,'No duplicate receipt expense created')
 const current=await admin.from('bookkeeping_decisions').select('id,supersedes_decision_id').eq('bookkeeping_record_id',record.recordId);assert(current.data.some(d=>d.id===record.decisionId));assert(!current.data.some(d=>d.supersedes_decision_id===record.decisionId),'Customer classification remains authoritative')
 const missing=await client.rpc('list_customer_transaction_work',{p_view:'receipts'});assert(!missing.error);assert(!missing.data.some(r=>r.record_id===record.recordId))
 const only=await client.rpc('list_customer_transaction_work',{p_view:'receipt-only'});assert(!only.error);assert(!only.data.some(r=>r.record_id===record.recordId||r.transaction_id===exact||r.transaction_id===state.multiple.id));assert(only.data.length>=2)
 await page.goto(`${origin}/transactions/${record.transactionId}`);await page.getByText('Supporting receipt attached',{exact:true}).waitFor();await snapshot('matched-detail')
 stage='tenant-security'
 const other=await session(fixtures[1],browser)
 for(const path of [`/api/receipts/${exact}/view`,`/api/receipts/${exact}/retry`]){const r=path.endsWith('retry')?await other.context.request.post(origin+path):await other.context.request.get(origin+path);assert([403,404].includes(r.status()))}
 const cross=await other.context.request.post(`${origin}/api/bookkeeping/financial-transactions/${fixtures[1].records[0].transactionId}/receipts`,{data:{receipt_id:exact}});assert([400,403,404].includes(cross.status()))
 const denied=await other.client.rpc('claim_canonical_receipt_job',{p_receipt_id:exact,p_lease_id:crypto.randomUUID()});assert(denied.error)
 assert.equal((await other.client.from('receipts').select('id').eq('id',exact)).data.length,0)
 await other.client.auth.signOut();await other.context.close()
 stage='responsive-surfaces'
 for(const width of [390,430,1280]){
  await page.setViewportSize({width,height:900})
  for(const [path,name] of [['/receipts','receipts'],['/transactions?view=receipts','needs-receipt'],['/transactions?view=receipt-only','receipt-only'],['/home','home']]){await page.goto(origin+path);await page.waitForTimeout(600);if(name==='needs-receipt'){const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload receipts',exact:true}).click();await(await picker).setFiles([]);assert.equal(page.url(),origin+path)}await snapshot(`${name}-${width}`)}
  await page.goto(`${origin}/receipts`);await page.locator('.receipt-record').filter({hasText:'Upload separately'}).locator('summary').click();await page.getByText('I found more than one receipt in this image. Please upload each receipt separately.',{exact:true}).waitFor();await snapshot(`multiple-help-${width}`)
 }
 assert.deepEqual(errors,[])
 await writeFile(`${dir}/proof/result.json`,JSON.stringify({passed:true,results,widths:[390,430,1280],browserErrors:errors.length,tenantIsolation:true,retryIdempotent:true,noDuplicateExpense:true},null,2))
 await client.auth.signOut();await context.close();console.log('Receipt UI, real extraction, automatic matching, views, idempotency, tenant isolation and responsive certification passed.')
}catch(error){if(page)await page.screenshot({path:`${dir}/proof/failure.png`,fullPage:true});console.error(`Receipt certification failed at ${stage}: ${error.message}`);process.exitCode=1}finally{await browser.close()}
