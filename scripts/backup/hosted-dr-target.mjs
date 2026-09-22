import {spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'

export const hostedDrRef = 'hkvmfbqshqthsfxmwlsq'
const denied = status => [400,401,403,404].includes(status)
export function validateHostedDrConfig(config) {
  if(config?.id!==hostedDrRef || config.host!=='aws-0-us-east-2.pooler.supabase.com' || !config.dbPassword || !config.recoveryApiKey?.startsWith('sb_secret_') || !config.storageControllerJwt || !Array.isArray(config.retiredPublicKeys) || !config.retiredPublicKeys.length) throw new Error('DR_TARGET_CONFIGURATION_INVALID')
  return config
}
/** No database URL/password or provider error is ever put in a command argument/log. */
export function hostedDrTarget(config, caFile) {
  validateHostedDrConfig(config)
  const env={PATH:process.env.PATH,HOME:process.env.HOME,PGHOST:config.host,PGPORT:'5432',PGUSER:`postgres.${config.id}`,PGDATABASE:'postgres',PGPASSWORD:config.dbPassword,PGSSLMODE:'verify-full',PGSSLROOTCERT:caFile,PGCONNECT_TIMEOUT:'15'}
  const run=(command,args,input)=>{
    const result=spawnSync(command,args,{env,input,encoding:Buffer.isBuffer(input)?undefined:'utf8',timeout:180000,maxBuffer:64*1024*1024})
    if(result.status!==0){const error=new Error('DR_DATABASE_OPERATION_FAILED');error.sqlState=String(result.stderr??'').match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1];throw error}
    return result.stdout
  }
  const sql=query=>String(run('psql',['-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],query)).trim()
  const request=async(path,options={},headers={})=>fetch(`https://${config.id}.supabase.co${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(30000)})
  const admin={'apikey':config.recoveryApiKey,Authorization:`Bearer ${config.storageControllerJwt}`}
  const customerKeys=config.retiredPublicKeys.map(k=>typeof k==='string'?k:k.api_key)
  if(customerKeys.some(k=>!k))throw new Error('DR_CUSTOMER_PROBE_KEYS_INVALID')
  return {
    sql,
    restore:dump=>run('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction','-d','postgres'],dump),
    async privateRequest(path,options={}){const response=await request(`/storage/v1${path}`,options,admin);if(!response.ok)throw new Error('DR_STORAGE_OPERATION_FAILED');return response},
    async verifyPublicApis(){
      for(const path of ['/rest/v1/','/auth/v1/settings'])for(const key of [null,...customerKeys]){
        const response=await request(path,{},key?{apikey:key,Authorization:`Bearer ${key}`}:{})
        if(!denied(response.status))return false
      }
      return true
    },
    async verifyPrivateObject(bucket,path){
      const control=await request(`/storage/v1/object/authenticated/${bucket}/${path}`,{},admin)
      if(!control.ok)return false
      await control.arrayBuffer()
      for(const key of [null,...customerKeys]){
        const response=await request(`/storage/v1/object/authenticated/${bucket}/${path}`,{},key?{apikey:key,Authorization:`Bearer ${key}`}:{})
        if(!denied(response.status))return false
      }
      return true
    },
    applyBarrier(){sql(`revoke all privileges on all tables in schema public from public,anon,authenticated; revoke all privileges on all sequences in schema public from public,anon,authenticated; revoke execute on all functions in schema public from public,anon,authenticated; revoke all privileges on storage.objects,storage.buckets from public,anon,authenticated; alter default privileges in schema public revoke all on tables from public,anon,authenticated; alter default privileges in schema public revoke all on functions from public,anon,authenticated;`)},
    verifyBarrier(){return sql(`select not exists(select 1 from pg_tables t cross join (values ('anon'),('authenticated')) r(role) where t.schemaname in ('public','storage') and (t.schemaname='public' or t.tablename in ('objects','buckets')) and (has_table_privilege(r.role,format('%I.%I',t.schemaname,t.tablename),'SELECT') or has_table_privilege(r.role,format('%I.%I',t.schemaname,t.tablename),'INSERT') or has_table_privilege(r.role,format('%I.%I',t.schemaname,t.tablename),'UPDATE') or has_table_privilege(r.role,format('%I.%I',t.schemaname,t.tablename),'DELETE')));`)==='t'},
    writeCa(path,certificate){if(!certificate.startsWith('-----BEGIN CERTIFICATE-----'))throw new Error('DR_CA_INVALID');writeFileSync(path,certificate,{mode:0o600})},
  }
}
