import {createHash,createHmac} from 'node:crypto'

/** Independent identities also cover orphaned files with no surviving Auth row. */
export async function reconcileHostedPrivateObjects({sql,privateRequest,entries,hmacKey}) {
 if(typeof hmacKey!=='string'||hmacKey.length<32)throw new Error('RESTORE_OBJECT_IDENTITY_KEY_REQUIRED')
 const keyed=new Set(entries.map(e=>e.user_identity_hash))
 const legacy=new Set(entries.filter(e=>e.reason==='retention_expired').map(e=>e.user_identity_hash))
 const objects=JSON.parse(sql("select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)),'[]'::jsonb) from storage.objects where bucket_id='receipts';"))
 const remove=[]
 for(const object of objects){
  const match=/^(receipts|statements)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/(.+)$/i.exec(object.name)
  if(object.bucket!=='receipts'||!match||match[3].split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('RESTORE_OBJECT_OWNERSHIP_AMBIGUOUS')
  const owner=match[2].toLowerCase()
  if(keyed.has(createHmac('sha256',hmacKey).update(`writeoffs-deletion:v1:user:${owner}`).digest('hex'))||legacy.has(createHash('sha256').update(`user:${owner}`).digest('hex')))remove.push(object.name)
 }
 for(let offset=0;offset<remove.length;offset+=100)await privateRequest('/object/receipts',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:remove.slice(offset,offset+100)})})
 const remaining=JSON.parse(sql("select coalesce(jsonb_agg(name),'[]'::jsonb) from storage.objects where bucket_id='receipts';"))
 if(remove.some(name=>remaining.includes(name)))throw new Error('RESTORE_PRIVATE_OBJECT_CLEANUP_FAILED')
 return {removed:remove.length}
}
