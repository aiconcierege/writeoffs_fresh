// Tagged synthetic fixture only; never submits an answer for the clean-room customer.
import assert from 'node:assert/strict'
import type {WorkAction} from '../app/lib/bookkeeping/betti-work'
import {readFile,writeFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createServerClient} from '@supabase/ssr'
import {chromium} from '@playwright/test'
import {getAuthenticatedCanonicalReport} from '../app/lib/bookkeeping/reporting-service'
function totp(secret:string){const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.replace(/=+$/,'').toUpperCase()].map(c=>abc.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}

async function main(){
 process.umask(0o077)
 const mode=process.argv[2];assert(['--expect-rejection','--expect-success'].includes(mode))
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 assert.equal(new URL(url).hostname,'sgrqrrxrlglhjuetdtps.supabase.co')
 const f=JSON.parse(await readFile('/private/tmp/writeoffs-routing-certification/fixture.json','utf8'))
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
 const work=await(await context.request.get(origin+'/api/bookkeeping/work')).json()
 const action=work.customer.actionable.find((a:WorkAction)=>a.question?.transaction.merchant==='ATM WITHDRAWAL');assert(action?.question)
 const q=action.question
 const report=()=>getAuthenticatedCanonicalReport({supabase:db,periodStart:'2026-01-01',periodEnd:'2026-09-23'})
 const before=await report()
 const r=await context.request.post(origin+'/api/bookkeeping/questions/'+q.id,{headers:{'if-match':q.version,'x-betti-guided':'1'},data:{action:'not_sure'}})
 assert.equal(r.status(),mode==='--expect-rejection'?400:200)
 const after=await report()
 assert.equal(after.businessIncomeCents,before.businessIncomeCents);assert.equal(after.businessExpensesCents,before.businessExpensesCents);assert.equal(after.businessProfitCents,before.businessProfitCents)
 const events=await admin.from('bookkeeping_review_events').select('event_type,answer_payload,resulting_decision_id').eq('business_id',f.businessId).eq('review_issue_id',q.id)
 assert(!events.error)
 const answers=events.data.filter(e=>e.event_type==='answered')
 assert.equal(answers.length,mode==='--expect-success'?1:0)
 if(answers.length){
 const d=await admin.from('bookkeeping_decisions').select('bookkeeping_nature,treatment,business_purpose').eq('id',answers[0].resulting_decision_id).single()
 assert.equal(d.data?.bookkeeping_nature,null);assert.equal(d.data?.treatment,'unresolved');assert.equal(d.data?.business_purpose,null)
 assert.deepEqual(answers[0].answer_payload,{schemaVersion:1,response:'not_sure'})
 const next=await(await context.request.get(origin+'/api/bookkeeping/work')).json()
 assert(!next.customer.actionable.some((a:WorkAction)=>a.question?.id===q.id),'Uncertainty immediately re-asked')
 }
 const evidence={mode,status:r.status(),indexedBefore:work.index?.summaryCurrent??false,uncertaintyAnswers:answers.length,financialTotalsUnchanged:true,income:after.businessIncomeCents,expenses:after.businessExpensesCents,profit:after.businessProfitCents,atmRemainsUnresolved:true}
 await writeFile('/private/tmp/atm-hosted-'+mode.slice(2)+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
