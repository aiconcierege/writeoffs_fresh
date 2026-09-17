import { beforeEach, describe, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn(),load:vi.fn(),rpc:vi.fn()}))
vi.mock('../../utils/supabase/server',()=>({createServerSupabase:async()=>({auth:{getUser:m.auth},from:m.from,rpc:m.rpc})}))
vi.mock('../../app/lib/bookkeeping/statement-account-use',()=>({loadStatementAccountUse:m.load}))
vi.mock('../../app/lib/documents/durable-processing',()=>({drainCanonicalDocumentJobs:vi.fn()}))
import { GET } from '../../app/api/documents/route'
beforeEach(()=>{
 vi.clearAllMocks();m.auth.mockResolvedValue({data:{user:{id:'owner'}}})
 m.load.mockResolvedValue([{id:'manual-account',displayName:'Statement account',mask:null,designation:null}])
 m.from.mockImplementation((table:string)=>table==='bookkeeping_supporting_documents'
  ?{select:()=>({eq:async()=>({data:[],error:null})})}
  :{select:()=>({order:()=>({limit:()=>({data:[{id:'statement',state:'completed',transaction_count:24}],error:null,in:async()=>({data:[],error:null})})})})})
})
describe('manual document account prerequisite',()=>{
 it('returns unknown statement accounts alongside document status so completion polling can present the question',async()=>{
  const response=await GET(new Request('https://example.test/api/documents'))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({documents:[{state:'completed',transaction_count:24}],accountUseAccounts:[{id:'manual-account',designation:null}]})
  expect(m.load).toHaveBeenCalledWith(expect.objectContaining({from:m.from}),true)
  expect(m.rpc).not.toHaveBeenCalled()
 })
 it('does not force unrelated account questions into transaction-specific document requests',async()=>{
  const response=await GET(new Request('https://example.test/api/documents?record=owned-record'))
  expect((await response.json()).accountUseAccounts).toEqual([])
  expect(m.load).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled()
 })
 it('requires an authenticated owner',async()=>{
  m.auth.mockResolvedValue({data:{user:null}})
  expect((await GET(new Request('https://example.test/api/documents'))).status).toBe(401)
  expect(m.load).not.toHaveBeenCalled();expect(m.from).not.toHaveBeenCalled()
 })
})
