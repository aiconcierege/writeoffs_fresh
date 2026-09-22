import type {DeletionEntry} from './independent-deletion-ledger.mjs'
export function reconcilePrivateArtifacts(input:{root:string;entries:DeletionEntry[];hmacKey:string}):Promise<{removedOwnerPrefixes:number}>
