import { describe, expect, it } from 'vitest'
import { attachedReceiptLabel } from '../../app/lib/bookkeeping/receipt-status-label'
describe('receipt attachment versus financial match copy',()=>{
 it.each(['receipt','receipt_evidence'])('does not call %s a bank match without financial evidence',sourceKind=>{
  expect(attachedReceiptLabel({sourceKind,hasFinancialSource:false})).toBe('Receipt saved · No bank match yet')
 })
 it('recognizes later bank evidence on an originally receipt-only record',()=>{
  expect(attachedReceiptLabel({sourceKind:'receipt',hasFinancialSource:true})).toBe('Receipt attached to this transaction')
 })
 it('describes manual supporting evidence as attached without claiming bank matching',()=>{
  expect(attachedReceiptLabel({sourceKind:'manual',hasFinancialSource:false})).toBe('Receipt attached to this transaction')
 })
})
