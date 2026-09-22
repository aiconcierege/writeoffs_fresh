import type {DeletionEntry} from './independent-deletion-ledger.mjs'
export interface RestoreTarget {id:string;sourceId:string;operationId:string}
export interface RestoreProvider {
 fenceSource(input:{operationId:string}):Promise<unknown>;
 verifySourceFence(fence:unknown):Promise<boolean>;
 createIsolatedTarget(input:{operationId:string}):Promise<RestoreTarget>;
 verifyIsolation(target:RestoreTarget):Promise<boolean>;
 restoreArtifacts(target:RestoreTarget,backup:unknown):Promise<void>;
 reconcile(target:RestoreTarget,entries:DeletionEntry[]):Promise<void>;
 verifyReconciliation(target:RestoreTarget,entries:DeletionEntry[]):Promise<Record<string,boolean>>;
 verifyOtherRestoreChecks(target:RestoreTarget):Promise<boolean>;
 activateVerifiedTarget(input:{target:RestoreTarget;fence:unknown;operationId:string;ledgerDigest:string}):Promise<boolean>;
 blockTarget(target:RestoreTarget):Promise<void>;
}
export function restoreFreshTarget(input:{provider:RestoreProvider;ledger:{loadCurrent():Promise<DeletionEntry[]>};backup:unknown;activationMode?:'activate'|'verify-only';audit:{record(event:Record<string,unknown>):Promise<void>}}):Promise<{operationId:string;targetId:string;ledgerDigest:string;activated:boolean;activationEligible?:true}>
