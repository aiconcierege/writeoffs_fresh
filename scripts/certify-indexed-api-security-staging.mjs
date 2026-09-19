// Real handler-boundary authentication checks on existing synthetic staging tenants.
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
 const f=fixtures[0],jar=new Map(),low=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:vs=>vs.forEach(v=>jar.set(v.name,v.value))}})
 assert(!(await low.auth.signInWithPassword({email:f.email,password:f.password})).error)
 const lowContext=await browser.newContext(),anonymous=await browser.newContext();contexts.push(lowContext,anonymous)
 const bypass=(await contexts[0].cookies()).filter(c=>c.name==='_vercel_jwt')
 for(const c of [lowContext,anonymous])await c.addCookies(bypass)
 await lowContext.addCookies([...jar].map(([name,value])=>({name,value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})))
 const checks=[]
 for(const [context,expected] of [[lowContext,403],[anonymous,401]]){
  for(const [path,method] of [['/api/bookkeeping/work','GET'],['/api/bookkeeping/work?view=guided&presented=foreign-action&presentedVersion=foreign-version','GET'],['/api/bookkeeping/questions/11111111-1111-4111-8111-111111111111','POST']]){
   const r=await context.request.fetch(origin+path,{method,headers:{'if-match':'22222222-2222-4222-8222-222222222222','x-betti-guided':'1','x-user-id':f.userId,'x-business-id':f.businessId},...(method==='POST'?{data:{action:'defer'}}:{})})
   assert.equal(r.status(),expected,path);checks.push({path,assurance:expected===403?'AAL1':'anonymous',status:r.status()})
  }
 }
 const workResponse=await contexts[0].request.get(origin+'/api/bookkeeping/work');assert.equal(workResponse.status(),200)
 const work=await workResponse.json();assert.equal(work.businessId,f.businessId);assert.equal(work.index?.version,1)
 const presentedResponse=await contexts[0].request.get(origin+'/api/bookkeeping/work?view=guided&presented=foreign-action&presentedVersion=foreign-version')
 assert.equal(presentedResponse.status(),200);const presented=await presentedResponse.json()
 assert.equal(presented.businessId,f.businessId);assert(!JSON.stringify(presented).includes('foreign-action'));assert(!JSON.stringify(presented).includes('foreign-version'))
 checks.push({path:'presentation context',foreignDataReturned:false,status:200})
 await writeFile(dir+'/indexed-api-security.json',JSON.stringify({checks,aal2Read:true,spoofedHeadersRejected:true},null,2));console.log('PASS: indexed handlers reject anonymous/AAL1 requests and spoofed identity headers; real AAL2 reads remain available')
}finally{for(const c of contexts)await c.close();await browser.close()}
}
main().catch(error=>{console.error(String(error instanceof Error?error.message:error).split('Call log:')[0]);process.exitCode=1})
