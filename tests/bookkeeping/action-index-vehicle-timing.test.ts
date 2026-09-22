import {expect,it,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {readBettiActionIndex} from '../../app/lib/bookkeeping/action-index-reader'
const read=(data:unknown)=>readBettiActionIndex({db:{rpc:vi.fn().mockResolvedValue({data,error:null})} as unknown as SupabaseClient,businessId:'owned',view:'guided'})
it('falls back to canonical facts for a persisted deduction projection without timing metadata',async()=>{
 expect(await read({businessId:'owned',index:{version:1},nextAction:{question:{source:'deduction'}}})).toBeNull()
})
it('keeps ordinary transaction questions on the indexed path',async()=>{
 const data={businessId:'owned',index:{version:1},nextAction:{question:{source:'bookkeeping'}}}
 expect(await read(data)).toBe(data)
})
it('still rejects cross-tenant projections before inspecting their question',async()=>{
 await expect(read({businessId:'other',index:{version:1},nextAction:{question:{source:'deduction'}}})).rejects.toThrow('ACTION_INDEX_INVALID')
})
