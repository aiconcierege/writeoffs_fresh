import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'

const policy=JSON.parse(readFileSync('docs/audits/backup-dr/staging-backup-lifecycle.proposed.json','utf8'))
describe('approved staging backup expiration policy (not live enforcement)',()=>{
 it('covers each approved class including obsolete versions and uploads',()=>{
  expect(policy.Rules).toHaveLength(6)
  for(const [name,days] of Object.entries({daily:35,weekly:84,monthly:90})){
   const rules=policy.Rules.filter((r:{Filter:{Prefix:string}})=>r.Filter.Prefix===`staging/${name}/`)
   expect(rules).toHaveLength(2)
   const expiration=rules.find((r:{Expiration:{Days?:number}})=>r.Expiration.Days)
   expect(expiration.Status).toBe('Enabled')
   expect(expiration.Expiration).toEqual({Days:days})
   expect(expiration.NoncurrentVersionExpiration).toEqual({NoncurrentDays:1})
   expect(expiration.AbortIncompleteMultipartUpload).toEqual({DaysAfterInitiation:7})
   expect(rules.some((r:{Expiration:{ExpiredObjectDeleteMarker?:boolean}})=>r.Expiration.ExpiredObjectDeleteMarker===true)).toBe(true)
  }
 })
 it('cannot expire the independent ledger or production backups',()=>{
  for(const rule of policy.Rules){
   expect(['staging/daily/','staging/weekly/','staging/monthly/']).toContain(rule.Filter.Prefix)
   for(const key of ['deletion-ledger/staging/entries/example.wodel','production/daily/example.wobak']){
    expect(key.startsWith(rule.Filter.Prefix)).toBe(false)
   }
   expect(rule.Expiration.Days && rule.Expiration.ExpiredObjectDeleteMarker).toBeFalsy()
  }
 })
})
