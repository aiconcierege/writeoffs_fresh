export interface InspectionClient { send(command: unknown): Promise<Record<string, unknown>> }
export function inspectBackupRetention(client: InspectionClient, config: {bucket: string; region: string; prefix: string}): Promise<{
 bucket: string; region: string; inspectedAt: string; mode: string; scope: string; expirationObserved: boolean;
 checks: Record<string,{verified: boolean; value?: unknown; errorCode?: string}>;
}>
