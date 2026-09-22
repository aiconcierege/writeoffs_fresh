import type {LedgerClient} from './independent-deletion-ledger.mjs'
export function certifyLiveDeletionLedger(options: {
  writer: LedgerClient; reader: LedgerClient; encryptionKey: Buffer;
}): Promise<{
  result: string; measuredAt: string; source: string;
  syntheticPublication: boolean; versionedReadback: boolean; idempotentRetry: boolean;
  conflictRejected: boolean; independentReaderVerified: boolean; wrongKeyRejected: boolean;
  objectsDeleted: number; bucketConfigurationChanged: boolean; limitations: string[];
}>
