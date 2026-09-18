// Read-only staged load ramp. Uses existing explicitly marked synthetic tenants.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {chromium} from '@playwright/test'
const origin=process.env.CERTIFICATION_ORIGIN,dir=process.env.CERTIFICATION_ARTIFACT_DIR
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(/^https:\/\/writeoffs-fresh-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin))
assert(/^\/private\/tmp\/writeoffs-phase3-[a-z0-9-]+$/.test(dir));assert(process.argv.includes('--measure'))
await mkdir(dir,{recursive:true})
const fixtures=JSON.parse(await readFile(process.env.PERFORMANCE_FIXTURES??'/private/tmp/writeoffs-phase3-final/fixtures.json','utf8'))
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
const browser=await chromium.launch({headless:true}),contexts=[],results={reads:[],pages:[],ramps:[],errors:[]}
try{
 for(const fixture of fixtures){
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
 async function read(context){const started=performance.now();try{const r=await context.request.get(origin+'/api/bookkeeping/work',{timeout:30000});const body=await r.body();return{ms:performance.now()-started,status:r.status(),bytes:body.length,serverTiming:r.headers()['server-timing']??null}}catch(error){return{ms:performance.now()-started,status:0,error:String(error)}}}
 for(let i=0;i<24;i++)results.reads.push({iteration:i,phase:i===0?'first-touch-not-proven-cold':'warm',...await read(contexts[0])})
 for(const route of ['/home','/check-in']){
  const page=await contexts[0].newPage()
  for(let i=0;i<8;i++){
   const started=performance.now();try{await page.goto(origin+route,{waitUntil:'domcontentloaded'});await page.locator('[data-customer-action-count]').waitFor();results.pages.push({route,iteration:i,ms:performance.now()-started,phase:i===0?'first-touch':'warm'})}catch(error){results.errors.push({route,error:String(error)});break}
  }
  await page.close()
 }
 // Bounded bursts, not a claim that these six tenants represent full production capacity.
 // 25/100/750 simultaneously active customers answering once per 30 s imply
 // ~0.83/3.33/25 commands per second. These probes expose obvious serialization only.
 if(process.argv.includes('--concurrency'))for(const stage of [{cohort:25,concurrency:2,requests:8},{cohort:100,concurrency:8,requests:24},{cohort:750,concurrency:25,requests:50}]){
  let issued=0;const observations=[],started=performance.now()
  await Promise.all(Array.from({length:stage.concurrency},async()=>{while(issued<stage.requests){const index=issued++;observations.push(await read(contexts[index%contexts.length]))}}))
  const sorted=observations.map(r=>r.ms).sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1]
  results.ramps.push({...stage,elapsedMs:performance.now()-started,observations})
  if(observations.some(r=>r.status!==200)||p95>5000){results.errors.push({stage:stage.cohort,reason:'Stopped ramp: error or >5s p95'});break}
 }
}finally{await writeFile(`${dir}/measurements.json`,JSON.stringify(results,null,2));await browser.close()}
const summarize=rows=>{const values=rows.map(r=>r.ms).sort((a,b)=>a-b),q=p=>values[Math.max(0,Math.ceil(values.length*p)-1)];return{n:values.length,p50:q(.5),p75:q(.75),p95:q(.95),max:values.at(-1)}}
console.log(JSON.stringify({projection:{...summarize(results.reads.filter(r=>r.phase==='warm')),failures:results.reads.filter(r=>r.status!==200).length},pages:['/home','/check-in'].map(route=>({route,...summarize(results.pages.filter(r=>r.route===route&&r.phase==='warm'))})),ramps:results.ramps.map(r=>({cohort:r.cohort,...summarize(r.observations),failures:r.observations.filter(o=>o.status!==200).length})),errors:results.errors},null,2))
