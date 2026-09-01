import{readFileSync}from'node:fs';import{describe,expect,it}from'vitest'
const upload=readFileSync('app/receipts/ReceiptUploadAction.tsx','utf8'),follow=readFileSync('app/receipts/ReceiptMealFollowUp.tsx','utf8')
describe('mobile receipt meal continuation',()=>{
 it('continues a single mobile capture with Betti without redesigning receipt history',()=>{expect(upload).toContain('<ReceiptMealFollowUp receiptId={followUpReceiptId}/>');expect(follow).toContain('Betti is reading your receipt.');expect(follow).toContain('<QuestionFlow');expect(follow).toContain('recordId={questions[0]?.recordId}')})
 it('polls boundedly and exits quietly for non-meals, complete facts, or deferred matching',()=>{expect(follow).toContain('attempt<30');expect(follow).toContain("'waiting_for_transaction'");expect(follow).toContain("setState('done')")})
})
