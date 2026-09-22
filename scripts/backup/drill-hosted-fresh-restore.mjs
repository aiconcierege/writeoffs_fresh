#!/usr/bin/env node
// Explicitly reviewed synthetic certification. Never cut over a live application.
import {spawnSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,openSync,fsyncSync,closeSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto'
import {S3Client} from '@aws-sdk/client-s3'
import {hostedDrTarget,validateHostedDrConfig} from './hosted-dr-target.mjs'
import {syntheticTenant,seedSyntheticTenant,tenantSnapshot} from './hosted-dr-fixture.mjs'
import {persistIndependentDeletion,loadIndependentDeletions,canonicalDeletionEntry} from './independent-deletion-ledger.mjs'
import {reconcileHostedPrivateObjects} from './reconcile-hosted-private-objects.mjs'
import {restoreFreshTarget} from './restore-controller.mjs'

const report={kind:'HOSTED_DR_TEST',result:'FAIL',stage:'runner-validation',productionCutover:false,activationEligible:false}
let root,source,target
const ensure=(value,code)=>{if(!value)throw new Error(code)}
const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
const safeFailure=error=>/^(DR_|RESTORE_|DELETION_LEDGER_|INDEPENDENT_DELETION_|LEDGER_)[A-Z_]+$/.test(error?.message??'')?error.message:'DR_OPERATION_FAILED'
const capture=(bin,args,{input,env=process.env,timeout=180000}={})=>{
 const r=spawnSync(bin,args,{input,env,timeout,maxBuffer:96*1024*1024,encoding:undefined,stdio:['pipe','pipe','pipe']})
 if(r.status!==0){const error=new Error('DR_PROCESS_FAILED');error.sqlState=String(r.stderr??'').match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1];throw error}
 return r.stdout
}
const docker=(args,options)=>capture('docker',args,options)
const sqlSource=query=>docker(['exec','-i',source,'psql','-U','supabase_admin','-d','dr_source','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{input:query}).toString().trim()
const inspectSource=()=>JSON.parse(docker(['inspect',source]).toString())[0]
const audit=[]
function durableAudit(event){audit.push(event);const fd=openSync(join(root,'controller-audit.json'),'w',0o600);try{writeFileSync(fd,JSON.stringify(audit));fsyncSync(fd)}finally{closeSync(fd)}}
try{
 ensure(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='aiconcierege/writeoffs_fresh'&&process.env.GITHUB_REF==='refs/heads/v2-onboarding-staging'&&process.env.WRITEOFFS_HOSTED_DR_CONFIRM==='synthetic-only','DR_RUNNER_REQUIRED')
 process.umask(0o077);root=mkdtempSync(join(tmpdir(),'writeoffs-hosted-dr-'))
 const config=validateHostedDrConfig(JSON.parse(process.env.WRITEOFFS_TEMP_DR_TARGET_JSON??'null'))
 ensure(config.caCertificate?.startsWith('-----BEGIN CERTIFICATE-----'),'DR_CA_REQUIRED')
 const caFile=join(root,'provider-ca.crt');writeFileSync(caFile,config.caCertificate)
 target=hostedDrTarget(config,caFile)
 report.stage='target-preflight'
 ensure(target.sql("select count(*) from pg_tables where schemaname='public';")==='0'&&target.sql('select count(*) from auth.users;')==='0','DR_TARGET_NOT_EMPTY')
 ensure(await target.verifyPublicApis(),'DR_CUSTOMER_API_NOT_BLOCKED')
 ensure(await target.verifyPrivateObject('dr-isolation-canary','synthetic.txt'),'DR_PRIVATE_OBJECT_NOT_BLOCKED')
 target.applyBarrier();ensure(target.verifyBarrier(),'DR_PRIVILEGE_BARRIER_FAILED')
 report.initialIsolation=true
 const url=new URL(process.env.WRITEOFFS_BACKUP_DATABASE_URL??'')
 ensure(['postgres:','postgresql:'].includes(url.protocol)&&(url.hostname==='db.sgrqrrxrlglhjuetdtps.supabase.co'||(/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&decodeURIComponent(url.username)==='postgres.sgrqrrxrlglhjuetdtps')),'DR_SCHEMA_SOURCE_NOT_STAGING')
 report.stage='read-only-schema-copy'
 // No data rows or protected source files are copied from the application project.
 const schema=docker(['run','--rm','--network','host','--env','WRITEOFFS_BACKUP_DATABASE_URL','--env','PGOPTIONS=-c default_transaction_read_only=on','postgres:17.6-bookworm','sh','-ceu','pg_dump --schema-only --no-owner --no-acl --schema=auth --schema=public --schema=storage --schema=extensions "$WRITEOFFS_BACKUP_DATABASE_URL"'])
 report.schemaSha256=createHash('sha256').update(schema).digest('hex')
 source='writeoffs-dr-source-'+randomUUID().slice(0,8)
 report.stage='synthetic-source-creation'
 docker(['run','-d','--network','none','--label','writeoffs.synthetic-dr=true','--name',source,'--env','POSTGRES_PASSWORD','public.ecr.aws/supabase/postgres:17.6.1.147'],{env:{...process.env,POSTGRES_PASSWORD:randomBytes(32).toString('hex')}})
 let ready=false
 for(let n=0;n<120;n++){try{if(['postgres','.postgres-wrapp'].includes(docker(['exec',source,'cat','/proc/1/comm']).toString().trim())){docker(['exec',source,'pg_isready','-U','supabase_admin']);ready=true;break}}catch{/* New synthetic server starting. */}await new Promise(r=>setTimeout(r,250))}
 ensure(ready,'DR_SOURCE_NOT_READY')
 for(const role of ['supabase_etl_admin','dashboard_user','supabase_privileged_role','supabase_read_only_user'])docker(['exec','-i',source,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`do $role$ begin create role ${role}; exception when duplicate_object then null; end $role$;`})
 docker(['exec',source,'createdb','-U','supabase_admin','-T','template0','dr_source'])
 sqlSource('drop schema public;')
 sqlSource(schema)
 sqlSource('create extension if not exists pgcrypto with schema extensions;')
 // Current deployed schema must already contain the certified deletion operations.
 ensure(sqlSource("select to_regprocedure('public.reconcile_restored_deletion_tombstones(jsonb,text,timestamp with time zone)') is not null;")==='t','DR_SOURCE_DELETION_FUNCTION_MISSING')
 const A=syntheticTenant(),B=syntheticTenant(),hmac=randomBytes(32).toString('hex')
 const identity=(kind,id)=>createHmac('sha256',hmac).update(`writeoffs-deletion:v1:${kind}:${id}`).digest('hex')
 report.stage='synthetic-fixtures'
 for(const tenant of [A,B])sqlSource(seedSyntheticTenant(tenant))
 writeFileSync(join(root,'a-before.json'),JSON.stringify(tenantSnapshot(sqlSource,A)))
 const controlBefore=tenantSnapshot(sqlSource,B)
 const objectRoot=join(root,'private-objects');mkdirSync(objectRoot)
 for(const t of [A,B])for(const kind of ['receipts','statements']){mkdirSync(join(objectRoot,kind,t.user),{recursive:true});writeFileSync(join(objectRoot,kind,t.user,'synthetic.pdf'),'synthetic-private-document')}
 report.stage='t1-backup'
 const dump=join(root,'t1.dump');writeFileSync(dump,docker(['exec',source,'pg_dump','-U','supabase_admin','-d','dr_source','-Fc','--no-owner','--no-acl','--schema=public','--schema=auth']))
 const backup=join(root,'t1.wobak'),backupKey=randomBytes(32).toString('base64')
 capture(process.execPath,['scripts/backup/create-encrypted-backup.mjs'],{env:{...process.env,WRITEOFFS_BACKUP_OUTPUT:backup,WRITEOFFS_BACKUP_DATABASE_DUMP:dump,WRITEOFFS_BACKUP_STORAGE_ROOT:objectRoot,WRITEOFFS_BACKUP_KEY_BASE64:backupKey,WRITEOFFS_BACKUP_SOURCE_ENVIRONMENT:'staging',WRITEOFFS_BACKUP_EXPECTED_SUPABASE_PROJECT_REF:'isolated-synthetic-dr'}})
 const encryptionKey=Buffer.from(process.env.WRITEOFFS_DELETION_LEDGER_KEY_BASE64??'','base64');ensure(encryptionKey.length===32,'DR_LEDGER_KEY_INVALID')
 const client=prefix=>new S3Client({region:'us-east-2',credentials:{accessKeyId:process.env[prefix+'ACCESS_KEY_ID'],secretAccessKey:process.env[prefix+'SECRET_ACCESS_KEY']}})
 const writer=client('WRITEOFFS_DELETION_LEDGER_'),reader=client('WRITEOFFS_DELETION_LEDGER_RECOVERY_')
 const ledgerArgs={client:reader,bucket:'writeoffs-backups-264524064115-us-east-2-an',source:'staging',encryptionKey}
 report.stage='t2-verified-deletion-request'
 const claims=JSON.stringify({sub:A.user,role:'authenticated',aal:'aal2'})
 const requestId=sqlSource(`begin;select set_config('request.jwt.claims',${literal(claims)},true);select public.schedule_customer_account_deletion('${A.business}','${A.user}',${literal(identity('business',A.business))},${literal(identity('user',A.user))},'synthetic-hosted-dr-request');commit;`).split('\n').find(line=>/^[a-f0-9-]{36}$/.test(line))
 ensure(requestId,'DR_DELETION_REQUEST_FAILED')
 // Explicit synthetic clock advance, never applied to an application environment.
 sqlSource(`update public.account_deletion_requests set requested_at=now()-interval '8 days',scheduled_for=now()-interval '1 day' where id='${requestId}';`)
 const lease=randomUUID()
 sqlSource(`select id from public.claim_due_account_deletions(20,'${lease}',now());`)
 const effectiveAt=JSON.parse(sqlSource(`select to_json(started_at) from public.account_deletion_requests where id='${requestId}';`))
 const entry=canonicalDeletionEntry({deletion_request_id:requestId,business_identity_hash:identity('business',A.business),user_identity_hash:identity('user',A.user),reason:'customer_request',effective_at:effectiveAt})
 report.stage='t2-independent-publication'
 const receipt=await persistIndependentDeletion({...ledgerArgs,client:writer,entry})
 ensure(receipt.versionId,'DR_DURABLE_LEDGER_VERSION_MISSING');report.durableLedgerBeforeDeletion=true
 const complete=(sql,request,token,user)=>sql(`select public.delete_customer_application_data('${request}','${token}',now());delete from auth.users where id='${user}';select public.complete_account_deletion('${request}','${token}',now());`)
 for(const kind of ['receipts','statements'])rmSync(join(objectRoot,kind,A.user),{recursive:true})
 complete(sqlSource,requestId,lease,A.user)
 ensure(Object.values(tenantSnapshot(sqlSource,A)).every(rows=>rows.length===0),'DR_SOURCE_DELETION_INCOMPLETE')
 report.sourcePermanentDeletion=true
 report.stage='restore-controller'
 let restored=false,failedClosed=false
 const storagePaths=t=>['receipts','statements'].map(kind=>`${kind}/${t.user}/synthetic.pdf`)
 const isolation=async()=>target.verifyBarrier()&&await target.verifyPublicApis()&&await target.verifyPrivateObject('dr-isolation-canary','synthetic.txt')
 const provider={
  fenceSource:async()=>{if(!inspectSource().State.Paused)docker(['pause',source]);return source},
  verifySourceFence:async()=>inspectSource().State.Paused===true,
  createIsolatedTarget:async({operationId})=>{
   // Claim only the controller-provisioned, empty, exact allowlisted disposable target.
   // A second attempt may reuse only this run's isolated restored target after its failure test.
   ensure(!restored||failedClosed,'DR_TARGET_REUSE_FORBIDDEN')
   if(!restored)ensure(target.sql("select count(*) from pg_tables where schemaname='public';")==='0','DR_TARGET_NOT_FRESH')
   return {id:config.id,sourceId:source,operationId}
  },
  verifyIsolation:isolation,
  restoreArtifacts:async()=>{
   if(restored)return
   report.stage='t3-hosted-restore'
   const recoveredDump=join(root,'recovered.dump'),recoveredObjects=join(root,'recovered-objects')
   capture(process.execPath,['scripts/backup/restore-encrypted-backup.mjs'],{env:{...process.env,WRITEOFFS_RESTORE_INPUT:backup,WRITEOFFS_RESTORE_DATABASE_DUMP_OUTPUT:recoveredDump,WRITEOFFS_RESTORE_STORAGE_ROOT:recoveredObjects,WRITEOFFS_RESTORE_CONFIRM_ISOLATED:'yes',WRITEOFFS_BACKUP_KEY_BASE64:backupKey}})
   const pgRestore=args=>capture(process.execPath,['scripts/backup/pg17-client.mjs','pg_restore',...args],{env:{...process.env,WRITEOFFS_DR_WORK_DIRECTORY:root}})
   const toc=pgRestore(['--list',recoveredDump]).toString()
   // Managed hosted Auth schema remains provider-owned; restore users/MFA data, not Auth DDL.
   const chosen=toc.split('\n').filter(line=>line.startsWith(';')||(/ public /.test(line)&&!/(ACL|DEFAULT ACL)/.test(line))||/ TABLE DATA auth (users|mfa_factors) /.test(line)).join('\n')
   const list=join(root,'restore.list');writeFileSync(list,chosen)
   const restoreSql=pgRestore(['--no-owner','--no-acl','--use-list',list,'--file','-',recoveredDump]).toString()
   ensure(restoreSql.includes('CREATE SCHEMA public;'),'DR_PUBLIC_SCHEMA_NOT_IN_BACKUP')
   // API isolation remains outside the backup; no grants are restored. Revoke defaults in-transaction.
   target.sql(`begin;set local session_replication_role=replica;drop schema public;\n${restoreSql}\nrevoke all on all tables in schema public from public,anon,authenticated;revoke all on all sequences in schema public from public,anon,authenticated;revoke execute on all functions in schema public from public,anon,authenticated;commit;`)
   target.applyBarrier()
   await target.privateRequest('/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'receipts',name:'receipts',public:false})})
   for(const t of [A,B])for(const path of storagePaths(t))await target.privateRequest(`/object/receipts/${path}`,{method:'POST',headers:{'Content-Type':'application/pdf'},body:readFileSync(join(recoveredObjects,path))})
   restored=true
   ensure(JSON.stringify(tenantSnapshot(target.sql,A))===JSON.stringify(tenantSnapshotFromBackupA),'DR_A_NOT_RESURRECTED_EXACTLY')
   ensure(JSON.stringify(tenantSnapshot(target.sql,B))===JSON.stringify(controlBefore),'DR_CONTROL_RESTORE_MISMATCH')
   ensure(await isolation(),'DR_RESTORED_TARGET_EXPOSED')
   report.oldBackupRestoredBothTenants=true;report.customerAResurrectedBeforeReconciliation=true;report.activationBlockedAfterRestore=true
   for(const t of [A,B])for(const path of storagePaths(t))ensure(await target.verifyPrivateObject('receipts',path),'DR_RESTORED_PRIVATE_OBJECT_EXPOSED')
  },
  reconcile:async(_target,entries)=>{
   report.stage='independent-ledger-reconciliation'
   ensure(entries.some(x=>JSON.stringify(x)===JSON.stringify(entry)),'DR_LIVE_LEDGER_ENTRY_MISSING')
   target.sql(`select public.reconcile_restored_deletion_tombstones(${literal(JSON.stringify(entries))}::jsonb,${literal(hmac)},now());`)
   await reconcileHostedPrivateObjects({sql:target.sql,privateRequest:target.privateRequest,entries,hmacKey:hmac})
   const obligations=new Map(entries.map(value=>[value.deletion_request_id,value]))
   let finished=false
   for(let batch=0;batch<1000;batch++){
    const token=randomUUID()
    const requests=JSON.parse(target.sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.claim_due_account_deletions(20,'${token}',now()) r;`))
    if(!requests.length){finished=true;break}
    for(const request of requests){
     const obligation=obligations.get(request.id)
     ensure(obligation&&obligation.user_identity_hash===request.user_identity_hash&&obligation.business_identity_hash===request.business_identity_hash,'DR_RECONCILIATION_ID_MISMATCH')
     ensure(/^[a-f0-9-]{36}$/.test(request.owner_user_id),'DR_RECONCILIATION_USER_INVALID')
     complete(target.sql,request.id,token,request.owner_user_id)
    }
   }
   ensure(finished,'DR_RECONCILIATION_BATCH_LIMIT')
  },
  verifyReconciliation:async()=>{
   const after=tenantSnapshot(target.sql,A)
   const empty=names=>names.every(name=>after[name].length===0)
   const objectsGone=target.sql(`select count(*) from storage.objects where bucket_id='receipts' and (name like 'receipts/${A.user}/%' or name like 'statements/${A.user}/%');`)==='0'
   const bObjects=target.sql(`select count(*) from storage.objects where bucket_id='receipts' and (name like 'receipts/${B.user}/%' or name like 'statements/${B.user}/%');`)==='2'
   let bFiles=true;for(const path of storagePaths(B)){const r=await target.privateRequest(`/object/authenticated/receipts/${path}`);bFiles=bFiles&&(await r.text())==='synthetic-private-document'}
   const checks={application:empty(['public.businesses','public.financial_accounts','public.financial_transactions','public.bookkeeping_records','public.bookkeeping_decisions','public.bookkeeping_review_events','public.receipts']),authMfa:empty(['auth.users','auth.mfa_factors']),plaid:empty(['public.plaid_items']),privateObjects:objectsGone,jobsAndLeases:empty(['public.bookkeeping_processing_jobs']),survivingTenant:JSON.stringify(tenantSnapshot(target.sql,B))===JSON.stringify(controlBefore)&&bObjects&&bFiles}
   report.checks=checks
   report.minimizedTombstoneRetained=target.sql(`select count(*) from public.account_deletion_tombstones where deletion_request_id='${requestId}';`)==='1'
   return checks
  },
  verifyOtherRestoreChecks:async()=>report.customerAResurrectedBeforeReconciliation===true&&failedClosed&&report.minimizedTombstoneRetained===true,
  activateVerifiedTarget:async()=>{throw new Error('DR_ACTUAL_ACTIVATION_FORBIDDEN')},
  blockTarget:async()=>{target.applyBarrier();report.activationEligible=false},
 }
 // Snapshot A from the immutable backup's source before deletion, captured below via its T1 file.
 const tenantSnapshotFromBackupA=JSON.parse(readFileSync(join(root,'a-before.json'),'utf8'))
 const options={provider,backup,audit:{record:async event=>durableAudit(event)},activationMode:'verify-only'}
 // First run restores the old backup, then deliberately cannot authenticate the real ledger.
 try{await restoreFreshTarget({...options,ledger:{loadCurrent:()=>loadIndependentDeletions({...ledgerArgs,encryptionKey:randomBytes(32)})}});throw new Error('DR_FAILURE_GATE_ACCEPTED')}
 catch(error){ensure(error.message==='DELETION_LEDGER_INTEGRITY_FAILED','DR_FAILURE_TEST_UNEXPECTED');ensure(await isolation(),'DR_FAILURE_NOT_ISOLATED');ensure(!audit.some(e=>e.state==='eligible-not-activated'||e.state==='activated'),'DR_FAILURE_GATE_OPEN');failedClosed=true;report.ledgerDecryptionFailureStayedClosed=true}
 const result=await restoreFreshTarget({...options,ledger:{loadCurrent:()=>loadIndependentDeletions(ledgerArgs)}})
 ensure(result.activated===false&&result.activationEligible===true,'DR_UNEXPECTED_ACTIVATION')
 report.activationEligible=true;report.customerAccessEnabled=false;report.normalWorkersEnabled=false;report.result='PASS';report.stage='complete'
 report.controllerAudit=audit.map(({state})=>({state}));report.deletionPath='Canonical verified-request/claim/delete/complete SQL operations; synthetic clock advance; hosted Auth/MFA SQL deletion; no real Plaid Item or provider call.'
 encryptionKey.fill(0)
}catch(error){report.failureCode=safeFailure(error);if(/^[0-9A-Z]{5}$/.test(error.sqlState??''))report.sqlState=error.sqlState}
finally{
 if(source)try{docker(['rm','-f',source])}catch{report.localSourceCleanupFailed=true}
 // Hosted target remains isolated for external verified cleanup; no management token is in this job.
 report.hostedTargetCleanupRequired=true;report.checkedAt=new Date().toISOString()
 console.log(JSON.stringify(report,null,2))
 if(root)rmSync(root,{recursive:true,force:true})
 if(report.result!=='PASS')process.exitCode=1
}
