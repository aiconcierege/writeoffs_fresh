import type {LedgerClient} from './independent-deletion-ledger.mjs'
export function certifyLiveDeletionLedger(options: {
  writer: LedgerClient; reader: LedgerClient; encryptionKey: Buffer; onStage?: (stage: string) => void;
}): Promise<{
  result: string; measuredAt: string; source: string;
  syntheticPublication: boolean; versionedReadback: boolean; idempotentRetry: boolean;
  conflictRejected: boolean; independentReaderVerified: boolean; wrongKeyRejected: boolean;
  objectsDeleted: number; bucketConfigurationChanged: boolean; limitations: string[];
}>
export function safeFailureCode(error: unknown): string
export function diagnosticClient(client: LedgerClient, identity: string, state: Record<string, unknown>): LedgerClient
