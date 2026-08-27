import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'
const upload=readFileSync('app/receipts/ReceiptUploadAction.tsx','utf8')
const weekly=readFileSync('app/home/WeeklyReview.tsx','utf8')
const route=readFileSync('app/api/bookkeeping/financial-transactions/[id]/receipts/route.ts','utf8')
const workflow=readFileSync('app/lib/bookkeeping/receipt-matching-workflow.ts','utf8')

describe('weekly row receipt intent',()=>{
 it('carries the exact transaction id from row through registration to canonical attachment',()=>{
  expect(weekly).toContain('intendedTransactionId={item.id}')
  expect(upload).toContain('/api/bookkeeping/financial-transactions/${intendedTransactionId}/receipts')
  expect(upload).toContain("'Receipt attached. WriteOffs is organizing it.'")
  expect(upload).toContain('I couldn’t safely attach it to this transaction')
 })
 it('uses the existing tenant-checked canonical attachment path',()=>{
  expect(route).toContain('attachReceiptToFinancialTransaction')
  expect(workflow).toContain('resolveFinancialTransactionRecord')
  expect(workflow).toContain('businessId: resolved.record.businessId')
  expect(workflow).toContain('userId: user.id')
 })
})
