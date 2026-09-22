import {randomBytes} from 'node:crypto'
import {describe,it,expect} from 'vitest'
import {canonicalDeletionEntry,sealDeletionEntry,openDeletionEntry,persistIndependentDeletion,loadIndependentDeletions} from '../../scripts/backup/independent-deletion-ledger.mjs'
const entry={deletion_request_id:'11111111-1111-4111-8111-111111111111',business_identity_hash:'a'.repeat(64),user_identity_hash:'b'.repeat(64),reason:'customer_request',effective_at:'2026-09-21T12:00:00.000Z'}
describe('independently durable minimized deletion ledger',()=>{
 it('rejects incomplete or looping pagination rather than accepting an incomplete ledger',async()=>{
  const args={bucket:'fixture',source:'staging',encryptionKey:randomBytes(32)}
  await expect(loadIndependentDeletions({...args,client:{send:async()=>({})}})).rejects.toThrow('INCOMPLETE_LEDGER_LIST')
  await expect(loadIndependentDeletions({...args,client:{send:async()=>({IsTruncated:true})}})).rejects.toThrow('INCOMPLETE_LEDGER_LIST')
  let calls=0
  await expect(loadIndependentDeletions({...args,client:{send:async()=>{calls++;return {IsTruncated:true,NextContinuationToken:'repeated'}}}})).rejects.toThrow('INCOMPLETE_LEDGER_LIST')
  expect(calls).toBe(2)
 })
 it('rejects customer payloads and binds authenticated encryption to the source',()=>{
  expect(()=>canonicalDeletionEntry({...entry,email:'not-allowed'})).toThrow()
  const key=randomBytes(32),bytes=sealDeletionEntry(entry,key,'staging')
  expect(bytes.toString()).not.toContain(entry.business_identity_hash)
  expect(openDeletionEntry(bytes,key,'staging')).toEqual(entry)
  expect(()=>openDeletionEntry(bytes,key,'another-source')).toThrow()
  expect(()=>openDeletionEntry(bytes,randomBytes(32),'staging')).toThrow()
 })
 it('verifies durable write, safely retries uncertain success, and rejects conflicts',async()=>{
  const objects=new Map<string,Buffer>(),key=randomBytes(32)
  const client={send:async(raw:unknown)=>{const command=raw as {constructor:{name:string},input:{Key:string,Body:Buffer,IfNoneMatch:string}};const i=command.input;switch(command.constructor.name){case 'PutObjectCommand':expect(i.IfNoneMatch).toBe('*');if(objects.has(i.Key))throw {name:'PreconditionFailed'};objects.set(i.Key,Buffer.from(i.Body));return {VersionId:'v1'};case 'GetObjectCommand':return {VersionId:'v1',Body:{transformToByteArray:async()=>objects.get(i.Key)}};case 'ListObjectsV2Command':return {Contents:[...objects.keys()].map(Key=>({Key})),IsTruncated:false};default:throw new Error('unexpected command')}}}
  const args={client,bucket:'fixture',source:'staging',encryptionKey:key,entry}
  const saved=await persistIndependentDeletion(args)
  expect(await persistIndependentDeletion(args)).toEqual(saved)
  expect(objects.size).toBe(1)
  await expect(persistIndependentDeletion({...args,entry:{...entry,reason:'retention_expired'}})).rejects.toThrow('CONFLICT')
  expect(await loadIndependentDeletions(args)).toEqual([entry])
 })
 it('fails closed on denied writes or missing versioning',async()=>{
  const args={bucket:'fixture',source:'staging',encryptionKey:randomBytes(32),entry}
  await expect(persistIndependentDeletion({...args,client:{send:async()=>{throw new Error('AccessDenied')}}})).rejects.toThrow('WRITE_FAILED')
  let bytes:Buffer
  const client={send:async(raw:unknown)=>{const c=raw as {constructor:{name:string},input:{Body:Buffer}};if(c.constructor.name==='PutObjectCommand'){bytes=c.input.Body;return {}}return {Body:{transformToByteArray:async()=>bytes}}}}
  await expect(persistIndependentDeletion({...args,client})).rejects.toThrow('VERSION_REQUIRED')
 })
})
