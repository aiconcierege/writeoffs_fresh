// Isolated synthetic staging test. Never reads credentials for, or mutates, Rick's customer.
import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {mayChecking} from '../tests/fixtures/may-2026-checking'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'
import {refreshBettiActionIndex} from '../app/lib/bookkeeping/action-index-worker'

const origin='https://writeoffs-fresh-staging.vercel.app',dir='/private/tmp/writeoffs-routing-certification'
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
const mode=process.argv[2];assert(['--prepare','--inspect','--hosted','--refresh-synthetic'].includes(mode))
process.umask(0o077)
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
async function main(){
 await mkdir(dir,{recursive:true})
 type Fixture={userId:string;businessId:string;email:string;password:string;factorId:string;totpSecret:string;documentId?:string}
 let f:Fixture|null=await readFile(`${dir}/fixture.json`,'utf8').then(JSON.parse).catch(()=>null)
 if(!f){
  assert.equal(mode,'--prepare')
  const nonce=randomUUID(),email=`routing-may-${nonce}@staging.writeoffs.invalid`,password=`Synthetic-${randomUUID()}!`
  const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_t1_routing:true}});assert(!made.error&&made.data.user,'SYNTHETIC_CREATE_FAILED')
  const customer=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}})
  assert(!(await customer.auth.signInWithPassword({email,password})).error,'SYNTHETIC_LOGIN_FAILED')
  const b=await customer.from('businesses').select('id').single();assert(b.data&&!b.error,'SYNTHETIC_BUSINESS_FAILED')
  const businessId=b.data.id,userId=made.data.user.id
  assert(!(await admin.rpc('create_business_membership_grant',{p_business_id:businessId,p_plan:'business',p_starts_at:new Date(Date.now()-86400000).toISOString(),p_ends_at:null,p_request_key:`routing-may:${nonce}`,p_reason:'Synthetic T1 routing regression',p_provenance:'admin',p_actor_user_id:null})).error,'SYNTHETIC_MEMBERSHIP_FAILED')
  const enrolled=await customer.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic routing'});assert(enrolled.data&&!enrolled.error)
  f={userId,businessId,email,password,factorId:enrolled.data.id,totpSecret:enrolled.data.totp.secret}
  await writeFile(`${dir}/fixture.json`,JSON.stringify(f),{mode:0o600})
 }
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true,'SYNTHETIC_OWNERSHIP_REQUIRED')
 if(mode==='--refresh-synthetic'){
  const result=await refreshBettiActionIndex({admin,businessId:f.businessId,limit:1})
  assert.equal(result.failed,0,'SYNTHETIC_INDEX_REFRESH_FAILED');console.log(JSON.stringify(result));return
 }
 const jar=new Map<string,string>()
 const client=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const browser=await chromium.launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
  const page=await context.newPage()
  if(mode==='--prepare'){
   const b=await admin.from('businesses').select('onboarding_state').eq('id',f.businessId).single()
   if(b.data?.onboarding_state!=='completed'){
    await page.goto(origin+'/onboarding')
    const step=async()=>page.locator('[data-onboarding-step]').getAttribute('data-onboarding-step')
    const next=async()=>{const before=await step();await page.getByRole('button',{name:/^Continue/}).click();await page.waitForFunction(old=>document.querySelector('[data-onboarding-step]')?.getAttribute('data-onboarding-step')!==old,before)}
    await page.locator('[data-onboarding-step]').waitFor()
    if(await step()==='business'){await page.getByLabel(/Business name/).fill('Synthetic May Routing Studio');await page.getByLabel('What does your business do?',{exact:true}).fill('Independent services for customers.');await next()}
    if(await step()==='eligibility'){await page.getByRole('radio',{name:/With my personal tax return/}).check();await next()}
    if(await step()==='history'){
     await page.getByRole('radio',{name:'This business already exists',exact:true}).check()
     const date=page.getByRole('group',{name:'When did the business start?',exact:true})
     await date.getByLabel('Year',{exact:true}).selectOption('2026');await date.getByLabel('Month',{exact:true}).selectOption('01');await next()
    }
    if(await step()==='operations'){
     await page.getByRole('group',{name:'Customer-job materials',exact:true}).getByRole('radio',{name:'No',exact:true}).check()
     await page.getByRole('group',{name:'Products kept for future sale',exact:true}).getByRole('radio',{name:'No',exact:true}).check();await next()
    }
    if(await step()==='catch_up'){await page.getByRole('radio',{name:'Start with last month',exact:true}).check();await next()}
    if(await step()==='starting_method'){await page.getByRole('radio',{name:/Send Betti documents/}).check();await next()}
    assert.equal(await step(),'review');await page.getByRole('button',{name:/^Go to WriteOffs/}).click();await page.waitForURL('**/home',{timeout:60000})
    // Commercial scope is a synthetic precondition, not fabricated financial evidence.
    assert(!(await admin.from('business_customer_setup').update({grandfathered_start_date:'2026-01-01'}).eq('business_id',f.businessId)).error)
    const r=await context.request.post(origin+'/api/onboarding/catch-up',{data:{startMonth:'2026-01',agreed:true,expectedTotalCents:0}});assert.equal(r.status(),200,'SYNTHETIC_SCOPE_FAILED')
   }
   if(!f.documentId){
    const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
    for(let n=0;n<2;n++){
     const p=pdf.addPage([612,792]),put=(text:string,x:number,y:number)=>p.drawText(text,{x,y,size:9,font})
     put('FIRST PLATYPUS BANK',40,750);put('Checking Statement',40,730);put('Account ending 0000',40,710);put('Statement period: May 1, 2026 - May 31, 2026',40,690)
     put('Beginning balance $6,425.18',40,670);put('Ending balance $9,236.86',40,650)
     put('Date',40,640);put('Description',90,640);put('Credits',410,640);put('Debits',500,640)
     mayChecking.slice(n*12,n*12+12).forEach(([day,description,cents],i)=>{const y=615-i*29;put(`05/${String(day).padStart(2,'0')}`,40,y);put(description,90,y);put('$'+(Math.abs(cents)/100).toFixed(2),cents>0?410:500,y)})
     put(`Page ${n+1} - SYNTHETIC ROUTING CERTIFICATION`,40,40)
    }
    await writeFile(`${dir}/may.pdf`,await pdf.save())
    await page.goto(origin+'/import');const registered=page.waitForResponse(r=>r.url()===origin+'/api/documents'&&r.request().method()==='POST')
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles(process.env.ROUTING_STATEMENT_PATH??`${dir}/may.pdf`)
    const response=await registered;assert.equal(response.status(),200,'SYNTHETIC_UPLOAD_FAILED');f.documentId=(await response.json()).document.id
    await writeFile(`${dir}/fixture.json`,JSON.stringify(f),{mode:0o600})
   }
   console.log(JSON.stringify({synthetic:true,documentUploaded:true,businessId:f.businessId}));return
  }
  const accounts=await client.from('financial_accounts').select('id').eq('business_id',f.businessId)
  assert.equal(accounts.data?.length,1,'WAIT_FOR_STATEMENT_IMPORT')
  const use=await client.from('current_financial_account_use').select('designation').eq('business_id',f.businessId)
  if(!use.data?.length){assert.equal(mode,'--inspect');assert(!(await client.rpc('set_financial_account_use',{p_financial_account_id:accounts.data![0].id,p_designation:'business_only',p_effective_at:new Date().toISOString(),p_request_id:randomUUID()})).error);console.log('Synthetic account use recorded; wait for canonical processing.');return}
  const pending=await admin.from('bookkeeping_processing_jobs').select('id',{count:'exact',head:true}).eq('business_id',f.businessId).in('state',['pending','processing','retryable'])
  if(pending.count){console.log(JSON.stringify({syntheticPending:pending.count}));return}
  let snapshot:unknown
  const work=await loadCanonicalBettiWork({db:client,businessId:f.businessId,scope:'business',onSnapshot:s=>{snapshot=s}})
  await writeFile(`${dir}/synthetic-snapshot.json`,JSON.stringify(snapshot))
  const report=await getAuthenticatedCanonicalReport({supabase:client,periodStart:'2026-01-01',periodEnd:'2026-09-23'})
  assert.equal(report.rows.length,24)
  assert.equal(report.businessIncomeCents,210052);assert.equal(report.businessExpensesCents,142573);assert.equal(report.businessProfitCents,67479)
  const flow=work.customer.actionable.map(a=>({type:a.type,prompt:a.question?.prompt??null,merchant:a.question?.transaction.merchant??a.transaction?.merchant??null,items:a.items?.map(i=>i.merchant)}))
  await writeFile(`${dir}/observed-flow.json`,JSON.stringify(flow,null,2))
  assert.equal(flow.length,14);assert.equal(flow.filter(a=>a.type==='personal_exception_sweep').length,1)
  assert.equal(flow.find(a=>a.type==='personal_exception_sweep')?.items?.length,5)
  assert(!JSON.stringify(flow).includes('BANK SERVICE FEE'))
  assert.equal(work.customer.actionable.find(a=>/verizon/i.test(a.question?.transaction.merchant??''))?.question?.kind,'percentage')
  const evidence={synthetic:true,at:new Date().toISOString(),income:report.businessIncomeCents,expenses:report.businessExpensesCents,profit:report.businessProfitCents,flow,hosted:false}
  if(mode==='--hosted'){
   const response=await context.request.get(origin+'/api/bookkeeping/work')
   assert.equal(response.status(),200,'HOSTED_WORK_UNAVAILABLE')
   const hosted=await response.json()
   assert.deepEqual(hosted.customer.actionable.map((a:{id:string})=>a.id),work.customer.actionable.map(a=>a.id),'HOSTED_ROUTING_ORDER_DIFFERS')
   Object.assign(evidence,{hostedActionOrderMatches:true,hostedActionCount:hosted.customer.actionableCount,indexSummaryCurrent:hosted.index?.summaryCurrent??false})
   await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor()
   await page.getByRole('heading',{name:'Send me the loan statement.',exact:true}).waitFor()
   assert.equal(await page.locator('[data-guided-action]').getAttribute('data-guided-action'),work.nextAction?.type)
   assert.equal(await page.locator('[data-customer-action-count]').getAttribute('data-customer-action-count'),'14')
   assert(!(await page.locator('body').innerText()).match(/\d+ things need you/))
   await page.screenshot({path:`${dir}/check-in-1280.png`,fullPage:true})
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/check-in-390.png`,fullPage:true})
   evidence.hosted=true
  }
  await writeFile(`${dir}/result.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'SYNTHETIC_CERTIFICATION_FAILED');process.exitCode=1})
