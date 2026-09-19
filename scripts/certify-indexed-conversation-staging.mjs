// Candidate smoke certification. Real UI answers on explicitly synthetic tenants only.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
async function main(){
const origin=process.env.CERTIFICATION_ORIGIN,dir=process.env.CERTIFICATION_ARTIFACT_DIR
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(/^https:\/\/writeoffs-fresh-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))
assert(/^\/private\/tmp\/writeoffs-phase3-[a-z0-9-]+$/.test(dir));assert(process.argv.includes('--measure'))
await mkdir(dir,{recursive:true})
const fixtures=JSON.parse(await readFile(process.env.PERFORMANCE_FIXTURES??'/private/tmp/writeoffs-phase3-final/fixtures.json','utf8'))
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
const browser=await chromium.launch({headless:true}),contexts=[]
try{
 for(const fixture of fixtures.slice(-1)){
  assert.equal((await admin.auth.admin.getUserById(fixture.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
  const jar=new Map(),client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}})
  assert(!(await client.auth.signInWithPassword({email:fixture.email,password:fixture.password})).error)
  assert(!(await client.auth.mfa.challengeAndVerify({factorId:fixture.factorId,code:totp(fixture.totpSecret)})).error)
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/Phoenix'})
  await context.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
  for(const line of (await readFile(`${dir}/candidate-cookie.txt`,'utf8').catch(()=>'')).split('\n')){
   if(!line.includes('\t'))continue;const p=line.replace(/^#HttpOnly_/,'').split('\t');if(p[0]===new URL(origin).hostname)await context.addCookies([{domain:p[0],path:p[2],secure:p[3]==='TRUE',name:p[5],value:p[6],httpOnly:true,sameSite:'None'}])
  }
  contexts.push(context)
 }
 const context=contexts[0],page=await context.newPage(),steps=[]
 await page.goto(origin+'/check-in');await page.locator('[data-guided-action]').waitFor({timeout:30000})
 const timeOrigin=await page.evaluate(()=>performance.timeOrigin)
 for(let i=0;i<8;i++){
  const read=await context.request.get(origin+'/api/bookkeeping/work');assert.equal(read.status(),200)
  const work=await read.json();assert.equal(work.index?.version,1,'Candidate must use the index')
  const action=work.nextAction;assert(action)
  assert.equal(await page.locator('[data-guided-action]').getAttribute('data-guided-version'),action.version)
  const label=i%3===0||action.type==='special_transaction'||!(action.question?.transaction.amountCents>0)?/come back to this/i:'Payment from a customer'
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/bookkeeping/')&&!r.url().endsWith('/reconcile'))
  const start=performance.now();await page.getByRole('button',{name:label,exact:typeof label==='string'}).click()
  const r=await response,persistedMs=performance.now()-start;assert.equal(r.status(),200,await r.text())
  const body=await r.json();assert.equal(body.work?.index?.version,1);assert(body.work.nextAction,'Independent next action must remain')
  await page.waitForFunction(v=>document.querySelector('[data-guided-action]')?.getAttribute('data-guided-version')!==v,action.version)
  const visibleMs=performance.now()-start
  assert.equal(await page.locator('[data-guided-action]').getAttribute('data-guided-version'),body.work.nextAction.version)
  assert.equal(await page.evaluate(()=>performance.timeOrigin),timeOrigin)
  steps.push({type:typeof label==='string'?'answer':'defer',persistedMs,visibleMs,serverTiming:r.headers()['server-timing'],dbCalls:r.headers()['x-betti-db-calls'],proxyMs:r.headers()['x-betti-proxy-ms'],bytes:JSON.stringify(body).length})
  await writeFile(dir+'/index-smoke.json',JSON.stringify(steps,null,2));console.log(JSON.stringify(steps.at(-1)))
 }
 await page.screenshot({path:dir+'/index-smoke.png',fullPage:true})
}finally{for(const c of contexts)await c.close();await browser.close()}
}
main().catch(error=>{console.error(String(error instanceof Error?error.message:error).split('Call log:')[0]);process.exitCode=1})
