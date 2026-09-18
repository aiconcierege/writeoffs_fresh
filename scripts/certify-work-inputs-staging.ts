// Read-only equivalence/security/performance probe. No fixture creation or answers.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createServerClient} from '@supabase/ssr'
import {createClient} from '@supabase/supabase-js'
import {loadBettiWork,loadBettiWorkReference} from '../app/lib/bookkeeping/betti-work-loader'
import {guidedWorkProjection} from '../app/lib/bookkeeping/guided-work-projection'
async function main(){
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
assert(process.argv.includes('--certify'))
const dir='/private/tmp/writeoffs-perf2-equivalence';await mkdir(dir,{recursive:true})
const paths=process.env.PERFORMANCE_FIXTURES?.split(',')??['/private/tmp/writeoffs-phase3-final/fixtures.json','/private/tmp/writeoffs-phase3-performance-final/fixtures.json','/private/tmp/writeoffs-phase3-performance-baseline/fixtures.json']
const fixtures=(await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8'))))).flat()
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
function totp(secret:string){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)!&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
const results=[]
for(const f of fixtures){
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
 const jar=new Map<string,string>();let calls=0
 const client=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))},global:{fetch:async(input,init)=>{calls++;return fetch(input,init)}}})
 assert(!(await client.auth.signInWithPassword({email:f.email,password:f.password})).error)
 const low=await client.rpc('read_betti_work_inputs',{p_business_id:f.businessId,p_as_of:new Date().toISOString()});assert(low.error,'MFA must be required')
 assert(!(await client.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
 const foreign=fixtures.find(other=>other.businessId!==f.businessId);assert(foreign)
 assert((await client.rpc('read_betti_work_inputs',{p_business_id:foreign.businessId,p_as_of:new Date().toISOString()})).error,'Foreign snapshot must be rejected')
 const asOf=new Date().toISOString(),input={db:client,businessId:f.businessId,scope:'business' as const,asOf}
 let equivalent=false
 for(let attempt=0;attempt<3;attempt++){
  calls=0;const started=performance.now();const full=await loadBettiWork(input);const atomicMs=performance.now()-started,atomicCalls=calls
  const before=await client.rpc('read_betti_work_inputs',{p_business_id:f.businessId,p_as_of:asOf});assert(!before.error)
  calls=0;const oldStarted=performance.now();const reference=await loadBettiWorkReference(input);const referenceMs=performance.now()-oldStarted,referenceCalls=calls
  const after=await client.rpc('read_betti_work_inputs',{p_business_id:f.businessId,p_as_of:asOf});assert(!after.error)
  // Retry measurement only if actual workers changed canonical inputs. Never repair.
  const comparable=(value:Record<string,unknown>)=>({...value,timings:undefined})
  if(JSON.stringify(comparable(before.data))!==JSON.stringify(comparable(after.data)))continue
  assert.deepEqual(full,reference,'Atomic inputs changed canonical eligibility or projection')
  const narrow=guidedWorkProjection(full)
  assert.deepEqual(narrow.nextAction,reference.nextAction)
  assert.equal(narrow.customer.actionableCount,reference.customer.actionableCount)
  results.push({scenario:f.scenario??'continuity',atomicMs,atomicCalls,referenceMs,referenceCalls,actions:full.customer.actionableCount,
   nextType:full.nextAction?.type??null,fullBytes:JSON.stringify(full).length,narrowBytes:JSON.stringify(narrow).length,
   snapshotBytes:JSON.stringify(after.data).length,sqlTimings:after.data.timings,equivalent:true,mfa:true,tenantIsolation:true})
  equivalent=true;break
 }
 assert(equivalent,'Snapshot did not settle for differential measurement')
}
await writeFile(`${dir}/results.json`,JSON.stringify(results,null,2))
console.log(JSON.stringify(results,null,2))

}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1})
