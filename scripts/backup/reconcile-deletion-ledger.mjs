#!/usr/bin/env node
import{mkdtemp,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{createClient}from'@supabase/supabase-js';import{decodeBackupKey,decryptFile}from'./backup-crypto.mjs'
const need=name=>{const value=process.env[name];if(!value)throw new Error(`${name} is required.`);return value}
if(process.env.WRITEOFFS_RESTORE_CONFIRM_ISOLATED!=='yes')throw new Error('Refusing reconciliation outside an explicitly isolated restore.')
process.umask(0o077);const work=await mkdtemp(join(tmpdir(),'writeoffs-deletion-reconcile-')),plain=join(work,'ledger.json')
try{await decryptFile(resolve(need('WRITEOFFS_DELETION_LEDGER_INPUT')),plain,decodeBackupKey());const ledger=JSON.parse(await readFile(plain,'utf8'));if(ledger.format!=='writeoffs-deletion-ledger-v1'||!Array.isArray(ledger.entries))throw new Error('Unsupported deletion ledger.')
 const client=createClient(need('SUPABASE_URL'),need('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}),result=await client.rpc('reconcile_restored_deletion_tombstones',{p_entries:ledger.entries,p_hmac_key:need('ACCOUNT_DELETION_HMAC_KEY'),p_now:new Date().toISOString()});if(result.error)throw new Error('Deletion reconciliation failed.');console.log(JSON.stringify({reconciled:true,scheduled:result.data}))
}finally{await rm(work,{recursive:true,force:true})}
