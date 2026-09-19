import {expect,it,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {indexedQuestionClient} from '../../app/lib/bookkeeping/indexed-question-command'
it('retries only a rolled-back deadlock once with identical canonical arguments',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({error:{code:'40P01'}}).mockResolvedValueOnce({error:null,data:{_guidedIndex:{businessId:'b',nextAction:null}}})
 const t=indexedQuestionClient({db:{rpc} as unknown as SupabaseClient,businessId:'b',id:'q',version:'v'})
 await t.client.rpc('answer_bookkeeping_transaction_type_review_issue',{p_answer:{activity:'earned_money'}})
 expect(rpc).toHaveBeenCalledTimes(2);expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);expect(t.next()?.businessId).toBe('b')
})
it.each(['40001','42501','NETWORK_ERROR'])('does not retry stale, unauthorized or ambiguous failures: %s',code=>{
 const rpc=vi.fn().mockResolvedValue({error:{code}}),t=indexedQuestionClient({db:{rpc} as unknown as SupabaseClient,businessId:'b',id:'q',version:'v'})
 return t.client.rpc('skip_bookkeeping_review_issue',{}).then(()=>{expect(rpc).toHaveBeenCalledOnce();expect(t.next()).toBeNull()})
})
it('keeps the original persisted deferral deadline on an identical retry',async()=>{
 const rpc=vi.fn().mockResolvedValue({error:null,data:{}}),t=indexedQuestionClient({db:{rpc} as unknown as SupabaseClient,businessId:'b',id:'q',version:'v',replay:{functionName:'skip_bookkeeping_review_issue',arguments:{p_deferred_until:'original'}}})
 await t.client.rpc('skip_bookkeeping_review_issue',{p_deferred_until:'later'})
 expect(rpc.mock.calls[0][1].p_arguments.p_deferred_until).toBe('original')
})
