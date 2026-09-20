import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({read:vi.fn(),questions:vi.fn()}))
vi.mock('../../app/lib/bookkeeping/action-index-reader',()=>({readBettiActionIndex:mocks.read}))
vi.mock('../../app/lib/bookkeeping/customer-questions',()=>({getCanonicalQuestionCandidates:mocks.questions}))
import {loadBettiWork} from '../../app/lib/bookkeeping/betti-work-loader'
import {WORK_INPUT_TABLES} from '../../app/lib/bookkeeping/work-input-snapshot'
import {homeWorkFixture} from '../fixtures/home-command'
import type {SupabaseClient} from '@supabase/supabase-js'
const business='10000000-0000-4000-8000-000000000001'
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('WRITEOFFS_ENVIRONMENT','staging');vi.stubEnv('BETTI_ACTION_INDEX_ENABLED','true');mocks.questions.mockResolvedValue({questions:[]})})
afterEach(()=>vi.unstubAllEnvs())
function input(){const rpc=vi.fn().mockImplementation(async (_name:string,parameters:{p_as_of:string})=>({data:{version:1,businessId:business,asOf:parameters.p_as_of,context:{business:{id:business,start:'2026-08-01',activation:'2026-09-01',timezone:'UTC',coverageStart:'2026-08-01',authorizedScope:{businessId:business,selectedStart:'2026-08-01',authorizedStart:'2026-08-01',includedStart:'2026-08-01',activation:'2026-09-01',historicalAuthorized:false,currentFrom:'2026-08-01',catchUp:null}},records:[],accounts:[],jobs:[],documents:[],links:[],coverage:[],deferred:[],questionVersions:[]},reviews:[],askable:[],tables:Object.fromEntries(WORK_INPUT_TABLES.map(name=>[name,[]])),timings:{}},error:null}));return {rpc,args:{db:{rpc} as unknown as SupabaseClient,businessId:business,scope:'business' as const}}}
describe('canonical read continuity during index refresh',()=>{
 it('keeps the clean-index read fast',async()=>{const indexed={...homeWorkFixture('concurrent'),index:{summaryCurrent:true}};mocks.read.mockResolvedValue(indexed);const {rpc,args}=input();expect(await loadBettiWork(args)).toBe(indexed);expect(rpc).not.toHaveBeenCalled()})
 it('does not present a dirty index zero as canonical customer-action truth',async()=>{mocks.read.mockResolvedValue({...homeWorkFixture('waiting'),index:{summaryCurrent:false}});const {rpc,args}=input();const work=await loadBettiWork(args);expect(work.nextAction?.type).toBe('provide_records');expect(rpc.mock.calls.map(call=>call[0])).toEqual(['read_betti_work_inputs'])})
 it('fails closed if the canonical recovery snapshot is unavailable',async()=>{mocks.read.mockResolvedValue({...homeWorkFixture('waiting'),index:{summaryCurrent:false}});const {rpc,args}=input();rpc.mockResolvedValue({data:null,error:{message:'unavailable'}});await expect(loadBettiWork(args)).rejects.toThrow('Betti work inputs unavailable')})
})
