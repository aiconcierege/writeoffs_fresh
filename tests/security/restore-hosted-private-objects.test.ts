import {describe,it,expect,vi} from 'vitest'
import {createHmac} from 'node:crypto'
import {reconcileHostedPrivateObjects} from '../../scripts/backup/reconcile-hosted-private-objects.mjs'
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',key='synthetic-hmac-key-for-testing-only'
const entry={user_identity_hash:createHmac('sha256',key).update(`writeoffs-deletion:v1:user:${user}`).digest('hex'),reason:'customer_request'}
describe('hosted private-object recovery',()=>{
 it('removes a deleted owner’s receipts and statements without an Auth row and preserves another owner',async()=>{
  const a=`receipts/${user}/a.pdf`,b=`statements/${user}/b.pdf`,c=`receipts/${other}/c.pdf`
  const sql=vi.fn().mockReturnValueOnce(JSON.stringify([a,b,c].map(name=>({bucket:'receipts',name})))).mockReturnValueOnce(JSON.stringify([c]))
  const privateRequest=vi.fn().mockResolvedValue({})
  expect(await reconcileHostedPrivateObjects({sql,privateRequest,entries:[entry],hmacKey:key})).toEqual({removed:2})
  expect(JSON.parse(privateRequest.mock.calls[0][1].body).prefixes).toEqual([a,b])
 })
 it('fails closed rather than guessing unknown ownership',async()=>{
  const privateRequest=vi.fn(),sql=()=>JSON.stringify([{bucket:'receipts',name:'unknown-owner.pdf'}])
  await expect(reconcileHostedPrivateObjects({sql,privateRequest,entries:[entry],hmacKey:key})).rejects.toThrow('OWNERSHIP_AMBIGUOUS')
  expect(privateRequest).not.toHaveBeenCalled()
 })
 it('requires actual removal after the storage API acknowledges the request',async()=>{
  const a=`receipts/${user}/a.pdf`,sql=vi.fn().mockReturnValueOnce(JSON.stringify([{bucket:'receipts',name:a}])).mockReturnValueOnce(JSON.stringify([a]))
  await expect(reconcileHostedPrivateObjects({sql,privateRequest:async()=>{},entries:[entry],hmacKey:key})).rejects.toThrow('CLEANUP_FAILED')
 })
})
