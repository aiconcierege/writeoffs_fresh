// Isolated synthetic tenants only. Publishes derived index state; never answers questions.
import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient, type SupabaseClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {refreshBettiActionIndex} from '../app/lib/bookkeeping/action-index-worker'
import {readBettiActionIndex} from '../app/lib/bookkeeping/action-index-reader'
import {loadCanonicalBettiWork} from '../app/lib/bookkeeping/betti-work-loader'
async function main(){
 assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
 assert(process.argv.includes('--certify'))
 const fixtures=JSON.parse(await readFile(process.env.PERFORMANCE_FIXTURES??'/private/tmp/perf2-performance-fixtures.json','utf8'))
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 const results=[]
 function totp(secret:string){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),offset=h.at(-1)!&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
 for(const f of fixtures.slice(0,process.argv.includes('--one')?1:fixtures.length)){
  assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_guided_contract,true)
  const built=await refreshBettiActionIndex({admin,businessId:f.businessId,limit:2});assert.equal(built.failed,0,JSON.stringify(built))
  const jar=new Map<string,string>(),db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:vs=>vs.forEach(v=>jar.set(v.name,v.value))}})
  assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
  assert((await db.rpc('read_betti_action_index',{p_business_id:f.businessId})).error,'AAL1 must be denied')
  assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:totp(f.totpSecret)})).error)
  const other=fixtures.find((x:{businessId:string})=>x.businessId!==f.businessId)
  if(other)assert((await db.rpc('read_betti_action_index',{p_business_id:other.businessId})).error,'Foreign tenant must be denied')
  assert((await db.rpc('claim_betti_action_index_refresh',{p_lease_id:crypto.randomUUID(),p_business_id:f.businessId})).error,'Customer cannot claim builder')
  const before=await admin.from('betti_action_index_state').select('revision,published_revision').eq('business_id',f.businessId).single();assert(!before.error)
  const start=performance.now();const indexed=await readBettiActionIndex({db:db as SupabaseClient,businessId:f.businessId,view:'full'});const indexMs=performance.now()-start
  assert(indexed&&indexed.index.summaryCurrent,'Index must be settled for equivalence')
  const narrow=await readBettiActionIndex({db:db as SupabaseClient,businessId:f.businessId,view:'guided'})
  const referenceStart=performance.now();const reference=await loadCanonicalBettiWork({db:db as SupabaseClient,businessId:f.businessId,scope:'business',asOf:indexed.asOf});const referenceMs=performance.now()-referenceStart
  const after=await admin.from('betti_action_index_state').select('revision,published_revision').eq('business_id',f.businessId).single();assert(!after.error)
  assert.deepEqual(after.data,before.data,'Reads must not mutate or race canonical revision')
  // Compare the real JSON transport contract: undefined optional properties do
  // not survive either the ordinary endpoint or the persisted index.
  const wire=<T,>(value:T):T=>JSON.parse(JSON.stringify(value))
  assert.deepEqual(indexed.nextAction,wire(reference.nextAction),'Indexed/full canonical next action mismatch')
  assert.deepEqual(narrow?.nextAction,wire(reference.nextAction),'Narrow next action mismatch')
  assert.equal(indexed.customer.actionableCount,reference.customer.actionableCount)
  assert.equal(narrow?.customer.actionableCount,reference.customer.actionableCount)
  assert.deepEqual(indexed.customer.actionable,wire(reference.customer.actionable))
  results.push({scenario:f.scenario??'continuity',indexMs,referenceMs,actions:indexed.customer.actionableCount,indexBytes:JSON.stringify(indexed).length,narrowBytes:JSON.stringify(narrow).length,equivalent:true,mfa:true,tenant:true,readOnly:true})
 }
 const dir='/private/tmp/writeoffs-action-index-certification';await mkdir(dir,{recursive:true});await writeFile(dir+'/equivalence.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))
}
main().catch(error=>{console.error(String(error instanceof Error?error.message:error).split('Call log:')[0]);process.exitCode=1})
