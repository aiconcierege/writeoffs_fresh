export const runtimeSecretNames: string[]
export function configureStagingLedgerRuntime(options: {env: NodeJS.ProcessEnv;request?: typeof fetch}): Promise<Record<string,unknown>>
