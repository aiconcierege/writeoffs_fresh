import {mkdtemp,mkdir,writeFile,access,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHmac} from 'node:crypto'
import {describe,it,expect} from 'vitest'
import {reconcilePrivateArtifacts} from '../../scripts/backup/reconcile-private-objects.mjs'
const gone='11111111-1111-4111-8111-111111111111',keep='22222222-2222-4222-8222-222222222222',hmacKey='synthetic-test-key-for-identity-at-least-32'
const entry={deletion_request_id:'33333333-3333-4333-8333-333333333333',business_identity_hash:'a'.repeat(64),user_identity_hash:createHmac('sha256',hmacKey).update(`writeoffs-deletion:v1:user:${gone}`).digest('hex'),reason:'customer_request',effective_at:'2026-09-21T12:00:00.000Z'}
describe('restored private artifacts',()=>{
 it('removes deleted-owner files without requiring an Auth/database row, preserving others and safe replay',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dr-objects-'))
  try{
   for(const kind of ['receipts','statements'])for(const owner of [gone,keep]){await mkdir(join(root,kind,owner),{recursive:true});await writeFile(join(root,kind,owner,'file.pdf'),'synthetic')}
   expect(await reconcilePrivateArtifacts({root,entries:[entry],hmacKey})).toEqual({removedOwnerPrefixes:2})
   await expect(access(join(root,'receipts',gone))).rejects.toThrow()
   await expect(access(join(root,'receipts',keep,'file.pdf'))).resolves.toBeUndefined()
   expect(await reconcilePrivateArtifacts({root,entries:[entry],hmacKey})).toEqual({removedOwnerPrefixes:0})
  }finally{await rm(root,{recursive:true,force:true})}
 })
 it('fails closed on an ownership symlink',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dr-symlink-')),outside=await mkdtemp(join(tmpdir(),'dr-outside-'))
  try{await mkdir(join(root,'receipts'));await writeFile(join(outside,'keep'),'keep');await symlink(outside,join(root,'receipts',gone));await expect(reconcilePrivateArtifacts({root,entries:[entry],hmacKey})).rejects.toThrow('INVALID_OWNER');await access(join(outside,'keep'))}finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true})}
 })
})
