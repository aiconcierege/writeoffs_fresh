import { beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../../utils/supabase/admin',()=>({createServerAdminSupabase:()=>({rpc:m.rpc})}))
vi.mock('../../app/lib/plaid/config',()=>({plaidEnvironment:()=> 'sandbox',plaidIsConfigured:()=>true}))
import {recordPlaidWebhook} from '../../app/lib/plaid/webhooks'
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockResolvedValue({data:{duplicate:false,itemId:'one',shouldSync:false}})})
it('uses verified delivery time, not a payload-supplied replay timestamp',async()=>{
 const iat=Math.floor(Date.now()/1000),jwt=`e30.${Buffer.from(JSON.stringify({iat})).toString('base64url')}.signature`
 await recordPlaidWebhook(JSON.stringify({environment:'sandbox',webhook_type:'ITEM',webhook_code:'LOGIN_REPAIRED',_verified_issued_at:'2099-01-01'}),jwt)
 expect(m.rpc).toHaveBeenCalledWith('record_plaid_webhook',expect.objectContaining({p_payload:expect.objectContaining({_verified_issued_at:new Date(iat*1000).toISOString()})}))
})
it('fails closed without issued-at claims before touching Item state',async()=>{
 await expect(recordPlaidWebhook(JSON.stringify({environment:'sandbox',webhook_type:'ITEM',webhook_code:'LOGIN_REPAIRED'}),'e30.e30.signature')).rejects.toThrow()
 expect(m.rpc).not.toHaveBeenCalled()
})
