import {pathToFileURL} from 'node:url'
import {createClient} from '@supabase/supabase-js'
import {S3Client} from '@aws-sdk/client-s3'
import {canonicalDeletionEntry,persistIndependentDeletion} from './independent-deletion-ledger.mjs'
export async function reconcileCompletedTombstones({database,publish}){
 const entries=[];let offset=0
 for(;;){const page=await database.from('account_deletion_tombstones').select('deletion_request_id,business_identity_hash,user_identity_hash,reason,effective_at').order('deletion_request_id').range(offset,offset+499)
  if(page.error||!Array.isArray(page.data))throw Error('BACKFILL_SOURCE_READ_FAILED')
  for(const row of page.data){const request=await database.from('account_deletion_requests').select('status,completed_at').eq('id',row.deletion_request_id).single();if(request.error||request.data?.status!=='completed'||!request.data.completed_at)throw Error('BACKFILL_COMPLETED_EVIDENCE_REQUIRED');entries.push(canonicalDeletionEntry(row))}
  if(page.data.length<500)break;offset+=500;if(offset>100000)throw Error('BACKFILL_SAFETY_LIMIT')
 }
 // Validate every source row first. Preserve authoritative hashes/time; never synthesize identities.
 for(const entry of entries){const receipt=await publish(entry);if(!receipt?.versionId)throw Error('BACKFILL_DURABILITY_REQUIRED')}
 return {result:'PASS',authoritativeCompletedTombstones:entries.length,durableEntriesVerified:entries.length,fabricatedEntries:0,sourceModified:false}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let client,key;try{
 if(process.env.GITHUB_REPOSITORY!=='aiconcierege/writeoffs_fresh'||process.env.GITHUB_REF!=='refs/heads/v2-onboarding-staging'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('BACKFILL_RUNNER_REQUIRED')
 key=Buffer.from(process.env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64??'','base64');if(key.length!==32)throw Error('BACKFILL_KEY_INVALID')
 const database=createClient('https://sgrqrrxrlglhjuetdtps.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 client=new S3Client({region:'us-east-2',credentials:{accessKeyId:process.env.WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID,secretAccessKey:process.env.WRITEOFFS_DELETION_LEDGER_SECRET_ACCESS_KEY}})
 console.log(JSON.stringify(await reconcileCompletedTombstones({database,publish:entry=>persistIndependentDeletion({client,bucket:'writeoffs-backups-264524064115-us-east-2-an',source:'staging',encryptionKey:key,entry})})))
}catch(e){console.error(JSON.stringify({result:'FAIL',code:/^(BACKFILL|INDEPENDENT_DELETION|DELETION_LEDGER|INVALID_DELETION|LEDGER)_[A-Z0-9_]+$/.test(e.message)?e.message:'BACKFILL_FAILED'}));process.exitCode=1}finally{client?.destroy();key?.fill(0)}}
