import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto'
import {GetObjectCommand,PutObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3'
const FORMAT='writeoffs-independent-deletion-v1'
const fields=['deletion_request_id','business_identity_hash','user_identity_hash','reason','effective_at']
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function canonicalDeletionEntry(entry){
 if(!entry||Object.keys(entry).some(key=>!fields.includes(key))||!uuid.test(entry.deletion_request_id)||!['customer_request','retention_expired'].includes(entry.reason)||!/^\d{4}-\d\d-\d\dT/.test(entry.effective_at)||!Number.isFinite(Date.parse(entry.effective_at))||![entry.business_identity_hash,entry.user_identity_hash].every(v=>/^[a-f0-9]{64}$/.test(v)))throw new Error('INVALID_DELETION_ENTRY')
 return Object.fromEntries(fields.map(key=>[key,key==='effective_at'?new Date(entry[key]).toISOString():entry[key]]))
}
function context(source){if(!/^[a-z0-9-]{1,80}$/.test(source))throw new Error('INVALID_LEDGER_SOURCE');return Buffer.from(`${FORMAT}:${source}`)}
function keyBytes(key){if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('INVALID_LEDGER_KEY');return key}
export function sealDeletionEntry(entry,key,source){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),nonce);cipher.setAAD(context(source))
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(canonicalDeletionEntry(entry))),cipher.final()])
 return Buffer.from(JSON.stringify({format:FORMAT,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}))
}
export function openDeletionEntry(payload,key,source){
 try{if(payload.length>4096)throw new Error();const value=JSON.parse(payload.toString());if(value.format!==FORMAT)throw new Error();const nonce=Buffer.from(value.nonce,'base64'),tag=Buffer.from(value.tag,'base64');if(nonce.length!==12||tag.length!==16)throw new Error();const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),nonce);decipher.setAAD(context(source));decipher.setAuthTag(tag);return canonicalDeletionEntry(JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString()))}catch{throw new Error('DELETION_LEDGER_INTEGRITY_FAILED')}
}
function prefix(source){context(source);return `deletion-ledger/${source}/entries/`}
async function readEntry(client,bucket,key,encryptionKey,source){
 const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));if(!object.Body||!object.VersionId||object.VersionId==='null')throw new Error('LEDGER_VERSION_REQUIRED')
 const entry=openDeletionEntry(Buffer.from(await object.Body.transformToByteArray()),encryptionKey,source)
 if(key!==`${prefix(source)}${entry.deletion_request_id}.wodel`)throw new Error('LEDGER_IDENTITY_MISMATCH')
 return {entry,versionId:object.VersionId,key}
}
/** Persist before irreversible cleanup. Stable request ID makes uncertain writes retryable. */
export async function persistIndependentDeletion({client,bucket,source,encryptionKey,entry}){
 const canonical=canonicalDeletionEntry(entry),key=`${prefix(source)}${canonical.deletion_request_id}.wodel`,bytes=sealDeletionEntry(canonical,encryptionKey,source)
 try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,IfNoneMatch:'*',ContentType:'application/octet-stream',ChecksumSHA256:createHash('sha256').update(bytes).digest('base64')}))}
 catch(error){if(error?.$metadata?.httpStatusCode!==412&&error?.name!=='PreconditionFailed')throw new Error('INDEPENDENT_DELETION_WRITE_FAILED')}
 const saved=await readEntry(client,bucket,key,encryptionKey,source)
 if(JSON.stringify(saved.entry)!==JSON.stringify(canonical))throw new Error('INDEPENDENT_DELETION_CONFLICT')
 return {key:saved.key,versionId:saved.versionId,sha256:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}
}
/** Read the live independent prefix, never the ledger embedded in an older backup. */
export async function loadIndependentDeletions({client,bucket,source,encryptionKey}){
 const entries=[];let token;const seen=new Set(),tokens=new Set()
 do{const page=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:prefix(source),ContinuationToken:token}));if(typeof page.IsTruncated!=='boolean')throw new Error('INCOMPLETE_LEDGER_LIST');for(const value of page.Contents??[]){if(!value.Key?.endsWith('.wodel'))throw new Error('UNEXPECTED_LEDGER_OBJECT');const saved=await readEntry(client,bucket,value.Key,encryptionKey,source);if(seen.has(saved.entry.deletion_request_id))throw new Error('DUPLICATE_LEDGER_ENTRY');seen.add(saved.entry.deletion_request_id);entries.push(saved.entry)}
  if(page.IsTruncated&&(!page.NextContinuationToken||tokens.has(page.NextContinuationToken)))throw new Error('INCOMPLETE_LEDGER_LIST');token=page.IsTruncated?page.NextContinuationToken:undefined;if(token)tokens.add(token)
 }while(token)
 return entries.sort((a,b)=>a.deletion_request_id.localeCompare(b.deletion_request_id))
}
