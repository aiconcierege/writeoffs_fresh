// Sequential authenticated request-floor measurement. Invalid commands exit before
// bookkeeping reads/writes. Only existing explicitly marked synthetic tenants.
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
const browser=await chromium.launch({headless:true}),contexts=[],results={reads:[],pages:[],ramps:[],errors:[]}
try{
 for(const fixture of fixtures.slice(0,1)){
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
 for(let i=0;i<21;i++){
  const start=performance.now();const r=await contexts[0].request.post(origin+'/api/bookkeeping/questions/not-a-uuid',{data:{},timeout:5000});
  assert.equal(r.status(),400);results.reads.push({iteration:i,ms:performance.now()-start,headers:{timing:r.headers()['server-timing'],proxy:r.headers()['x-betti-proxy-ms'],calls:r.headers()['x-betti-db-calls']}})
 }
}finally{await writeFile(`${dir}/floor.json`,JSON.stringify(results,null,2));await browser.close()}
const sorted=results.reads.slice(1).map(r=>r.ms).sort((a,b)=>a-b);console.log(JSON.stringify({n:sorted.length,p50:sorted[9],p95:sorted[18],max:sorted.at(-1)}))

}
main().catch(error=>{console.error(String(error instanceof Error?error.message:error).split('Call log:')[0]);process.exitCode=1})
