// Synthetic-only command-boundary certification; no direct result writes.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID,createHmac} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {SupabaseBookkeepingRepository} from '../app/lib/bookkeeping/supabase-repository'
import {evaluateBookkeepingProcessingJob} from '../app/lib/bookkeeping/processing'
import {correctCanonicalTransactionUse} from '../app/lib/bookkeeping/transaction-corrections'
async function main(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
 const fixtures=JSON.parse(await readFile('/private/tmp/writeoffs-workflow/fixtures.json','utf8')),f=fixtures[1],admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}}),db=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}})
 assert.equal((await admin.auth.admin.getUserById(f.userId)).data.user?.user_metadata.synthetic_workflow,true)
 assert(!(await db.auth.signInWithPassword({email:f.email,password:f.password})).error)
 const bits=[...f.totpSecret.replace(/=+$/,'')].map(c=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0')).join(''),key=Buffer.from(Array.from({length:Math.floor(bits.length/8)},(_,i)=>parseInt(bits.slice(i*8,i*8+8),2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(counter).digest(),offset=hash.at(-1)!&15
 assert(!(await db.auth.mfa.challengeAndVerify({factorId:f.factorId,code:String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')})).error)
 assert(!(await db.rpc('set_financial_account_use',{p_financial_account_id:f.accountId,p_designation:'business_only',p_effective_at:new Date().toISOString(),p_request_id:randomUUID()})).error)
 const trusted=new SupabaseBookkeepingRepository(admin),writer=new SupabaseBookkeepingRepository(db)
 const current=async(id:string)=>{const r=await db.from('bookkeeping_decisions').select('id,supersedes_decision_id,treatment').eq('bookkeeping_record_id',id);assert(!r.error);return r.data!.find(d=>!r.data!.some(n=>n.supersedes_decision_id===d.id))!}
 async function source(amount:number,date='2026-05-12'){
  const fp='workflow-boundary:'+randomUUID(),t=await admin.from('financial_transactions').insert({business_id:f.businessId,financial_account_id:f.accountId,source_fingerprint:fp,import_method:'csv',merchant_name:amount<0?'OFFICE DEPOT':'REFUND - OFFICE DEPOT',original_description:amount<0?'OFFICE DEPOT':'REFUND - OFFICE DEPOT',amount_cents:amount,currency:'USD',transaction_date:date}).select('id').single();assert(t.data&&!t.error)
  const record=await trusted.ensureRecord({actor:{businessId:f.businessId,userId:null,provenance:'automation'},record:{sourceKind:'financial_transaction',financialTransactionId:t.data.id,ingestionKey:fp,amountCents:amount,currency:'USD',occurredOn:date}})
  await trusted.attachFinancialSource({actor:{businessId:f.businessId,userId:null,provenance:'automation'},recordId:record.id,financialTransactionId:t.data.id});await writer.ensureInitialUnresolvedDecision(f.businessId,record.id)
  await evaluateBookkeepingProcessingJob(admin,{business_id:f.businessId,bookkeeping_record_id:record.id,processing_reason:'deterministic_evaluation',target_fingerprint:'bookkeeping-evaluator:v2:record:boundary'},{allowAiShadow:false})
  return {id:record.id,transactionId:t.data.id}
 }
 const act=async(id:string,action:string,original?:string,businessCents?:number)=>db.rpc('record_special_transaction',{p_record:id,p_expected:(await current(id)).id,p_request:randomUUID(),p_action:action,p_original:original??null,p_business_cents:businessCents??null})
 async function refund(amount:number,original:string,business?:number,date='2026-05-28'){const r=await source(amount,date);assert(!(await act(r.id,'merchant_return')).error);const linked=await act(r.id,'refund_link',original,business);return {r,linked}}
 console.log('Full return and cap');const full=await source(-10000);assert.equal((await current(full.id)).treatment,'business');assert(!(await refund(10000,full.id)).linked.error);assert((await refund(100,full.id)).linked.error)
 console.log('Multiple partial returns');const partial=await source(-10000);assert(!(await refund(2000,partial.id)).linked.error);assert(!(await refund(3000,partial.id)).linked.error);assert((await refund(6000,partial.id)).linked.error)
 console.log('Mixed return');const mixed=await source(-20000);await correctCanonicalTransactionUse({supabase:db,financialTransactionId:mixed.transactionId,expectedCurrentDecisionId:(await current(mixed.id)).id,correctionRequestId:randomUUID(),answer:{schemaVersion:1,use:'mixed',personalAmountCents:7000}});assert(!(await refund(5000,mixed.id,3000)).linked.error);assert((await refund(6000,mixed.id,0)).linked.error)
 console.log('Cross-year and foreign original');const prior=await source(-10000,'2025-12-20');assert((await refund(1000,prior.id,undefined,'2026-01-10')).linked.error);assert((await refund(1000,fixtures[0].records.find((r:{merchant:string})=>r.merchant==='OFFICE DEPOT').recordId)).linked.error)
 console.log('Retry and correction invalidation');const original=await source(-9000),ret=await source(1000);assert(!(await act(ret.id,'merchant_return')).error);const args={p_record:ret.id,p_expected:(await current(ret.id)).id,p_request:randomUUID(),p_action:'refund_link',p_original:original.id,p_business_cents:null};const one=await db.rpc('record_special_transaction',args),two=await db.rpc('record_special_transaction',args);assert(!one.error&&!two.error);assert.equal(one.data,two.data)
 await correctCanonicalTransactionUse({supabase:db,financialTransactionId:original.transactionId,expectedCurrentDecisionId:(await current(original.id)).id,correctionRequestId:randomUUID(),answer:{schemaVersion:1,use:'personal'}});assert.equal((await current(ret.id)).treatment,'unresolved')
 console.log('Deferral/unknown distinction');const pending=await source(1234);assert(!(await act(pending.id,'merchant_return')).error);assert(!(await act(pending.id,'unsure')).error);assert(!(await act(pending.id,'defer')).error);assert.equal((await current(pending.id)).treatment,'unresolved')
 const foreign=await db.rpc('record_special_transaction',{p_record:fixtures[0].records[0].recordId,p_expected:fixtures[0].records[0].decisionId,p_request:randomUUID(),p_action:'owner_use'});assert(foreign.error)
 await writeFile('/private/tmp/writeoffs-workflow/proof/boundaries.json',JSON.stringify({passed:true,full:true,partial:true,multiple:true,mixed:true,caps:true,crossYear:true,tenant:true,retry:true,correctionInvalidation:true,deferral:true}),{mode:0o600});await db.auth.signOut();console.log('Special transaction command boundaries passed.')
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Boundary certification failed');process.exitCode=1})
