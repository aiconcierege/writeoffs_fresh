Completed: run 35770340171, staging deployment and real scheduled-worker certification PASS.
See [final assessment](final-offboarding-2026-09-22.md). The plan below is retained as history.

# Approved staging runtime rollout — September 22, 2026

Rick approved transfer of the EXISTING writer Access Key ID, writer Secret Access Key,
and ledger encryption key to ONLY the dedicated staging server runtime. Recovery-reader
credentials stay isolated. No AWS permission change, key rotation or Production change.

## Authentication diagnosis

The Vercel API returned 403 because the cached CLI access token was expired. Running the
existing CLI `whoami` performed its normal OAuth refresh and succeeded. Subsequent API
reads verified project `prj_o56739F1pzd0TjFirEYoLMaa6oIJ`, name
`writeoffs-fresh-staging`, team `team_ojiYZAVSayMNkwJNRKLyKKRG`. No permission was added.
The four proposed variable names are absent from the primary staging slot.

## Protected transfer

The `configure-staging-runtime` operation in the existing staging-backup workflow:
1. Validates every authoritative existing deletion tombstone against a completed request.
2. Publishes exact minimized authoritative entries through conditional encrypted S3 writes
   and durable version/readback verification. No fabricated identity/time; conflicts fail.
3. Verifies fixed Vercel project/team/name before any write; rejects existing destination
   values and any recovery-reader configuration. Never overwrites an existing secret.
4. Creates exactly three `sensitive` server variables plus plain SOURCE=staging, only for
   `production` target of this dedicated staging project (not real Production).
5. Checks variable names/types/targets without decrypting values; emits only safe metadata.

[Vercel sensitive-variable documentation](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
describes the unreadable-after-creation storage used here. No NEXT_PUBLIC names, client
imports, value logs/artifacts, or source-control credentials are introduced.

The temporary protected `WRITEOFFS_TEMP_VERCEL_TRANSFER_TOKEN` contains only the existing
short-lived CLI OAuth access token, sent through gh stdin without printing. The refresh
credential is never copied. This avoids a new long-lived API token or permissions grant.
Remove the temporary GitHub secret immediately after transfer/verification. The original
local CLI login remains for authorized deployment; its copied access token expires normally.
If transfer partially succeeds, stop and inspect metadata; do not rotate or overwrite.

## Preflight evidence

Read-only staging inspection validated **15** tombstones and their completed deletion
requests. No ledger write in local preflight. Protected job uses existing approved writer
credentials; it receives no recovery-reader secrets. Eleven new deterministic tests cover
binding, secret names/types, main/recovery rejection, safe errors, existing-value refusal,
authoritative evidence, empty sources, durability and conflicts.

## After the protected job

Inspect artifacts; remove temporary transfer secret; verify destination metadata and lack
of recovery-reader names. Deploy the already-tested hook only after configuration passes.
Certify an isolated actual application worker with publication-before-cleanup, publication
failure, retry/conflict protection, complete tenant cleanup and unrelated-tenant/MFA checks.
Do not add a public debug endpoint, bypass destructive-action authorization, or run a global
deletion drain over unrelated customers. Historical tombstone coverage must be rechecked
at rollout if any deletion can finish between the protected snapshot and deployment.
No additional hosted restore drill is planned. Final completion remains NO until the real
application worker test passes and temporary transfer material is removed.
