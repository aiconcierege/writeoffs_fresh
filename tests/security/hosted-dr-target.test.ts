import {describe,expect,it,vi,beforeEach} from 'vitest'
import {hostedDrRef,hostedDrTarget,validateHostedDrConfig} from '../../scripts/backup/hosted-dr-target.mjs'
vi.mock('node:child_process',()=>({spawnSync:vi.fn(()=>({status:0,stdout:'t',stderr:''}))}))
const config=()=>({id:hostedDrRef,host:'aws-0-us-east-2.pooler.supabase.com',dbPassword:'synthetic-password',recoveryApiKey:'sb_secret_synthetic',storageControllerJwt:'synthetic-controller-jwt',retiredPublicKeys:['synthetic-retired-key']})
beforeEach(()=>vi.unstubAllGlobals())
describe('hosted DR target boundary',()=>{
 it('rejects existing application projects and unexpected hosts',()=>{
  for(const id of ['sgrqrrxrlglhjuetdtps','eoqxjlpogmewcxhzwlbl','ibfcyybarwxkdkdjurge'])expect(()=>validateHostedDrConfig({...config(),id})).toThrow('DR_TARGET_CONFIGURATION_INVALID')
  expect(()=>validateHostedDrConfig({...config(),host:'attacker.example'})).toThrow('DR_TARGET_CONFIGURATION_INVALID')
 })
 it('requires private controller credentials and real retired-key probes',()=>{
  for(const field of ['dbPassword','recoveryApiKey','storageControllerJwt'])expect(()=>validateHostedDrConfig({...config(),[field]:''})).toThrow()
  expect(()=>validateHostedDrConfig({...config(),retiredPublicKeys:[]})).toThrow()
 })
 it('cannot certify public API isolation when any retired key succeeds',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({status:401}).mockResolvedValueOnce({status:200}))
  expect(await hostedDrTarget(config(),'/synthetic-ca.crt').verifyPublicApis()).toBe(false)
 })
 it('cannot certify private-file isolation from a successful empty response',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:200}))
  expect(await hostedDrTarget(config(),'/synthetic-ca.crt').verifyPrivateObject('receipts','synthetic.pdf')).toBe(false)
 })
 it('rejects redirects, server failures, and unavailable probes as evidence',async()=>{
  for(const status of [301,302,429,500,503]){
   vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status}))
   expect(await hostedDrTarget(config(),'/synthetic-ca.crt').verifyPublicApis()).toBe(false)
  }
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('network unavailable')))
  await expect(hostedDrTarget(config(),'/synthetic-ca.crt').verifyPublicApis()).rejects.toThrow()
 })
 it('checks both Auth and REST with missing and retired credentials',async()=>{
  const fetcher=vi.fn().mockResolvedValue({status:401});vi.stubGlobal('fetch',fetcher)
  expect(await hostedDrTarget(config(),'/synthetic-ca.crt').verifyPublicApis()).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(4)
 })
})
