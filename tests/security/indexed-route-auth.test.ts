import {expect,it} from 'vitest'
import {indexedHandlerOwnsAuthentication} from '../../app/lib/route-policy'
it('limits handler-owned authentication to the two guarded indexed routes',()=>{
 for(const [path,method] of [['/api/bookkeeping/work','GET'],['/api/bookkeeping/questions/123','POST']]){
  expect(indexedHandlerOwnsAuthentication(path,method,true)).toBe(true)
  expect(indexedHandlerOwnsAuthentication(path,method,false)).toBe(false)
 }
 for(const [path,method] of [['/home','GET'],['/api/bookkeeping/work/answer','POST'],['/api/bookkeeping/work','POST'],['/api/bookkeeping/questions/123','GET'],['/api/bookkeeping/questions/123/other','POST'],['/api/bookkeeping/records/123/special','POST']])
  expect(indexedHandlerOwnsAuthentication(path,method,true)).toBe(false)
})
