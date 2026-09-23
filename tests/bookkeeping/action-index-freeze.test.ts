import {describe,it,expect,vi,afterEach} from 'vitest'
import {frozenStagingBusinesses} from '../../app/lib/bookkeeping/action-index-freeze'
import {refreshBettiActionIndex} from '../../app/lib/bookkeeping/action-index-worker'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
afterEach(()=>vi.unstubAllEnvs())
describe('staging clean-room baseline protection',()=>{
 it('has no default or hidden customer IDs',()=>expect(frozenStagingBusinesses({NODE_ENV:'test'})).toEqual([]))
 it('validates explicit staging-only IDs and fails closed for mistakes',()=>{
  expect(frozenStagingBusinesses({NODE_ENV:'test',WRITEOFFS_ENVIRONMENT:'staging',WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS:id})).toEqual([id])
  expect(()=>frozenStagingBusinesses({NODE_ENV:'test',WRITEOFFS_ENVIRONMENT:'production',WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS:id})).toThrow('OUTSIDE_STAGING')
  expect(()=>frozenStagingBusinesses({NODE_ENV:'test',WRITEOFFS_ENVIRONMENT:'staging',WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS:'wrong'})).toThrow('INVALID')
 })
 it('does not claim, prepare, publish or retry an explicitly frozen business',async()=>{
  vi.stubEnv('WRITEOFFS_ENVIRONMENT','staging');vi.stubEnv('WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS',id)
  const rpc=vi.fn()
  expect(await refreshBettiActionIndex({admin:{rpc} as never,businessId:id})).toEqual({published:0,conflicted:0,failed:0})
  expect(rpc).not.toHaveBeenCalled()
 })
 it('passes scheduler exclusions into the database before any lease is acquired',async()=>{
  vi.stubEnv('WRITEOFFS_ENVIRONMENT','staging');vi.stubEnv('WRITEOFFS_STAGING_FROZEN_BUSINESS_IDS',id)
  const rpc=vi.fn().mockResolvedValue({data:[],error:null})
  await refreshBettiActionIndex({admin:{rpc} as never})
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledWith('claim_betti_action_index_refresh_excluding',expect.objectContaining({p_excluded_business_ids:[id]}))
 })
})
