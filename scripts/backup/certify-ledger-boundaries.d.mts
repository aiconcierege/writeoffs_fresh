import type {LedgerClient} from './independent-deletion-ledger.mjs'
export function certifyLedgerBoundaries(options: {writer: LedgerClient; reader: LedgerClient; encryptionKey: Buffer}): Promise<{
  result: string; checks: {identity: string; check: string; result: string}[];
  existingLedgerPreserved: boolean; bucketConfigurationMutationsAttempted: number; limitations: string[];
}>
