import {describe,expect,it} from 'vitest'
import {vehicleExpenseKind} from '../../app/lib/bookkeeping/vehicle-processing'
import type {BookkeepingEvaluationSnapshot} from '../../app/lib/bookkeeping/deterministic-evaluator'
const snapshot=(description:string):BookkeepingEvaluationSnapshot=>({evaluatorVersion:'v1',businessId:'b',recordId:'r',sourceKind:'financial_transaction',
  amountCents:-100,currency:'USD',occurredOn:'2026-08-01',merchantName:null,description,businessDescription:null,activeDocumentCount:0,
  customerAnswerCount:0,hasOpenConflictingEvidence:false,decisionHistoryLength:1,movement:null,movementCandidates:[],currentDecision:{id:'d',businessId:'b',bookkeepingRecordId:'r',actorUserId:null,createdAt:'2026-08-01T00:00:00Z',supersedesDecisionId:null,
    bookkeepingNature:'expense',treatment:'business',reviewStatus:'resolved',confidence:1,reason:'test',businessPurpose:null,provenance:'automation',allocations:[]}})
describe('vehicle expense evidence',()=>{
  it.each([['Vehicle fuel','fuel'],['Auto insurance','insurance'],['Auto repair','repair'],['Oil change','maintenance'],['DMV registration','registration'],
    ['Discount Tire','tires'],['Parking fee','parking'],['Road toll','tolls'],['Vehicle lease payment','lease_payment'],['Vehicle purchase','purchase'],['Engine replacement','improvement']] as const)
  ('recognizes %s as %s',(description,kind)=>expect(vehicleExpenseKind(snapshot(description))).toBe(kind))
  it('does not turn a generic gas-station merchant into a vehicle fact',()=>expect(vehicleExpenseKind(snapshot('Shell purchase'))).toBeNull())
})
