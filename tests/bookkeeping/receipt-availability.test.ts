import {describe,it,expect} from 'vitest'
import {receiptUnavailableRecordIds} from '../../app/lib/bookkeeping/receipt-availability'
const event=(id:string,kind:string,previous:string|null)=>({id,event_type:kind,supersedes_event_id:previous,bookkeeping_record_id:'record'})
const lost=[event('open','request_opened',null),event('lost','receipt_lost','open'),event('resolved','resolved','lost')]
describe('current receipt availability',()=>{
 it('handles the null predecessor on a real root and preserves the unavailable assertion',()=>expect([...receiptUnavailableRecordIds(lost)]).toEqual(['record']))
 it('does not equate a pending request with unavailable',()=>expect(receiptUnavailableRecordIds(lost.slice(0,1)).size).toBe(0))
 it('later attachment improves evidence without removing history',()=>{const history=[...lost,event('attached','evidence_attached','resolved'),event('complete','resolved','attached')];expect(receiptUnavailableRecordIds(history).size).toBe(0);expect(history.some(e=>e.event_type==='receipt_lost')).toBe(true)})
 it('a correction reopening the request supersedes unavailable',()=>expect(receiptUnavailableRecordIds([...lost,event('reopened','reopened','resolved')]).size).toBe(0))
})
