/** Dedicated staging synthetic fixtures only. Never logs credentials or customer data. */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'
const origin='https://writeoffs-fresh-staging.vercel.app',dir=process.env.ROUTING_FIXTURE_DIR!
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
async function main(){
 process.umask(0o077)
 assert(/^\/private\/tmp\/writeoffs-routing-[a-z0-9-]+$/.test(dir))
 const mode=process.argv[2];assert(['inspect','none','later','upload','verify'].includes(mode))
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(process.env.WRITEOFFS_ENVIRONMENT,'staging');assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(`${dir}/fixture.json`,'utf8'))
 assert(!['d785186b-16db-47e5-ab02-e59fd1ae311b','2c0ddbb3-6650-42a4-aafa-3685f7efe288'].includes(f.businessId))
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 const jar=new Map<string,string>(),db=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const work=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
 assert.equal(work.betti.jobs.length,0,'WAIT_FOR_SYNTHETIC_PROCESSING')
 if(mode!=='verify')assert.equal(work.nextAction?.type,'evidence_opportunity')
 const browser=await chromium.launch({headless:true})
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))
  const page=await context.newPage(),screens=[]
  for(const width of [1280,390,430]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/home');await page.waitForLoadState('networkidle')
   assert.equal(new URL(page.url()).pathname,'/home')
   if(mode!=='verify'){
    assert.match(await page.locator('#home-heading').innerText(),/Before I ask you anything/)
    for(const name of ['Send receipts','I don’t have any','I’ll do this later'])assert(await page.getByRole('button',{name,exact:true}).isVisible())
    assert(await page.getByRole('link',{name:'Send statements',exact:true}).isVisible())
   }
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'OVERFLOW')
   await page.screenshot({path:`${dir}/handoff-${mode}-${width}.png`,fullPage:true});screens.push(width)
  }
  let responseStatus:number|null=null
  if(['none','later','upload'].includes(mode)){
   const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/bookkeeping/work/evidence'),{timeout:60000})
   if(mode==='upload')await page.getByLabel('Send Betti documents',{exact:true}).setInputFiles(['/private/tmp/writeoffs-routing-evidence-first/two-receipts-one-page.pdf','/private/tmp/writeoffs-routing-evidence-first/phone-bill-two-pages.pdf'])
   else await page.getByRole('button',{name:mode==='none'?'I don’t have any':'I’ll do this later',exact:true}).click()
   const r=await response;responseStatus=r.status();assert(r.ok(),'EVIDENCE_RESPONSE_REJECTED')
   await page.waitForFunction(()=>!document.querySelector('.home-evidence-opportunity'),{},{timeout:60000})
   await page.reload();await page.waitForLoadState('networkidle')
   assert.equal(await page.getByRole('button',{name:'I don’t have any',exact:true}).count(),0)
  }
  const after=await loadCanonicalBettiWork({db,businessId:f.businessId,scope:'business'})
  const report=await getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-24',currency:'USD'})
  const answers=await db.from('bookkeeping_review_events').select('id',{count:'exact',head:true}).eq('business_id',f.businessId).eq('event_type','answered');assert(!answers.error);assert.equal(answers.count,0)
  const questions=after.customer.actionable.flatMap(a=>a.question?[{merchant:a.question.transaction.merchant,kind:a.question.kind}]:[])
  if(mode==='verify'){
   assert(!questions.some(q=>/print shop|state farm/i.test(q.merchant)))
   assert(questions.some(q=>/verizon/i.test(q.merchant)&&q.kind==='percentage'))
  }
  assert.deepEqual([report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents],[210052,142573,67479])
  const result={synthetic:true,mode,screens,responseStatus,initialActions:work.customer.actionable.length,nextAction:after.nextAction?.type,remainingQuestions:questions,pendingJobs:after.betti.jobs.length,answers:answers.count,totals:[report.businessIncomeCents,report.businessExpensesCents,report.businessProfitCents],passed:true}
  await writeFile(`${dir}/handoff-${mode}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'HANDOFF_CERTIFICATION_FAILED');process.exitCode=1})
