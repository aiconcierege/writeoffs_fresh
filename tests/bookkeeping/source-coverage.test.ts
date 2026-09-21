import {expect,it} from 'vitest'
import {projectSourceCoverage,type CoverageInput} from '../../app/lib/bookkeeping/source-coverage'
function fixture():CoverageInput{return{authorizedStart:'2024-01-01',requestedStart:null,through:'2026-09-21',accounts:[{id:'a',name:'Checking',mask:'1234',provider:'plaid',connected:true,bankFrom:'2025-06-01',bankThrough:'2026-09-21',quarantined:0,statements:[]}]}}
it('separates requested scope, observed bank activity and actual completeness',()=>{
 const c=projectSourceCoverage(fixture())
 expect(c.start).toBe('2024-01-01');expect(c.accounts[0].recordsNeeded).toEqual([{from:'2024-01-01',through:'2025-05-31'}])
 expect(c.accounts[0].unconfirmed).toEqual([{from:'2024-01-01',through:'2026-09-21'}]);expect(c.sourceUniverseConfirmed).toBe(false)
})
it('validated statement fill-in advances only the matching account without repeated requests',()=>{
 const f=fixture();f.accounts.push({...f.accounts[0],id:'b',bankFrom:'2025-09-01'})
 f.accounts[0].statements=[{from:'2024-01-01',through:'2025-05-31',validated:true}]
 const c=projectSourceCoverage(f);expect(c.accounts[0].recordsNeeded).toEqual([])
 expect(c.accounts[1].recordsNeeded).toEqual([{from:'2024-01-01',through:'2025-08-31'}])
})
it('does not mistake no transactions or ambiguous statements for zero-activity coverage',()=>{
 const f=fixture();f.accounts[0].bankFrom=null;f.accounts[0].statements=[{from:'2024-01-01',through:'2026-09-21',validated:false}]
 expect(projectSourceCoverage(f).accounts[0].recordsNeeded).toEqual([{from:'2024-01-01',through:'2026-09-21'}])
})
it('clips to report period and exposes rejected facts without altering totals',()=>{
 const f=fixture();f.requestedStart='2026-01-01';f.accounts[0].quarantined=1
 const c=projectSourceCoverage(f);expect(c.needsRecords).toBe(false);expect(c.hasRejectedRecords).toBe(true);expect(c).not.toHaveProperty('income')
})
