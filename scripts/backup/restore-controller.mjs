import {createHash, randomUUID} from 'node:crypto'
import {canonicalDeletionEntry} from './independent-deletion-ledger.mjs'

function requireTrue(value, code) { if (value !== true) throw new Error(code) }
function digest(entries) {
  if (!Array.isArray(entries)) throw new Error('RESTORE_LEDGER_INVALID')
  const rows=entries.map(canonicalDeletionEntry).sort((a,b)=>a.deletion_request_id.localeCompare(b.deletion_request_id))
  if(new Set(rows.map(row=>row.deletion_request_id)).size!==rows.length)throw new Error('RESTORE_LEDGER_DUPLICATE')
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

/**
 * Provider adapter must own isolation and activation OUTSIDE the restored database.
 * A target is created by this controller; accepting an existing target is unsupported.
 * No fallback to the ledger stored inside the backup is permitted.
 * Held source fence must prevent deletion publication until cutover finishes.
 */
export async function restoreFreshTarget({provider, ledger, backup, audit, activationMode = 'activate'}) {
  if (!['activate', 'verify-only'].includes(activationMode)) throw new Error('RESTORE_ACTIVATION_MODE_INVALID')
  const operationId=randomUUID()
  let target, fence
  try {
    fence=await provider.fenceSource({operationId})
    requireTrue(await provider.verifySourceFence(fence), 'RESTORE_SOURCE_NOT_FENCED')
    target=await provider.createIsolatedTarget({operationId})
    if(!target?.id || target.sourceId===target.id || target.operationId!==operationId)throw new Error('RESTORE_TARGET_NOT_FRESH')
    const isolated=async()=>{
      requireTrue(await provider.verifyIsolation(target), 'RESTORE_TARGET_NOT_ISOLATED')
      requireTrue(await provider.verifySourceFence(fence), 'RESTORE_SOURCE_FENCE_LOST')
    }
    await isolated()
    await audit.record({operationId,targetId:target.id,state:'isolated'})
    await provider.restoreArtifacts(target,backup)
    await isolated()
    const entries=await ledger.loadCurrent()
    const ledgerDigest=digest(entries)
    await provider.reconcile(target,entries)
    await isolated()
    const checks=await provider.verifyReconciliation(target,entries)
    for(const check of ['application','authMfa','plaid','privateObjects','jobsAndLeases','survivingTenant']) {
      requireTrue(checks?.[check],`RESTORE_VERIFICATION_${check.toUpperCase()}`)
    }
    requireTrue(await provider.verifyOtherRestoreChecks(target), 'RESTORE_OTHER_CHECKS_FAILED')
    // Re-read the external source after cleanup. A changed ledger cannot be activated.
    if(digest(await ledger.loadCurrent())!==ledgerDigest)throw new Error('RESTORE_LEDGER_CHANGED')
    await isolated()
    // Durable audit is required before access is released, never stored in the backup.
    await audit.record({operationId,targetId:target.id,state:'verified',ledgerDigest,checks})
    if (activationMode === 'verify-only') {
      // Certification records eligibility only. It never releases customer or worker access.
      await isolated()
      await audit.record({operationId,targetId:target.id,state:'eligible-not-activated',ledgerDigest})
      return {operationId,targetId:target.id,ledgerDigest,activated:false,activationEligible:true}
    }
    // Adapter must atomically revalidate its fence/isolation before releasing access.
    requireTrue(await provider.activateVerifiedTarget({target,fence,operationId,ledgerDigest}), 'RESTORE_ACTIVATION_FAILED')
    await audit.record({operationId,targetId:target.id,state:'activated',ledgerDigest})
    return {operationId,targetId:target.id,ledgerDigest,activated:true}
  } catch(error) {
    // Failure even after activation must revoke target access, including workers.
    if(target) {
      try { await provider.blockTarget(target); requireTrue(await provider.verifyIsolation(target),'RESTORE_REBLOCK_FAILED') }
      catch { throw new Error('RESTORE_EMERGENCY_ISOLATION_REQUIRED') }
    }
    // Keep source fence held on failure. Recovery is an explicit controller operation.
    throw error
  }
}
