// Isolated synthetic evidence only; never scans/claims another tenant's jobs.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {evaluateBookkeepingProcessingJob} from '../app/lib/bookkeeping/processing'
async function main(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!
 assert(process.env.WRITEOFFS_ENVIRONMENT==='staging'&&new URL(url).hostname==='sgrqrrxrlglhjuetdtps.supabase.co')
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
 const fixtures=JSON.parse(await readFile('/private/tmp/writeoffs-workflow/fixtures.json','utf8'))
 for(const f of fixtures){const checked=await admin.auth.admin.getUserById(f.userId);if(checked.error)throw new Error('Synthetic identity lookup: '+checked.error.message);assert.equal(checked.data.user?.user_metadata.synthetic_workflow,true)
  for(const r of f.records)await evaluateBookkeepingProcessingJob(admin,{business_id:f.businessId,bookkeeping_record_id:r.recordId,processing_reason:'deterministic_evaluation',target_fingerprint:'bookkeeping-evaluator:v2:record:certification'},{allowAiShadow:false})
 }
 console.log('Only isolated workflow fixtures reassessed through canonical evaluator.')
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Fixture reassessment failed');process.exitCode=1})
