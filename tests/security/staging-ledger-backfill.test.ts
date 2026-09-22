import {describe,it,expect,vi} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {reconcileCompletedTombstones} from '../../scripts/backup/backfill-staging-deletion-ledger.mjs'
const entry={deletion_request_id:'11111111-1111-4111-8111-111111111111',business_identity_hash:'a'.repeat(64),user_identity_hash:'b'.repeat(64),reason:'customer_request',effective_at:'2026-09-21T12:00:00.000Z'}
function database(rows:unknown[],completed=true){return {from:()=>({select:()=>({order:()=>({range:async()=>({data:rows})}),eq:()=>({single:async()=>({data:{status:completed?'completed':'pending',completed_at:completed?'2026-09-21':null}})})})})} as unknown as SupabaseClient}
describe('authoritative historical deletion coverage',()=>{
 it('publishes exact existing immutable evidence, with no invented identities/time',async()=>{const publish=vi.fn(async()=>({versionId:'durable'}));const result=await reconcileCompletedTombstones({database:database([entry]),publish});expect(publish).toHaveBeenCalledWith(entry);expect(result.authoritativeCompletedTombstones).toBe(1)})
 it('validates all rows before publishing anything',async()=>{const publish=vi.fn();await expect(reconcileCompletedTombstones({database:database([entry,{...entry,user_identity_hash:'invalid'}]),publish})).rejects.toThrow();expect(publish).not.toHaveBeenCalled()})
 it('fails closed without completed deletion evidence',async()=>{const publish=vi.fn();await expect(reconcileCompletedTombstones({database:database([entry],false),publish})).rejects.toThrow('COMPLETED_EVIDENCE_REQUIRED');expect(publish).not.toHaveBeenCalled()})
 it('requires durable receipt and propagates immutable conflicts',async()=>{await expect(reconcileCompletedTombstones({database:database([entry]),publish:async()=>({versionId:''})})).rejects.toThrow('DURABILITY_REQUIRED');await expect(reconcileCompletedTombstones({database:database([entry]),publish:async()=>{throw Error('INDEPENDENT_DELETION_CONFLICT')}})).rejects.toThrow('INDEPENDENT_DELETION_CONFLICT')})
 it('does not create entries for an empty source',async()=>{const publish=vi.fn();expect((await reconcileCompletedTombstones({database:database([]),publish})).durableEntriesVerified).toBe(0);expect(publish).not.toHaveBeenCalled()})
})
