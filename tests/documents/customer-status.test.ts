import {describe,it,expect} from 'vitest'
import {status,type Document} from '../../app/lib/documents/customer-status'
const document:Document={id:'test',original_name:'statement.pdf',document_class:'bank_statement',state:'pending',reason:null,receipt_outcome:null,transaction_count:24}
describe('truthful document lifecycle',()=>{
 it.each(['pending','processing','retryable'])('does not announce completed transactions during %s',state=>expect(status({...document,state})).toBe('Received — Betti is reviewing it'))
 it('reports backend-confirmed import counts',()=>expect(status({...document,state:'completed'})).toBe('Statement imported • 24 transactions found'))
 it('explains unmatched receipt work without claiming a match',()=>expect(status({...document,state:'completed',document_class:'receipt'})).toBe('Receipt organized — Betti will look for a matching transaction'))
 it('only claims a receipt match with backend evidence',()=>expect(status({...document,state:'completed',document_class:'receipt',receipt_outcome:'matched'})).toBe('Receipt matched to a transaction'))
 it('exposes help and failure rather than success',()=>{expect(status({...document,state:'needs_attention'})).toBe('Needs your help');expect(status({...document,state:'dead_letter'})).toBe('Could not be read')})
})
