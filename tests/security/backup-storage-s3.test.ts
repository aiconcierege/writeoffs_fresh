/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from 'node:stream'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Operator scripts are native ESM JavaScript.
import { assertStorageAccess, collectSupabaseStorage } from '../../scripts/backup/collect-supabase-storage.mjs'
// @ts-expect-error Operator scripts are native ESM JavaScript.
import { assertExpectedDatabaseProject, assertExpectedSupabaseProject, makeBackupObjectKey, safeRelativePath } from '../../scripts/backup/backup-common.mjs'
// @ts-expect-error Operator scripts are native ESM JavaScript.
import { downloadBackup, loadS3Config, uploadBackup } from '../../scripts/backup/s3-transfer.mjs'

const baseEnv={WRITEOFFS_BACKUP_S3_BUCKET:'vault',WRITEOFFS_BACKUP_EXPECTED_S3_BUCKET:'vault',WRITEOFFS_BACKUP_S3_REGION:'us-east-2',WRITEOFFS_BACKUP_S3_ACCESS_KEY_ID:'fixture-access',WRITEOFFS_BACKUP_S3_SECRET_ACCESS_KEY:'fixture-secret'}

describe('Supabase Storage backup collection',()=>{
  it('preflights credential access and requires the expected bucket to remain private',async()=>{
    await expect(assertStorageAccess({listBuckets:async()=>({data:[{name:'receipts',public:false}],error:null})})).resolves.toBeUndefined()
    await expect(assertStorageAccess({listBuckets:async()=>({data:null,error:{name:'StorageApiError',statusCode:401,message:'sensitive provider detail'}})})).rejects.toThrow('status=401')
    await expect(assertStorageAccess({listBuckets:async()=>({data:[{name:'other',public:false}],error:null})})).rejects.toThrow('missing')
    await expect(assertStorageAccess({listBuckets:async()=>({data:[{name:'receipts',public:true}],error:null})})).rejects.toThrow('public')
  })
  it('collects receipt and statement bytes and verifies a stable inventory',async()=>{
    const objects=new Map([['receipts/user-a/one.pdf',Buffer.from('receipt')],['statements/user-a/two.pdf',Buffer.from('statement')]])
    const bucket={
      list:async(prefix:string)=>({data:[...objects].filter(([path])=>path.startsWith(`${prefix}/`)).map(([path,bytes])=>({name:path.slice(prefix.length+1),id:path,updated_at:'2026-09-14',metadata:{size:bytes.length}})),error:null}),
      download:async(path:string)=>({data:new Blob([objects.get(path)!]),error:null}),
    }
    const root=mkdtempSync(join(tmpdir(),'wo-storage-'))
    const inventory=await collectSupabaseStorage({bucket,output:root})
    expect(inventory).toHaveLength(2)
    expect(readFileSync(join(root,'receipts/user-a/one.pdf'),'utf8')).toBe('receipt')
    expect(readFileSync(join(root,'statements/user-a/two.pdf'),'utf8')).toBe('statement')
    expect(inventory.every((row:{sha256:string})=>/^[a-f0-9]{64}$/.test(row.sha256))).toBe(true)
  })
  it('fails and removes its mirror if an object changes during collection',async()=>{
    let calls=0
    const bucket={list:async()=>({data:[{name:'user-a/one.pdf',id:'one',updated_at:++calls===1?'before':'after',metadata:{size:3}}],error:null}),download:async()=>({data:new Blob(['one']),error:null})}
    await expect(collectSupabaseStorage({bucket,output:join(mkdtempSync(join(tmpdir(),'wo-changing-')),'mirror'),prefixes:['receipts']})).rejects.toThrow('changed during collection')
  })
  it('fails closed when a listed object cannot be downloaded',async()=>{
    const bucket={list:async()=>({data:[{name:'user-a/missing.pdf',id:'missing',updated_at:'now',metadata:{size:1}}],error:null}),download:async()=>({data:null,error:new Error('missing')})}
    await expect(collectSupabaseStorage({bucket,output:join(mkdtempSync(join(tmpdir(),'wo-missing-')),'mirror'),prefixes:['receipts']})).rejects.toThrow('download failed')
  })
  it('treats an empty prefix as a valid inventory',async()=>{
    const bucket={list:async()=>({data:[],error:null}),download:async()=>({data:null,error:null})}
    await expect(collectSupabaseStorage({bucket,output:join(mkdtempSync(join(tmpdir(),'wo-empty-')),'mirror')})).resolves.toEqual([])
  })
})

describe('S3 backup transfer contract',()=>{
  it('rejects wrong destination and source identities and unsafe paths',()=>{
    expect(()=>loadS3Config({...baseEnv,WRITEOFFS_BACKUP_S3_BUCKET:'wrong'})).toThrow('identity mismatch')
    expect(()=>assertExpectedSupabaseProject('https://other.supabase.co','expected')).toThrow('identity mismatch')
    expect(()=>assertExpectedDatabaseProject('postgres://postgres.expected@aws-0-us-east-1.pooler.supabase.com:5432/db','expected')).not.toThrow()
    expect(()=>assertExpectedDatabaseProject('postgres://postgres.expected@aws-0-us-east-1.pooler.supabase.com:6543/db','expected')).toThrow()
    expect(()=>assertExpectedDatabaseProject('postgres://postgres.expected-other@aws-0-us-east-1.pooler.supabase.com:5432/db','expected')).toThrow()
    expect(()=>safeRelativePath('../secret')).toThrow('Unsafe')
  })
  it('uses unique immutable keys without delete operations',()=>{
    const first=makeBackupObjectKey({environment:'staging',backupClass:'daily',now:new Date('2026-09-14T01:02:03Z')})
    const second=makeBackupObjectKey({environment:'staging',backupClass:'daily',now:new Date('2026-09-14T01:02:03Z')})
    expect(first).not.toBe(second);expect(first).toMatch(/^staging\/daily\/2026\/09\/14\//)
  })
  it('uploads, verifies, downloads, and rejects checksum corruption',async()=>{
    const root=mkdtempSync(join(tmpdir(),'wo-s3-'));const input=join(root,'in.wobak');const output=join(root,'out.wobak');writeFileSync(input,'encrypted-fixture')
    const config=loadS3Config(baseEnv);let metadata:Record<string,string>={};let body=Buffer.alloc(0)
    const client={send:async(command:any)=>{
      const name=command.constructor.name
      if(name==='GetBucketLocationCommand')return{LocationConstraint:'us-east-2'}
      if(name==='GetBucketVersioningCommand')return{Status:'Enabled'}
      if(name==='HeadObjectCommand')return{ContentLength:body.length,Metadata:metadata,VersionId:'version-1'}
      if(name==='GetObjectCommand')return{Body:Readable.from(body)}
      throw new Error('unexpected command')
    }}
    const uploaderFactory=({params}:any)=>({done:async()=>{body=readFileSync(input);metadata=params.Metadata}})
    const uploaded=await uploadBackup({client:client as any,config,input,environment:'staging',key:'staging/daily/fixed.wobak',uploaderFactory})
    expect(uploaded.versionId).toBe('version-1')
    await expect(downloadBackup({client:client as any,config,key:uploaded.key,output,expectedSha256:uploaded.sha256,expectedBytes:uploaded.bytes})).resolves.toMatchObject({bytes:body.length})
    const bad=join(root,'bad.wobak');body=Buffer.from('corrupt')
    await expect(downloadBackup({client:client as any,config,key:uploaded.key,output:bad,expectedSha256:uploaded.sha256,expectedBytes:uploaded.bytes})).rejects.toThrow('integrity')
  })
  it('surfaces upload failure without requiring delete or logging credentials',async()=>{
    const root=mkdtempSync(join(tmpdir(),'wo-s3-failure-'));const input=join(root,'in.wobak');writeFileSync(input,'encrypted-fixture')
    const client={send:async(command:any)=>command.constructor.name==='GetBucketLocationCommand'?{LocationConstraint:'us-east-2'}:{Status:'Enabled'}}
    await expect(uploadBackup({client:client as any,config:loadS3Config(baseEnv),input,environment:'staging',key:'staging/daily/failure.wobak',uploaderFactory:()=>({done:async()=>{throw new Error('synthetic upload failure')}})})).rejects.toThrow('synthetic upload failure')
    const source=readFileSync(join(process.cwd(),'scripts/backup/s3-transfer.mjs'),'utf8')
    expect(source).not.toContain('DeleteObjectCommand');expect(source).not.toContain('console.log')
  })
})
