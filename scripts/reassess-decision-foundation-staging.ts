import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { drainBookkeepingProcessingJobs } from '../app/lib/bookkeeping/processing'
import { SupabaseCanonicalReportingRepository } from '../app/lib/bookkeeping/reporting-repository'
import { buildCanonicalReport } from '../app/lib/bookkeeping/reporting-model'
async function main() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!
 assert(process.env.WRITEOFFS_ENVIRONMENT==='staging' && new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 const fixtures=JSON.parse(await readFile('/private/tmp/writeoffs-foundation/fixtures.json','utf8'))
 const targets=process.argv.includes('--rick') ? [JSON.parse(await readFile('/private/tmp/writeoffs-money-in/before.json','utf8'))] : fixtures
 const started=Date.now();let enqueued=0,completed=0,retried=0
 for(const target of targets) {
  const businessId=target.businessId
  if(!process.argv.includes('--rick')) {const user=await admin.auth.admin.getUserById(target.userId);assert(user.data.user?.user_metadata.synthetic_foundation===true)}
  let cursor:string|null=null
  for(let page=0;page<100;page++) {
   const batch: { data: Array<{record_id:string}> | null; error: {code?:string} | null }=await admin.rpc('enqueue_decision_foundation_batch',{p_business_id:businessId,p_after:cursor,p_limit:25})
   assert(!batch.error,batch.error?.code); if(!batch.data?.length)break
   enqueued+=batch.data.length;cursor=batch.data[batch.data.length-1].record_id
  }
 }
 for(let batch=0;batch<40;batch++) {
  const result=await drainBookkeepingProcessingJobs({admin,batchSize:25}); completed+=result.completed;retried+=result.retried
  console.log(JSON.stringify({batch,...result}))
  if(!result.claimed) {
   const remaining=await admin.from('bookkeeping_processing_jobs').select('id',{count:'exact',head:true})
    .in('business_id',targets.map((target:{businessId:string})=>target.businessId)).in('state',['pending','retryable','processing'])
   assert(!remaining.error,remaining.error?.code)
   if(!remaining.count)break
   await new Promise(resolve=>setTimeout(resolve,1000))
  }
 }
 const pending=await admin.from('bookkeeping_processing_jobs').select('id',{count:'exact',head:true})
  .in('business_id',targets.map((target:{businessId:string})=>target.businessId)).neq('state','completed')
 assert(!pending.error,pending.error?.code)
 assert.equal(pending.count,0,'Target reassessment still has unfinished jobs; do not certify completion')
 const reports=[]
 for(const target of targets) {
  const repo=new SupabaseCanonicalReportingRepository(admin),canonical=await repo.canonical.loadRecords({businessId:target.businessId,periodStart:'2026-01-01',periodEnd:'2026-12-31'})
  const report=buildCanonicalReport({canonicalRecords:canonical.records,legacyRecords:[],periodStart:'2026-01-01',periodEnd:'2026-12-31',currency:'USD',categoryLabels:await repo.loadCategoryLabels()})
  reports.push({businessId:target.businessId,report})
 }
 const result={enqueued,completed,retried,durationMs:Date.now()-started,reports}
 await writeFile(`/private/tmp/writeoffs-foundation/${process.argv.includes('--rick')?'rick':'synthetic'}-reassessment.json`,JSON.stringify(result),{mode:0o600})
 console.log(JSON.stringify({enqueued,completed,retried,durationMs:result.durationMs}))
 // Recovered retries are reported; unfinished/dead-letter work fails the assertion above.
}
main().catch(error=>{console.error('FOUNDATION_REASSESSMENT_FAILED', error instanceof Error ? error.message.replace(/[A-Za-z0-9_-]{40,}/g,'[redacted]'):'unknown');process.exitCode=1})
