import {canBulkReview} from '../../app/lib/bookkeeping/guided-review-selection'
import {describe,it,expect} from 'vitest'
import {validateGuidedReview} from '../../app/lib/bookkeeping/guided-review'
import {projectBettiHome} from '../../app/lib/home/betti-home'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const request={requestId:id(1),action:'receipt_unavailable',scope:'receipts',items:[{recordId:id(2),decisionId:id(3)}]}
describe('bounded customer assertions',()=>{
 it('accepts an explicit unavailable assertion without a tax or business-use conclusion',()=>expect(validateGuidedReview(request)).toEqual(request))
 it.each([{...request,businessId:id(4)},{...request,action:'mixed'},{...request,items:[]},{...request,items:[request.items[0],request.items[0]]},{...request,items:Array.from({length:101},(_,i)=>({recordId:id(i+100),decisionId:id(i+500)}))},{...request,items:[{...request.items[0],businessUse:100}]}])('rejects unsafe or ambiguous bulk payload %j',value=>expect(()=>validateGuidedReview(value)).toThrow())
 it('does not reuse receipt unavailable as removal',()=>expect(validateGuidedReview({...request,action:'remove_business'}).action).toBe('remove_business'))
})
describe('guided next-work priority',()=>{
 const base={name:null,greeting:'Hello',askableQuestionCount:4,receiptsProcessing:0,receiptsNeedHelp:0,outstandingDocumentation:5}
 it('guides receipt review before individual questions',()=>expect(projectBettiHome({...base,missingReceipts:true}).action?.href).toBe('/transactions?view=receipts'))
 it('moves to historical sweep when receipts have been handled',()=>expect(projectBettiHome({...base,missingReceipts:false,historicalReview:true}).action?.href).toBe('/transactions?scope=historical'))
 it('moves to individual exceptions after the sweep',()=>expect(projectBettiHome({...base,missingReceipts:false,historicalReview:false}).action?.href).toBe('/check-in'))
 it('does not nag on obsolete documentation requests',()=>expect(projectBettiHome({...base,askableQuestionCount:0,missingReceipts:false,historicalReview:false}).heading).toBe('Your books are current.'))
 it('preserves an honest limitation after conversation ends',()=>expect(projectBettiHome({...base,askableQuestionCount:0,missingReceipts:false,documentationLimitations:true}).state).toBe('documentation-follow-up'))
})

describe('whole-selection eligibility',()=>{
 const bank={id:'transaction',recordId:'record',currentDecisionId:'decision',sourceKind:'financial_transaction',treatment:'business'}
 it('allows explicit removal of selected bank activity without supplying a mixed-use percentage',()=>expect(canBulkReview([bank,{...bank,id:'other',treatment:'mixed_use'}])).toBe(true))
 it.each(['receipt','receipt_evidence','legacy','manual'])('blocks the entire bulk action when a %s item is selected',sourceKind=>expect(canBulkReview([bank,{...bank,sourceKind}])).toBe(false))
 it('does not silently skip already personal or compound items',()=>{expect(canBulkReview([bank,{...bank,treatment:'personal'}])).toBe(false);expect(canBulkReview([{...bank,id:'record'}])).toBe(false)})
 it('rejects an empty selection',()=>expect(canBulkReview([])).toBe(false))
})
