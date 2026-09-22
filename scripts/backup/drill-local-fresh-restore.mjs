#!/usr/bin/env node
// Internal deterministic drill: actual PostgreSQL dump/restore, local encrypted ledger.
// This is NOT certification of hosted Supabase isolation or live S3 ledger permissions.
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHmac,randomBytes,randomUUID} from 'node:crypto'
import {sealDeletionEntry,openDeletionEntry} from './independent-deletion-ledger.mjs'
import {reconcilePrivateArtifacts} from './reconcile-private-objects.mjs'
import {restoreFreshTarget} from './restore-controller.mjs'
if(process.argv[2]!=='--synthetic-only')throw new Error('SYNTHETIC_CONFIRMATION_REQUIRED')
const base=resolve(process.argv[3]??'')
const root=join(base,'run-'+randomUUID())
if(!base.startsWith('/private/tmp/writeoffs-dr-schema-'))throw new Error('PRIVATE_DR_DIRECTORY_REQUIRED')
process.umask(0o077)
mkdirSync(root,{recursive:true})
const source=readFileSync(join(base,'container'),'utf8').trim()
const docker=(args,options={})=>execFileSync('docker',args,{stdio:['pipe','pipe','pipe'],maxBuffer:64*1024*1024,...options})
const inspect=name=>JSON.parse(docker(['inspect',name]).toString())[0]
const src=inspect(source)
if(src.Config.Labels?.['writeoffs.synthetic-dr']!=='true'||src.HostConfig.NetworkMode!=='none')throw new Error('SOURCE_NOT_ISOLATED_SYNTHETIC')
const sql=(container,db,query)=>docker(['exec','-i',container,'psql','-U','supabase_admin','-d',db,'-Atq','-v','ON_ERROR_STOP=1'],{input:query}).toString().trim()
const literal=s=>"'"+String(s).replaceAll("'","''")+"'"
sql(source,'dr_source','create extension if not exists pgcrypto with schema extensions;')
const key=randomBytes(32),hmac=randomBytes(32).toString('hex')
const identity=(kind,id)=>createHmac('sha256',hmac).update(`writeoffs-deletion:v1:${kind}:${id}`).digest('hex')
const tenants=[0,1].map(()=>({user:randomUUID(),business:randomUUID(),account:randomUUID(),record:randomUUID()}))
const [deleted,kept]=tenants
const storage=join(root,'synthetic-storage');mkdirSync(storage,{recursive:true})
for(const t of tenants){
 sql(source,'dr_source',`begin; set local session_replication_role=replica;
 insert into auth.users(id,email) values('${t.user}','synthetic-${t.user}@example.test');
 insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret) values(gen_random_uuid(),'${t.user}','totp','verified',now(),now(),'synthetic-not-a-real-secret');
 insert into public.businesses(id,owner_user_id,name) values('${t.business}','${t.user}','Synthetic DR fixture');
 insert into public.financial_accounts(id,business_id,institution_name,display_name,account_type) values('${t.account}','${t.business}','Synthetic','Synthetic','checking');
 insert into public.financial_transactions(business_id,financial_account_id,source_fingerprint,import_method,original_description,amount_cents,transaction_date) values('${t.business}','${t.account}','synthetic-${t.business}','provider','Synthetic expense',-12500,'2026-09-01');
 insert into public.plaid_items(business_id,plaid_item_id,access_token_ciphertext,environment,sync_cursor,sync_requested_at,sync_lease_id,sync_lease_expires_at) values('${t.business}','synthetic-${t.business}','synthetic-not-a-provider-token','sandbox','synthetic-cursor',now(),gen_random_uuid(),now()+interval '1 hour');
 insert into public.bookkeeping_records(id,business_id,source_kind,ingestion_key,amount_cents) values('${t.record}','${t.business}','financial_transaction','synthetic',-12500);
 insert into public.bookkeeping_decisions(business_id,bookkeeping_record_id,bookkeeping_nature,treatment,review_status,provenance) values('${t.business}','${t.record}','expense','business','resolved','system');
 insert into public.bookkeeping_processing_jobs(business_id,bookkeeping_record_id,processing_reason,target_fingerprint,state,lease_id,lease_expires_at,claimed_at) values('${t.business}','${t.record}','synthetic','synthetic','processing',gen_random_uuid(),now()+interval '1 hour',now());
 insert into public.receipts(user_id,business_id,storage_path,mime_type,bytes) values('${t.user}','${t.business}','receipts/${t.user}/receipt.pdf','application/pdf',16);
 commit;`)
 for(const kind of ['receipts','statements']){mkdirSync(join(storage,kind,t.user),{recursive:true});writeFileSync(join(storage,kind,t.user,'synthetic.pdf'),'synthetic-private-document')}
}
const dump=join(root,'t1.dump')
writeFileSync(dump,docker(['exec',source,'pg_dump','-U','supabase_admin','-d','dr_source','-Fc','--no-owner']))
const backup=join(root,'t1.wobak'),backupKey=randomBytes(32).toString('base64')
execFileSync(process.execPath,['scripts/backup/create-encrypted-backup.mjs'],{env:{...process.env,WRITEOFFS_BACKUP_OUTPUT:backup,WRITEOFFS_BACKUP_DATABASE_DUMP:dump,WRITEOFFS_BACKUP_STORAGE_ROOT:storage,WRITEOFFS_BACKUP_KEY_BASE64:backupKey,WRITEOFFS_BACKUP_SOURCE_ENVIRONMENT:'staging',WRITEOFFS_BACKUP_EXPECTED_SUPABASE_PROJECT_REF:'isolated-synthetic-dr'},stdio:'pipe'})
const entry={deletion_request_id:randomUUID(),business_identity_hash:identity('business',deleted.business),user_identity_hash:identity('user',deleted.user),reason:'customer_request',effective_at:new Date().toISOString()}
const ledgerPath=join(root,'independent-entry.wodel'),fd=openSync(ledgerPath,'wx',0o600)
try{writeFileSync(fd,sealDeletionEntry(entry,key,'synthetic-dr'));fsyncSync(fd)}finally{closeSync(fd)}
const load=()=>[openDeletionEntry(readFileSync(ledgerPath),key,'synthetic-dr')]
function removeTenant(container,db,objects,entries){
 sql(container,db,`select public.reconcile_restored_deletion_tombstones(${literal(JSON.stringify(entries))}::jsonb,${literal(hmac)},now());`)
 const request=sql(container,db,`select id from public.account_deletion_requests where business_id='${deleted.business}' and status in('scheduled','retryable','executing');`)
 if(!request)return
 for(const kind of ['receipts','statements'])rmSync(join(objects,kind,deleted.user),{recursive:true,force:true})
 const lease=randomUUID()
 sql(container,db,`select id from public.claim_due_account_deletions(20,'${lease}',now());select public.delete_customer_application_data('${request}','${lease}',now());delete from auth.users where id='${deleted.user}';select public.complete_account_deletion('${request}','${lease}',now());`)
}
removeTenant(source,'dr_source',storage,load())
if(sql(source,'dr_source',`select count(*) from public.businesses where id='${deleted.business}';`)!=='0')throw new Error('T2_DELETION_FAILED')
let targetName,restoredStorage,oldCustomerObserved=false
const evidence=[]
const provider={
 fenceSource:async()=>{docker(['pause',source]);return source},
 verifySourceFence:async()=>inspect(source).State.Paused===true,
 createIsolatedTarget:async({operationId})=>{
  targetName='writeoffs-dr-restore-'+randomUUID().slice(0,8)
  docker(['run','-d','--network','none','--label','writeoffs.synthetic-dr=true','--name',targetName,'-e','POSTGRES_PASSWORD','public.ecr.aws/supabase/postgres:17.6.1.147'],{env:{...process.env,POSTGRES_PASSWORD:randomBytes(32).toString('hex')}})
  let ready=false;for(let n=0;n<120;n++){try{if(['postgres','.postgres-wrapp'].includes(docker(['exec',targetName,'cat','/proc/1/comm']).toString().trim())){docker(['exec',targetName,'pg_isready','-U','supabase_admin']);ready=true;break}}catch{/* Initial server may restart during image initialization. */}await new Promise(r=>setTimeout(r,250))}if(!ready)throw new Error('DR_DATABASE_NOT_READY')
  const roles=readFileSync(join(base,'roles.sql'),'utf8').split('\n').filter(Boolean).map(r=>`do $dr$ begin ${r} exception when duplicate_object then null; end $dr$;`).join('\n')
  sql(targetName,'postgres',roles)
  docker(['exec',targetName,'createdb','-U','supabase_admin','-T','template0','dr_restored'])
  return {id:targetName,sourceId:source,operationId}
 },
 verifyIsolation:async()=>{const x=inspect(targetName);return x.HostConfig.NetworkMode==='none'&&!Object.values(x.NetworkSettings.Ports??{}).some(Boolean)&&Object.keys(x.NetworkSettings.Networks).every(k=>k==='none')},
 restoreArtifacts:async()=>{
  const targetDump=join(root,'recovered.dump');restoredStorage=join(root,'restored-storage')
  execFileSync(process.execPath,['scripts/backup/restore-encrypted-backup.mjs'],{env:{...process.env,WRITEOFFS_RESTORE_INPUT:backup,WRITEOFFS_RESTORE_DATABASE_DUMP_OUTPUT:targetDump,WRITEOFFS_RESTORE_STORAGE_ROOT:restoredStorage,WRITEOFFS_RESTORE_CONFIRM_ISOLATED:'yes',WRITEOFFS_BACKUP_KEY_BASE64:backupKey},stdio:'pipe'})
  docker(['exec','-i',targetName,'pg_restore','-U','supabase_admin','--no-owner','--exit-on-error','-d','dr_restored'],{input:readFileSync(targetDump)})
  oldCustomerObserved=sql(targetName,'dr_restored',`select count(*) from public.businesses where id='${deleted.business}';`)==='1'
  if(!oldCustomerObserved||!existsSync(join(restoredStorage,'receipts',deleted.user,'synthetic.pdf')))throw new Error('T1_CUSTOMER_NOT_RESTORED')
 },
 reconcile:async(_target,entries)=>{await reconcilePrivateArtifacts({root:restoredStorage,entries,hmacKey:hmac});removeTenant(targetName,'dr_restored',restoredStorage,entries)},
 verifyReconciliation:async()=>{
  const count=(table,field,id)=>Number(sql(targetName,'dr_restored',`select count(*) from ${table} where ${field}='${id}';`))
  return {application:['businesses','financial_transactions','financial_accounts','bookkeeping_records','bookkeeping_decisions'].every(t=>count('public.'+t,t==='businesses'?'id':'business_id',deleted.business)===0),authMfa:count('auth.users','id',deleted.user)===0&&count('auth.mfa_factors','user_id',deleted.user)===0,plaid:count('public.plaid_items','business_id',deleted.business)===0,privateObjects:['receipts','statements'].every(k=>!existsSync(join(restoredStorage,k,deleted.user))),jobsAndLeases:count('public.bookkeeping_processing_jobs','business_id',deleted.business)===0,survivingTenant:count('public.businesses','id',kept.business)===1&&count('public.financial_transactions','business_id',kept.business)===1&&count('auth.mfa_factors','user_id',kept.user)===1&&existsSync(join(restoredStorage,'receipts',kept.user,'synthetic.pdf'))}
 },
 verifyOtherRestoreChecks:async()=>oldCustomerObserved,
 activateVerifiedTarget:async()=>{if(!await provider.verifyIsolation()||!await provider.verifySourceFence())return false;return true},
 blockTarget:async()=>{if(targetName)docker(['stop',targetName])},
}
try{
 const result=await restoreFreshTarget({provider,ledger:{loadCurrent:async()=>load()},backup,audit:{record:async e=>{evidence.push(e);const f=openSync(join(root,'audit.json'),'w',0o600);try{writeFileSync(f,JSON.stringify(evidence));fsyncSync(f)}finally{closeSync(f)}}}})
 const report={kind:'INTERNAL_DETERMINISTIC_POSTGRES_DRILL',hostedSupabaseCertified:false,liveS3LedgerCertified:false,customerNetworkingEnabled:false,oldCustomerObservedBeforeReconciliation:oldCustomerObserved,checks:await provider.verifyReconciliation(),controller:result,audit:evidence}
 writeFileSync(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{
 // Fixtures remain isolated for inspection. No hosted service is involved.
 if(inspect(source).State.Paused)docker(['unpause',source])
 key.fill(0)
}
