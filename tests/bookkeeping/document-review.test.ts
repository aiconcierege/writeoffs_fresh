import {describe,it,expect} from 'vitest'
import {documentReviewState} from '../../app/lib/bookkeeping/document-review'
import type {WorkContext} from '../../app/lib/bookkeeping/betti-work'
import {homeWorkFixture} from '../fixtures/home-command'
import {restoredDocumentTurn} from '../../app/components/guided/DocumentReviewTurn'
const base=()=>({documentIds:['doc'],recordIds:['record'],documents:[{id:'doc',state:'completed'}],receiptIds:[],context:{jobs:[],documents:[],documentRecords:[],links:[]} as unknown as WorkContext,work:homeWorkFixture('concurrent')})
const job=(record='record')=>({business_id:'b',id:'job',record_id:record,receipt_id:null,document_id:null,state:'pending',kind:'bookkeeping',available_at:'',lease_expires_at:null,updated_at:''})
describe('requested document conversational completion',()=>{
 it('never treats an independent next question as proof of document completion',()=>{const x=base();x.documents[0].state='processing';expect(documentReviewState(x).phase).toBe('processing');expect(x.work.nextAction).not.toBeNull()})
 it('holds after extraction until affected bookkeeping reassessment completes',()=>{const x=base();x.context.jobs=[job()];expect(documentReviewState(x).phase).toBe('processing');x.context.jobs=[];expect(documentReviewState(x).phase).toBe('ready')})
 it('waits for every document in a multi-document upload',()=>{const x=base();x.documentIds.push('doc2');expect(documentReviewState(x).phase).toBe('processing');x.documents.push({id:'doc2',state:'completed'});expect(documentReviewState(x).phase).toBe('ready')})
 it('tracks distinct receipts on one page through their own dependent records',()=>{const x=base();x.context.documentRecords=[{business_id:'b',document_id:'doc',record_id:'second'}];x.context.jobs=[job('second')];expect(documentReviewState(x).phase).toBe('processing')})
 it('tracks receipt processing even before a bank match exists',()=>{const x=base();x.receiptIds=['receipt'] as never[];x.context.jobs=[{...job(),record_id:null,receipt_id:'receipt'}];expect(documentReviewState(x).phase).toBe('processing')})
 it('does not hold current work on unrelated historical jobs',()=>{const x=base();x.context.jobs=[job('unrelated')];expect(documentReviewState(x).phase).toBe('ready')})
 it.each(['needs_attention','unreadable','dead_letter','set_aside'])('%s is not a successful resolution',state=>{const x=base();x.documents[0].state=state;expect(documentReviewState(x).phase).toBe('needs_attention')})
 it('does not call a narrowed remaining fact resolved',()=>{const x=base();x.recordIds=x.work.nextAction!.recordIds;expect(documentReviewState(x)).toEqual({phase:'ready',remainingFact:true})})
 it('does not mutate evidence or canonical question ordering',()=>{const x=base(),before=JSON.stringify(x);documentReviewState(x);expect(JSON.stringify(x)).toBe(before)})
 it('restores only the same business’s received-document turn',()=>{const turn={businessId:'b',documentIds:['doc'],recordIds:['record'],actionId:'action',startedAt:1};expect(restoredDocumentTurn(JSON.stringify(turn),'b')).toEqual(turn);expect(restoredDocumentTurn(JSON.stringify(turn),'other')).toBeNull();expect(restoredDocumentTurn('{bad','b')).toBeNull()})
})

it('includes split components when deciding whether a material fact still remains',()=>{const x=base(),child=x.work.nextAction!.recordIds[0];expect(documentReviewState({...x,components:[{anchor:'record',record:child}]}).remainingFact).toBe(true)})
