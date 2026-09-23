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
 const mode='transition-certification'
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile(process.env.TRANSITION_FIXTURE_PATH??'/private/tmp/writeoffs-routing-certification/fixture.json','utf8'))
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
 const page=await context.newPage();await page.setViewportSize({width:1280,height:900})
 const outcomes:Array<Record<string,unknown>>=[];let injected=false
 await page.route('**/api/bookkeeping/**',async route=>{
  if(route.request().method()!=='POST'||route.request().url().endsWith('/reconcile')){await route.continue();return}
  const response=await route.fetch(),data=await response.json()
  assert(response.ok(),'Synthetic answer request failed')
  if(!injected&&data.work?.nextAction?.question){
   injected=true
   // Deliberately supply the old server contract to the NEW client: this action
   // must never appear. The underlying real answer is sent exactly once.
   const dirty=structuredClone(data.work);dirty.index={version:1,summaryCurrent:false}
   dirty.nextAction.id='forbidden-provisional-turn';dirty.nextAction.question.prompt='FORBIDDEN PROVISIONAL QUESTION'
   await route.fulfill({response,json:{...data,work:dirty}})
  }else await route.fulfill({response,json:data})
 })
 await page.goto(origin+'/check-in');await page.locator('[data-guided-id]').waitFor()
 for(let turn=0;turn<18;turn++){
  const stage=page.locator('[data-guided-id]');if(!await stage.count())break
  const id=await stage.getAttribute('data-guided-id');if(!id)break
  await page.locator('.betti-active-conversation h1').waitFor()
  const heading=await page.locator('.betti-active-conversation h1').innerText()
  await page.evaluate(()=>{const w=window as unknown as {turnIds?:string[]};w.turnIds=[];new MutationObserver(()=>{const id=document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id');if(id&&w.turnIds?.at(-1)!==id)w.turnIds?.push(id)}).observe(document,{subtree:true,attributes:true,childList:true})})
  let button=page.getByRole('button',{name:'I’m not sure',exact:true})
  if(await stage.getAttribute('data-guided-action')==='special_transaction')button=page.getByRole('button',{name:'I’ll come back to this',exact:true})
  else if(heading==='Anything here personal?')button=page.getByRole('button',{name:'Nothing here is personal',exact:true})
  else if(heading==='Do you have receipts for these?'||heading==='Any more receipts for these?')button=page.getByRole('button',{name:'I’ll do this later',exact:true})
  else if(turn===2&&await page.getByRole('button',{name:'Payment from a customer',exact:true}).count())button=page.getByRole('button',{name:'Payment from a customer',exact:true})
  else if(!await button.count())button=page.getByRole('button',{name:'I’ll come back to this',exact:true})
  await button.waitFor();const answer=await button.innerText();const started=Date.now()
  await button.click()
  await page.waitForFunction(old=>{const el=document.querySelector('[data-guided-id]');return !el||el.getAttribute('data-guided-id')!==old},id,{timeout:60000})
  // Wait for the authoritative successor, including intentionally visible waiting.
  await page.waitForFunction(()=>!document.body.innerText.includes('I’m checking the next question.'),{},{timeout:60000})
  const next=await page.evaluate(()=>document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id')??null)
  const seen=await page.evaluate(()=>(window as unknown as {turnIds:string[]}).turnIds)
  assert(!seen.includes('forbidden-provisional-turn'))
  assert.deepEqual([...new Set(seen.filter(x=>x!==id))],next?[next]:[],'An intermediate action was rendered')
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.waitForLoadState('networkidle')
  if(next)assert.equal(await page.evaluate(()=>document.querySelector('[data-guided-id]')?.getAttribute('data-guided-id')??null),next,'Focus replaced the active question')
  outcomes.push({turn,heading,answer,visibleSuccessors:next?1:0,elapsedMs:Date.now()-started,width:turn%2?390:1280})
  await writeFile('/private/tmp/flash-hosted-progress.json',JSON.stringify(outcomes,null,2))
  await page.screenshot({path:'/private/tmp/flash-hosted-'+(turn%2?'390':'1280')+'.png',fullPage:true})
  if(!next)break
  await page.reload();await page.locator('[data-guided-id]').waitFor()
  assert.equal(await page.locator('[data-guided-id]').getAttribute('data-guided-id'),next,'Refresh changed the active question')
  await page.setViewportSize({width:turn%2?1280:390,height:900})
 }
 assert(injected);assert(outcomes.length>=4)
 await writeFile('/private/tmp/flash-hosted-result.json',JSON.stringify({mode,synthetic:true,dirtyContinuationNeverRendered:true,outcomes},null,2));console.log(JSON.stringify({turns:outcomes.length,dirtyContinuationNeverRendered:true}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
