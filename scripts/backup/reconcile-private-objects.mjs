import {createHash,createHmac} from 'node:crypto'
import {lstat,readdir,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {canonicalDeletionEntry} from './independent-deletion-ledger.mjs'

/** Reconcile recovered private artifacts even when their Auth/database owner is absent. */
export async function reconcilePrivateArtifacts({root,entries,hmacKey}) {
 if(typeof hmacKey!=='string'||hmacKey.length<32)throw new Error('RESTORE_IDENTITY_KEY_REQUIRED')
 const directory=resolve(root)
 if((await lstat(directory)).isSymbolicLink())throw new Error('RESTORE_STORAGE_SYMLINK')
 const rows=entries.map(canonicalDeletionEntry)
 const keyed=new Set(rows.map(e=>e.user_identity_hash))
 const legacy=new Set(rows.filter(e=>e.reason==='retention_expired').map(e=>e.user_identity_hash))
 let removedOwnerPrefixes=0
 for(const kind of await readdir(directory)){
  if(!['receipts','statements'].includes(kind))throw new Error('RESTORE_STORAGE_UNKNOWN_PREFIX')
  const category=join(directory,kind),info=await lstat(category)
  if(info.isSymbolicLink()||!info.isDirectory())throw new Error('RESTORE_STORAGE_INVALID_PREFIX')
  for(const owner of await readdir(category)){
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(owner))throw new Error('RESTORE_STORAGE_OWNER_UNRESOLVED')
   const path=join(category,owner),stat=await lstat(path)
   if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('RESTORE_STORAGE_INVALID_OWNER')
   const hash=createHmac('sha256',hmacKey).update(`writeoffs-deletion:v1:user:${owner.toLowerCase()}`).digest('hex')
   const oldHash=createHash('sha256').update(`user:${owner.toLowerCase()}`).digest('hex')
   if(keyed.has(hash)||legacy.has(oldHash)){await rm(path,{recursive:true});removedOwnerPrefixes++}
  }
 }
 return {removedOwnerPrefixes}
}
