import {describe,it,expect} from 'vitest'
import {inspectBackupRetention} from '../../scripts/backup/inspect-s3-retention.mjs'
describe('read-only retention certification',()=>{
 it('reports denied configuration as unverified and never issues a mutation',async()=>{
  const commands:string[]=[]
  const client={send:async(raw:unknown)=>{const command=raw as {constructor:{name:string},input:{Prefix?:string}};const name=command.constructor.name;commands.push(name);if(name==='GetBucketLifecycleConfigurationCommand')throw Object.assign(new Error('not logged'),{name:'AccessDenied'});if(name==='ListObjectVersionsCommand'){expect(command.input.Prefix).toBe('staging/');return {Versions:[]}}return {}}}
  const result=await inspectBackupRetention(client,{bucket:'test',region:'us-east-2',prefix:''})
  expect(result.checks.lifecycle).toEqual({verified:false,errorCode:'AccessDenied'})
  expect(result.expirationObserved).toBe(false)
  expect(commands.every(name=>name.startsWith('Get')||name.startsWith('List')||name.startsWith('Head'))).toBe(true)
 })
})
