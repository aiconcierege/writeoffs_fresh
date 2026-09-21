import {describe,it,expect,vi} from 'vitest'
import {removePlaidItemIdempotently} from '../../app/lib/plaid/remove-item'
import type {PlaidGateway} from '../../app/lib/plaid/types'
describe('provider removal retry',()=>{
 it('accepts already removed Items but never swallows authorization or transient failures',async()=>{
  const gateway={removeItem:vi.fn().mockRejectedValue({response:{data:{error_code:'ITEM_NOT_FOUND'}}})} as unknown as PlaidGateway
  await expect(removePlaidItemIdempotently(gateway,'private-test-token')).resolves.toBeUndefined()
  for(const code of ['INVALID_ACCESS_TOKEN','INTERNAL_SERVER_ERROR','INVALID_API_KEYS']){
   const error={response:{data:{error_code:code}}};vi.mocked(gateway.removeItem).mockRejectedValue(error)
   await expect(removePlaidItemIdempotently(gateway,'private-test-token')).rejects.toBe(error)
  }
 })
})
