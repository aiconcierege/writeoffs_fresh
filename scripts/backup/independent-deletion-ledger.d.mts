export interface LedgerClient { send(command: unknown): Promise<Record<string, unknown>> }
export interface DeletionEntry {deletion_request_id: string; business_identity_hash: string; user_identity_hash: string; reason: string; effective_at: string}
export interface LedgerOptions {client: LedgerClient; bucket: string; source: string; encryptionKey: Buffer}
export function canonicalDeletionEntry(entry: unknown): DeletionEntry
export function sealDeletionEntry(entry: unknown,key: Buffer,source: string): Buffer
export function openDeletionEntry(payload: Buffer,key: Buffer,source: string): DeletionEntry
export function persistIndependentDeletion(options: LedgerOptions & {entry: unknown}): Promise<{key: string; versionId: string; sha256: string}>
export function loadIndependentDeletions(options: LedgerOptions): Promise<DeletionEntry[]>
