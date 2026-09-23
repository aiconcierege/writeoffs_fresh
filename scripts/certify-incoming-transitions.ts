// Tagged synthetic fixture only; never submits an answer for the clean-room customer.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}

async function main(){
 process.umask(0o077)
 const mode='incoming-transition-certification'
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(process.env.TRANSITION_FIXTURE_PATH??'/private/tmp/writeoffs-routing-emily-transition/fixture.json','utf8'))
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_t1_routing,true)
 assert.notEqual(f.businessId,'d785186b-16db-47e5-ab02-e59fd1ae311b')
 const jar=new Map<string,string>()
 const db=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
 assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const browser=await chromium.launch({headless:true})
 try{
 const context=await browser.newContext(),origin='https://writeoffs-fresh-staging.vercel.app'
 await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax' as const})))

 const page=await context.newPage();const outcomes:Array<Record<string,unknown>>=[]
 for(let turn=0;turn<18&&outcomes.length<3;turn++){
  const width=outcomes.length%2?390:1280,reduced=width===390
  await page.setViewportSize({width,height:720});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'})
  await page.goto(origin+'/check-in');await page.locator('[data-guided-id]').waitFor()
  const id=await page.locator('[data-guided-id]').getAttribute('data-guided-id')
  const work=await (await context.request.get(origin+'/api/bookkeeping/work?view=guided')).json()
  const action=work.presentation?.action??work.nextAction
  assert.equal(action.id,id,'SSR and authoritative read disagree')
  const incoming=action.question?.kind==='transaction_type'&&action.question.transaction.amountCents>0&&!action.question.confirmation
  if(!incoming){
   const defer=page.getByRole('button',{name:'I’ll come back to this',exact:true});await defer.waitFor();await defer.click()
   await page.waitForFunction(old=>document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id')!==old,id,{timeout:45000})
   await page.waitForFunction(()=>!document.querySelector('.betti-transition-feedback'),{},{timeout:45000});continue
  }
  let release!:()=>void;const hold=new Promise<void>(r=>{release=r});let calls=0;let timing='';let serverMs=0
  const endpoint='**/api/bookkeeping/questions/'+action.question.id
  await page.route(endpoint,async route=>{
   calls++;const start=Date.now();const response=await route.fetch();serverMs=Date.now()-start
   assert.equal(response.status(),200);timing=response.headers()['server-timing']??''
   await hold;await route.fulfill({response})
  })
  await page.waitForFunction(()=>document.activeElement?.tagName==='H1')
  const button=page.getByRole('button',{name:'I’m not sure',exact:true})
  await button.evaluate(el=>window.scrollTo({top:window.scrollY+el.getBoundingClientRect().top-160,behavior:'instant'}))
  const before=(await page.locator('#guided-transaction').boundingBox())!;assert(before.y<0,'Must exercise scrolled context')
  await page.evaluate(()=>{const w=window as unknown as {seen:string[]};w.seen=[];new MutationObserver(()=>{const id=document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id');if(id&&w.seen.at(-1)!==id)w.seen.push(id)}).observe(document,{subtree:true,attributes:true,childList:true})})
  const start=Date.now();if(reduced){await button.focus();await page.keyboard.press('Enter')}else await button.click()
  await page.locator('.betti-transition-feedback').waitFor();const feedbackMs=Date.now()-start
  const fb=(await page.locator('.betti-transition-feedback').boundingBox())!;assert(fb.y>=0&&fb.y+fb.height<=720)
  await page.waitForTimeout(800);assert.equal(calls,1);release()
  await page.waitForFunction(old=>{const id=document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id');return id&&id!==old},id,{timeout:45000})
  await page.waitForFunction(()=>!document.querySelector('.betti-transition-feedback'),{},{timeout:45000})
  const next=await page.locator('[data-guided-id]').getAttribute('data-guided-id')
  const visible=await page.evaluate(()=>(window as unknown as {seen:string[]}).seen)
  assert.deepEqual([...new Set(visible.filter(x=>x!==id))],[next])
  await page.waitForFunction(()=>{const b=document.querySelector('#guided-transaction')?.getBoundingClientRect();return b&&b.top>=0&&b.bottom<=innerHeight})
  assert(await page.locator('.betti-active-conversation h1').evaluate(el=>el===document.activeElement))
  const nextMerchant=await page.locator('#guided-transaction').innerText()
  const after=await (await context.request.get(origin+'/api/bookkeeping/work?view=guided')).json()
  assert.equal(after.nextAction.id,next)
  const events=await admin.from('bookkeeping_review_events').select('id,event_type,answer_payload,resulting_decision_id').eq('business_id',f.businessId).eq('review_issue_id',action.question.id).eq('event_type','answered')
  assert(!events.error);assert.equal(events.data?.length,1);assert.deepEqual(events.data![0].answer_payload,{schemaVersion:1,response:'not_sure'})
  const decision=await admin.from('bookkeeping_decisions').select('treatment,bookkeeping_nature').eq('id',events.data![0].resulting_decision_id).single()
  assert.equal(decision.data?.treatment,'unresolved');assert.equal(decision.data?.bookkeeping_nature,null)
  const allocations=await admin.from('bookkeeping_allocations').select('id').eq('bookkeeping_decision_id',events.data![0].resulting_decision_id)
  assert(!allocations.error);assert.equal(allocations.data?.length,0)
  await page.reload();await page.locator('[data-guided-id]').waitFor();assert.equal(await page.locator('[data-guided-id]').getAttribute('data-guided-id'),next)
  await page.waitForFunction(()=>{const b=document.querySelector('#guided-transaction')?.getBoundingClientRect();return b&&b.top>=0&&b.bottom<=innerHeight})
  await page.screenshot({path:'/private/tmp/emily-hosted-'+width+'.png'})
  outcomes.push({width,reducedMotion:reduced,keyboard:reduced,from:action.question.transaction.merchant,to:nextMerchant,incomingToIncoming:after.nextAction.question?.transaction.amountCents>0,answerCount:1,feedbackMs,serverMs,serverTiming:timing,merchantVisible:true,refreshStable:true,unresolvedWithoutAllocation:true})
  await writeFile('/private/tmp/emily-hosted-progress.json',JSON.stringify(outcomes,null,2));await page.unroute(endpoint)
 }
 assert(outcomes.length>=2);assert(outcomes.filter(o=>o.incomingToIncoming).length>=2)
 await writeFile('/private/tmp/emily-hosted-result.json',JSON.stringify({synthetic:true,mode,outcomes},null,2));console.log(JSON.stringify(outcomes))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
