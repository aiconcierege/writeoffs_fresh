#!/usr/bin/env node
import{mkdtemp,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{createClient}from'@supabase/supabase-js';import{decodeBackupKey,encryptFile}from'./backup-crypto.mjs'
const need=name=>{const value=process.env[name];if(!value)throw new Error(`${name} is required.`);return value},output=resolve(need('WRITEOFFS_DELETION_LEDGER_OUTPUT'))
const client=createClient(need('SUPABASE_URL'),need('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}}),result=await client.from('account_deletion_tombstones').select('deletion_request_id,business_identity_hash,user_identity_hash,reason,effective_at,reconciliation_version').order('effective_at')
if(result.error)throw new Error('Deletion ledger export failed.')
process.umask(0o077);const work=await mkdtemp(join(tmpdir(),'writeoffs-deletion-ledger-')),plain=join(work,'ledger.json')
try{await writeFile(plain,JSON.stringify({format:'writeoffs-deletion-ledger-v1',exported_at:new Date().toISOString(),entries:result.data??[]}));await encryptFile(plain,output,decodeBackupKey());console.log(JSON.stringify({exported:true,count:result.data?.length??0}))}finally{await rm(work,{recursive:true,force:true})}
