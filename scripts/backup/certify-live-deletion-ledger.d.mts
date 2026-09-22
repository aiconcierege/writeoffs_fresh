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
export function credentialShape(value: unknown): {present: boolean; expectedIamAccessKeyShape: boolean; leadingOrTrailingWhitespace: boolean; embeddedWhitespace: boolean}
export function signingDiagnostic(error: unknown): string
export function diagnoseLedgerReadOnly(options: {writer: LedgerClient; reader: LedgerClient}): Promise<{result: string; writesAttempted: number; checks: Record<string, unknown>[]; note: string}>
