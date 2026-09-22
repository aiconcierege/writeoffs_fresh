#!/usr/bin/env node
// Runs the SAME hosted drill body, substituting only external provider boundaries.
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomBytes,randomUUID} from 'node:crypto'
import {runDrill} from './drill-hosted-fresh-restore.mjs'
import {publicBarrierSql,restoreIsolationSql} from './hosted-dr-target.mjs'
if(process.argv[2]!=='--synthetic-only')throw new Error('SYNTHETIC_CONFIRMATION_REQUIRED')
if(Object.keys(process.env).some(k=>k.startsWith('WRITEOFFS_DELETION_LEDGER_')||k==='WRITEOFFS_TEMP_DR_TARGET_JSON'||k==='WRITEOFFS_BACKUP_DATABASE_URL'||k==='AWS_ACCESS_KEY_ID'||k==='AWS_SECRET_ACCESS_KEY'))throw new Error('LIVE_CREDENTIALS_FORBIDDEN')
process.umask(0o077)
const root=mkdtempSync(join(tmpdir(),'writeoffs-hosted-contract-'))
const docker=(args,input)=>{try{return execFileSync('docker',args,{input,stdio:['pipe','pipe','pipe'],maxBuffer:96*1024*1024})}catch(e){writeFileSync(join(root,'last-error.txt'),e.stderr??'');const error=new Error('DR_LOCAL_DATABASE_FAILED');error.sqlState=String(e.stderr??'').match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1];throw error}}
const source=process.env.WRITEOFFS_LOCAL_DR_SCHEMA_CONTAINER??readFileSync('/private/tmp/writeoffs-dr-schema-cz_2a447/container','utf8').trim()
const old=JSON.parse(docker(['inspect',source]))[0]
if(old.Config.Labels?.['writeoffs.synthetic-dr']!=='true'||old.HostConfig.NetworkMode!=='none')throw new Error('UNSAFE_LOCAL_SOURCE')
if(!old.State.Running)docker(['start',source])
const schema=docker(['exec',source,'pg_dump','-U','supabase_admin','-d','dr_source','--schema-only','--no-owner','--no-acl','--schema=auth','--schema=public','--schema=storage','--schema=extensions'])
const targetName='writeoffs-dr-contract-'+randomUUID().slice(0,8)
const sql=(query,role='postgres')=>docker(['exec','-i',targetName,'psql','-U','supabase_admin','-d','dr_target','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],`set role ${role};\n${query}`).toString().trim()
const literal=v=>"'"+String(v).replaceAll("'","''")+"'"
const files=new Map(),ledgerObjects=new Map()
let report
try{
 execFileSync('docker',['run','-d','--network','none','--label','writeoffs.synthetic-dr=true','--name',targetName,'--env','POSTGRES_PASSWORD','public.ecr.aws/supabase/postgres:17.6.1.147'],{env:{...process.env,POSTGRES_PASSWORD:randomBytes(32).toString('hex')},stdio:'pipe'})
 let ready=false;for(let n=0;n<120;n++){try{if(['postgres','.postgres-wrapp'].includes(docker(['exec',targetName,'cat','/proc/1/comm']).toString().trim())){docker(['exec',targetName,'pg_isready','-U','supabase_admin']);ready=true;break}}catch{/* startup */}await new Promise(r=>setTimeout(r,250))}if(!ready)throw new Error('LOCAL_NOT_READY')
 docker(['exec',targetName,'createdb','-U','supabase_admin','-T','template0','dr_target'])
 for(const role of ['supabase_etl_admin','dashboard_user','supabase_privileged_role','supabase_read_only_user'])sql(`do $x$ begin create role ${role};exception when duplicate_object then null;end $x$;`,'supabase_admin')
 sql('drop schema public;','supabase_admin');sql(schema,'supabase_admin')
 sql(`grant create on database dr_target to postgres;drop schema public cascade;create schema public authorization postgres;create extension if not exists pgcrypto with schema extensions;grant usage on schema auth,extensions,storage to postgres;grant usage on schema storage to anon,authenticated;grant all on all tables in schema auth to postgres;grant all on all sequences in schema auth to postgres;grant set on parameter session_replication_role to postgres;alter role postgres bypassrls;do $p$ declare r record;begin for r in select schemaname,tablename,policyname from pg_policies where schemaname='storage' loop execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);end loop;end $p$;alter schema storage owner to supabase_storage_admin;alter table storage.buckets owner to supabase_storage_admin;alter table storage.objects owner to supabase_storage_admin;`,'supabase_admin')
 sql('grant all on storage.buckets,storage.objects to anon,authenticated,service_role;grant all on storage.buckets,storage.objects to postgres with grant option;','supabase_storage_admin')
 sql("insert into storage.buckets(id,name,public) values('dr-isolation-canary','dr-isolation-canary',false);insert into storage.objects(bucket_id,name) values('dr-isolation-canary','synthetic.txt');",'supabase_storage_admin');files.set('dr-isolation-canary/synthetic.txt',Buffer.from('synthetic-isolation-canary'))
 const isolated=()=>{const x=JSON.parse(docker(['inspect',targetName]))[0];return x.HostConfig.NetworkMode==='none'&&!Object.values(x.NetworkSettings.Ports??{}).some(Boolean)}
 const target={
  sql:query=>sql(query),applyBarrier:()=>sql(publicBarrierSql),verifyBarrier:()=>sql(restoreIsolationSql)==='t',verifyPublicApis:async()=>isolated(),
  verifyPrivateObject:async(bucket,path)=>{
   if(!files.has(bucket+'/'+path))return false
   for(const role of ['anon','authenticated'])if(sql(`set role ${role};select count(*) from storage.objects where bucket_id=${literal(bucket)} and name=${literal(path)};reset role;`)!=='0')return false
   return true
  },
  privateRequest:async(path,options={})=>{
   if(path==='/bucket'&&options.method==='POST'){const b=JSON.parse(options.body);sql(`insert into storage.buckets(id,name,public) values(${literal(b.id)},${literal(b.name)},false);`,'supabase_storage_admin');return new Response('{}')}
   if(path==='/object/receipts'&&options.method==='DELETE'){for(const name of JSON.parse(options.body).prefixes){sql(`begin;set local storage.allow_delete_query='true';delete from storage.objects where bucket_id='receipts' and name=${literal(name)};commit;`,'supabase_storage_admin');files.delete('receipts/'+name)}return new Response('{}')}
   if(path.startsWith('/object/receipts/')&&options.method==='POST'){const name=path.slice('/object/receipts/'.length);sql(`insert into storage.objects(bucket_id,name) values('receipts',${literal(name)});`,'supabase_storage_admin');files.set('receipts/'+name,Buffer.from(options.body));return new Response('{}')}
   if(path.startsWith('/object/authenticated/')){const key=path.slice('/object/authenticated/'.length);if(!files.has(key))throw new Error('LOCAL_OBJECT_ABSENT');return new Response(files.get(key))}
   throw new Error('LOCAL_STORAGE_OPERATION_UNSUPPORTED')
  },
 }
 // Reproduce the original failure: postgres cannot revoke the owner's grants.
 sql('revoke all on storage.objects,storage.buckets from anon,authenticated;')
 const originalRevokeIneffective=sql("select has_table_privilege('anon','storage.objects','SELECT');")==='t'
 target.applyBarrier();if(!target.verifyBarrier()||!originalRevokeIneffective)throw new Error('LOCAL_BARRIER_NOT_REPRODUCED')
 const gateNegativeChecks={}
 for(const [name,change,role] of [
  ['publicBucket',"update storage.buckets set public=true",'supabase_storage_admin'],
  ['permissivePolicy',"create policy unsafe_allow on storage.objects for select to authenticated using(true)",'supabase_storage_admin'],
  ['disabledRls',"alter table storage.objects disable row level security",'supabase_storage_admin'],
  ['roleBypass',"alter role authenticated bypassrls",'supabase_admin'],
  ['publicTableGrant',"create table public.gate_probe(id integer);grant select on public.gate_probe to anon",'postgres'],
  ['publicFunctionGrant',"create function public.gate_probe() returns integer language sql as 'select 1';grant execute on function public.gate_probe() to authenticated",'postgres'],
 ]){
  gateNegativeChecks[name]=sql(`begin;${change};${restoreIsolationSql}rollback;`,role)==='f'
 }
 if(Object.values(gateNegativeChecks).some(x=>!x))throw new Error('LOCAL_GATE_NEGATIVE_FAILED')
 const client={send:async command=>{
  const {Key,Body}=command.input
  if(command.constructor.name==='PutObjectCommand'){
   if(ledgerObjects.has(Key)){const e=new Error('PreconditionFailed');e.$metadata={httpStatusCode:412};throw e}
   const value={bytes:Buffer.from(Body),version:randomUUID()};ledgerObjects.set(Key,value);writeFileSync(join(root,value.version+'.wodel'),value.bytes);return {VersionId:value.version}
  }
  if(command.constructor.name==='ListObjectsV2Command')return {IsTruncated:false,Contents:[...ledgerObjects.keys()].map(Key=>({Key}))}
  if(command.constructor.name==='GetObjectCommand'){const v=ledgerObjects.get(Key);if(!v)throw new Error('LOCAL_LEDGER_NOT_FOUND');return {VersionId:v.version,Body:{transformToByteArray:async()=>v.bytes}}}
  throw new Error('LOCAL_LEDGER_OPERATION_FORBIDDEN')
 }}
 report=await runDrill({config:{id:targetName},schema,target,writer:client,reader:client,encryptionKey:randomBytes(32),diagnosticDirectory:root})
 report.originalRevokeFailureReproduced=originalRevokeIneffective;report.gateNegativeChecks=gateNegativeChecks
 report.boundarySubstitutions=['Local isolated PostgreSQL instead of hosted project','Storage HTTP replaced with local SQL metadata and synthetic bytes','S3 replaced with versioned local encrypted entries; real ledger key never accessed','No customer network exists; live Auth/REST/Storage probes certified separately']
 writeFileSync(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidenceDirectory:root},null,2))
 if(report.result!=='PASS')process.exitCode=1
}catch(e){console.error(JSON.stringify({result:'FAIL',stage:'local-adapter-preparation',code:/^[A-Z_]+$/.test(e.message)?e.message:'LOCAL_FAILED',evidenceDirectory:root}));process.exitCode=1}
finally{try{docker(['rm','-f',targetName]);if(report)report.localTargetRemoved=true}catch{console.error('LOCAL_TARGET_CLEANUP_FAILED');process.exitCode=1;if(report){report.localTargetRemoved=false;report.result='FAIL'}}if(report)writeFileSync(join(root,'report.json'),JSON.stringify(report,null,2))}
