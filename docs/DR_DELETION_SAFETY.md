# Backup / DR deletion safety

Current status — September 22, 2026: **hosted restore drill PASS; real staging application-worker rollout PASS**.
See [final assessment](audits/backup-dr/final-offboarding-2026-09-22.md) and the current
[runbook](BACKUP_AND_DISASTER_RECOVERY.md). The sections below are a chronological
engineering history; earlier pending/failed statements are superseded by later evidence.
The latest application-worker evidence proves the publisher is deployed on dedicated staging.
Real Production is unchanged.

## Required invariant

Restoring an older backup must never reactivate a permanently deleted customer. The existing cancellation, grace, disconnect and application-deletion policies remain authoritative.

## Inspected baseline

- Independent vault: `writeoffs-backups-264524064115-us-east-2-an`, AWS S3 `us-east-2`.
- Existing runner checks region and versioning, encrypts bundles before upload, and verifies upload/download integrity. The runbook records a 35-day Governance Object Lock hold. That is not an expiration policy.
- The current GitHub workflow is manual-only. Its latest recorded successful run is `34895992706`, September 14, 2026.
- Backup credentials exist in the protected GitHub `staging-backup` environment. Local AWS credentials are not available. Secret names were inspected; values were not retrieved.
- Live inspection was rerun after read-only IAM access was granted. See the latest result below; lifecycle configuration now passes after the monthly marker prefix correction.
- Rick approved the exact retention policy on September 21, 2026: daily 35, weekly 84, monthly 90 days, noncurrent expiration after one day once legal/Object Lock holds permit, expired-marker cleanup, multipart abort after seven days. The minimized independent ledger must not inherit backup expiration.

## Prepared and tested locally

1. `scripts/backup/inspect-s3-retention.mjs`: strictly read-only bucket configuration and representative staging-version inspection. Access denied remains **unverified**, never silently interpreted as missing configuration. No object payload is downloaded. Configuration inspection never claims time-elapsed expiration.
2. Existing GitHub workflow has a proposed `inspect-retention` mode with only the existing S3 credentials. It does not receive the database credential or backup encryption key. Artifact contains configuration/metadata only. This mode was pushed and run twice; see evidence below.
3. `scripts/backup/independent-deletion-ledger.mjs`: authenticated encryption of minimized entries, source binding, conditional first-write, immutable request keys, read-back verification with required S3 version, idempotent retry, conflict rejection, and full paginated reads from a live independent prefix. Tests use an in-memory S3 boundary, **not real S3**.
4. Four focused tests, TypeScript, focused lint, secret scan and diff checks pass. No application-deletion integration or service gate is claimed yet.

## Planned enforcement sequence

At the existing irreversible deletion boundary, after the grace period:

1. Preserve stable keyed customer/business identities and deletion request identity.
2. Durably publish the minimized independent entry **before** deleting live data.
3. Verify the stored object/version and persist its receipt in the existing deletion workflow.
4. Complete existing provider/object/application/Auth cleanup.
5. Allow completion only with a verified independent receipt. Failed publication remains retryable and must not report irreversible completion. Uncertain successful publication is retried under the same key.

The external entry represents an irrevocable deletion obligation after grace expires. It must survive loss/restoration of the primary database. No access token, email, financial amount, transaction description, or document belongs in it.

Restore automation must block service and worker activation before loading old data; load the **latest independent** ledger rather than the ledger embedded in the old backup; reapply scoped object/application/Auth deletion; verify absence and preservation of the other fixture tenant; and activate only after reconciliation and required checks pass. Source writes/deletion workers must be quiesced during cutover so ledger publication cannot race final activation. Missing, inaccessible, corrupt or incomplete ledger state must fail closed.

The final gate must cover application traffic, direct data-access paths, and workers. A page-level flag or a `ready` row restored from the old backup is insufficient. Do not deploy a partial gate as if it enforces this invariant. Actual provider isolation/binding and credentials need verification before finalizing that integration.

## Access history

- Rick approved the read-only bootstrap; commit `5ab3f05` is pushed. Subsequent application deployment and full DR work remain subject to certification.
- Rick attached the proposed read-only inspection policy; the rerun no longer has AccessDenied responses. Do not copy protected secrets into chat or logs.

All application behavior, staging deployment and real Production remain unchanged by this preparation. Unapproved Betti assets are untouched. The local Docker engine was started; existing containers were not reset or modified, and no customer data was copied. A new isolated drill target has not yet been created.

## Read-only bootstrap result — September 21, 2026

Approved bootstrap commit: `5ab3f05d58693e607b842937c63b2d4b39d80a34`.
Non-forced staging push completed. [GitHub run 35657109364](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35657109364) succeeded; backup job was skipped. No S3 writes/deletes or application deployment were performed by the inspection.

Verified through AWS: us-east-2, bucket versioning enabled, one current staging backup
(September 14, 2026; 6,537,223 bytes), sampled object SSE-S3 AES256, no incomplete
staging multipart uploads. The complete staging-prefix version listing contained no
noncurrent versions or delete markers. This does not verify their expiration policy.

AccessDenied: lifecycle, bucket encryption defaults, bucket Object Lock configuration,
public-access block, policy public status and sampled legal hold. These remain unverified,
not absent. Object retention inspection also needs explicit read permission to verify
hold metadata. Requested additive read-only policy:
`docs/audits/backup-dr/inspection-read-permissions.json`. It grants no write/delete or
Governance bypass. An authorized AWS administrator must apply it to the protected
runner identity (or provide equivalent read-only inspection access).

Validation: 1,825 tests passed, 143 skipped; TypeScript and lint passed (existing warnings).
Default Turbopack build failed on the known local port-binding sandbox restriction;
optimized webpack build passed. The staging push used a one-command HUSKY=0 override
after those checks; hooks were not changed. Only the four inspection files were committed.
Retention policy documentation and independent ledger preparation remain local.

Actual time-elapsed lifecycle expiration has not been observed. Restore gate,
live independent ledger integration and isolated restore drill remain unfinished.
Plaid User Offboarding remains **NO** until those controls are certified.

## Live inspection after IAM grant — September 21, 2026

[Run 35659077353](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35659077353)
succeeded. Sanitized configuration evidence:
`docs/audits/backup-dr/live-inspection-2026-09-21.json`.

| Control | Actual result |
| --- | --- |
| Region | us-east-2 |
| Versioning | Enabled; MFA Delete disabled |
| Default encryption | SSE-S3 AES256 |
| Public access | All four bucket public-access blocks enabled |
| Bucket policy | NoSuchBucketPolicy; not evidence that bucket is public |
| Object Lock | Enabled, default Governance 35 days |
| Sample version retention | Governance until October 19, 2026, 20:59:13 UTC |
| Lifecycle | **NoSuchLifecycleConfiguration: absent** |
| Legal hold read | NoSuchObjectLockConfiguration; do not claim verified OFF |
| Staging versions | One current September 14 backup, no noncurrent versions/delete markers |
| Incomplete staging multipart uploads | None |
| Elapsed expiration | Not observed |

No S3 mutation was performed. The missing lifecycle means automatic backup expiration
is not enforced, including noncurrent versions. The manual-only workflow and one backup
also do not establish nightly backup coverage.

Prepared exact configuration: `docs/audits/backup-dr/staging-backup-lifecycle.proposed.json`.
Six rules target only staging/daily/, staging/weekly/, staging/monthly/; daily/weekly/monthly
expire at 35/84/90 days, obsolete versions after one day, incomplete uploads after seven
days, with separate expired-delete-marker rules. No root-wide rule, Production rule,
ledger rule, retention bypass, object deletion call or Object Lock alteration is included.
AWS configuration application replaces the lifecycle configuration: re-read before applying
and stop if any rules have appeared since inspection rather than overwrite concurrent work.
Existing Object Lock/legal holds remain controlling and actual expiration is asynchronous.
See [AWS lifecycle semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html).

The prepared configuration is **not applied**. The protected runner's read-only inspection
permission does not authorize/configure a mutation workflow. Rick has been asked to either
apply the JSON in AWS or approve a tightly scoped interim configuration workflow with the
needed AWS permission before final certification.

Local ledger reads now reject missing pagination completeness and repeated continuation
tokens, preventing silent partial-ledger acceptance or an endless list loop. Seven focused
tests pass across ledger, inspection and policy scope. These are local tests, not a live
independent-ledger or restore-gate certification. Existing application deletion behavior
has not changed. Full DR completion remains outstanding.

## Post-application verification — September 21, 2026, 22:20 UTC

[Read-only run 35662091088](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35662091088)
verified actual AWS configuration after Rick's manual application. Exact comparison is in
`docs/audits/backup-dr/lifecycle-verification-2026-09-21.json`.

**Policy match: FAIL.** All six rules are enabled. Four daily/weekly rules match exactly.
The monthly expiration rule has correct prefix, 90-day current expiration, one-day
noncurrent expiration and seven-day incomplete-upload abort, but its ID is literally
`Rule name: writeoffs-staging-monthly-expiration`.
The monthly marker rule has ID `Rule name: writeoffs-staging-monthly-expired-markers`
and, materially, prefix `Prefix: staging/monthly/` instead of `staging/monthly/`.
That rule does not clean up actual monthly backup delete markers. Remove the literal
`Rule name: ` from the two IDs and `Prefix: ` from the monthly marker filter in AWS.

Verified unchanged against the previous live read: versioning enabled, default SSE-S3,
all four public-access blocks, default Governance Object Lock 35 days. The sampled
backup version, size, checksum metadata, encryption, lock mode and October 19 retention
end all match the prior inspection. Production and deletion-ledger prefixes are excluded
from every actual rule. No elapsed expiration is claimed. No AWS mutation, commit, push
or deployment was performed in this verification pass.

The full DR continuation was conditional on matching lifecycle configuration; that
condition is not yet met. Independent ledger integration, automated restore reconciliation,
service activation gating and the actual synthetic restore drill remain outstanding.
Plaid User Offboarding: **NO**.

## Lifecycle certified; runtime integration in progress — September 21, 2026

[Read-only run 35662828362](https://github.com/aiconcierege/writeoffs_fresh/actions/runs/35662828362)
confirms **configuration PASS**. Evidence: `docs/audits/backup-dr/lifecycle-certified-2026-09-21.json`.
All six enabled rules have exactly the approved prefixes/actions. Monthly IDs retain the
cosmetic `Rule name: ` text; these do not change behavior and do not block certification.
Production/ledger prefixes are excluded. Versioning, encryption, public-access blocks,
Object Lock and the existing backup's version/protection metadata match the prior read.
Actual elapsed lifecycle deletion remains unobserved. No AWS changes were performed.

Local, undeployed integration now calls the independent ledger publisher before private
objects, application data or Auth are deleted. Publication failures use the existing
retryable failure path. The publisher requires separate server-only ledger credentials
and a separate AES-256 key; there is no fallback to backup credentials or local-only
success. It is deliberately pinned to the dedicated staging Supabase project and S3
bucket until a separately authorized Production rollout. `started_at` is used for stable
retry timestamps. Live credentials/protection and interrupted-write recovery still need
certification. Do not deploy this hook without that configuration: it intentionally fails
closed when the ledger is unavailable.

Behavioral tests verify no cleanup on publication failure, publication before cleanup,
minimized stable retry payload, missing-configuration rejection, wrong-target rejection,
key validation and client/key cleanup. These are internal deterministic tests, not proof
of a live S3 write or a restore drill.

### Restore architecture decision pending

Recommended supported path: **fresh isolated target, controller-owned activation after
reconciliation**. Restoring directly into the currently public Supabase project requires
separate provider-level isolation. The browser uses Supabase directly, so a Next.js
maintenance flag cannot gate every access path. A ready row restored from a database
backup also cannot establish external readiness.

The controller must own target access/worker activation outside restored data, keep Auth,
REST and private-object access unavailable to customers, reconcile the current independent
ledger, verify all target data classes and a surviving synthetic tenant, and only then
release the target. Source deletion publishers must be quiesced through cutover to avoid
an entry racing final verification. No existing Production target or customer is involved.
Rick has been asked whether fresh-target controlled cutover is the supported DR path or
whether in-place Supabase restore must also be supported. This is a material infrastructure
tradeoff under AGENTS.md section 7, not permission to skip reconciliation.

No automatic gate or complete restore-drill success is claimed. User Offboarding remains NO.

## Approved fresh-target implementation and local drill — September 21, 2026

Rick approved fresh-target restore and controlled cutover. The previously pending
architecture decision is resolved. A hosted target and live ledger access remain unprovisioned.
Read-only Supabase project metadata inspection found only Writeoffs, writeoffs-beta and
writeoffs-staging; none is an approved disposable DR target. No project settings changed.
A temporary hosted target/spending decision is pending. Proposed runtime writer and
recovery reader IAM policies are prepared locally; no IAM/S3 mutations were made.

Implemented locally:
- `scripts/backup/restore-controller.mjs`: fenced source, fresh isolated target, current
  external ledger, cleanup verification for six data/access classes, second ledger read,
  durable audit before activation, reblock on failure. Provider implementation is required;
  the generic controller is not a deployed hosted access gate.
- Direct database import through the old artifact helper now fails closed.
- `reconcile-private-objects.mjs`: removes restored owner prefixes using minimized hashes
  even when the Auth/database owner is absent; rejects ambiguous ownership/symlink roots.
- `drill-local-fresh-restore.mjs`: actual PostgreSQL dump, application-layer encryption,
  independent local encrypted tombstone, T2 canonical deletion, T3 fresh Docker restore,
  automatic canonical re-deletion and private-object cleanup. Successful result saved as
  `docs/audits/backup-dr/local-postgres-drill-2026-09-21.json`.

The local schema fixture was built with pg_dump --schema-only from the existing local
Supabase container (no customer rows or role passwords), into a new labeled network-none
container and empty dr_source database. The local image roles were preserved, pgcrypto
installed in extensions, and the accepted 20261005000600 offboarding correction applied
only to this isolated fixture. Drill rows are synthetic and seeded explicitly, not Plaid
API ingested. Earlier setup failures exposed an initialization-server readiness race,
missing pgcrypto and default-public-schema assumptions; all were fixed before the passing
run. Existing local development containers and hosted projects were never mutated.

Passing drill: old customer observed before reconciliation; application records, Auth/MFA,
Plaid credentials/cursors, private objects and jobs absent after; surviving tenant retained.
The adapter did not release actual customer networking. This does not certify hosted
Auth/REST/Storage isolation, live S3, current question/index tables or Production readiness.
All running synthetic DR containers were stopped after evidence capture; their data was
not deleted. The original local development containers remain untouched.

Further work: provision least-privilege live ledger identities/key; backfill old tombstones;
implement and certify hosted provider isolation/cutover and external durable audit; populate
remaining question/history fixtures; run the full hosted drill and failure/retry cases.
Only then commit/push/deploy under the existing completion condition. User Offboarding NO.

## Hosted provisioning approval and verified cost — September 21, 2026

Rick approved one temporary hosted DR target with a maximum $25 budget. A Micro project
`writeoffs-dr-certification-20260921` (`xlqgnokbsymiciygpqda`) was created in us-east-2,
in the existing organization without a plan change. The provider billing API confirmed
Micro $0.01344/hour and no other selected add-ons. A new random database password was
stored in a private local file, never printed or committed. Evidence:
`docs/audits/backup-dr/hosted-provisioning-2026-09-21.json`.

The API rejected pausing this paid-tier project (HTTP 400: not free-tier). Earlier generic
pause-based cost-control assumptions do not apply to this account. No downgrade was
attempted. Since live S3 ledger access remains unavailable, management SQL verified zero
Auth users, zero Storage objects and zero public application tables, then ONLY this empty
temporary project was deleted. Deletion returned HTTP 200 and a fresh project listing
verified its absence and all three pre-existing projects ACTIVE_HEALTHY. No backup,
customer data, existing project settings or AWS configuration was changed.

The approval remains available for recreation when prerequisites are ready, within the
remaining budget. Track cumulative hourly charges conservatively; the provider invoice
has not been inspected. Use prompt cleanup, not paid-project pause, to stop compute cost.
A hosted target was provisioned successfully but NO hosted restore drill was performed.

Next infrastructure prerequisite: restricted ledger writer/recovery identities and a
separate key. Prepared policies are not applied, and those secrets are not configured.
Do not reuse the broad backup-runner credentials in the application. Do not deploy the
fail-closed deletion hook until live ledger publication/read/retry and existing-tombstone
backfill are certified. Hosted provider isolation/cutover implementation remains unfinished.

## Hosted preparation — September 22, 2026

Protected recovery copy passed in run `35757112853`; environment protections and
exactly three recovery secrets were verified. The bootstrap environment secret is
removed. Rick confirmed manual revocation/deletion of the temporary personal token;
that revocation is owner-attested, not independently proven through a token API.

Fresh synthetic target `hkvmfbqshqthsfxmwlsq` was provisioned at the verified Micro
rate of $0.01344/hour, with no paid add-ons. No application binding or normal worker
uses it. No real customer data was copied. Full hosted restore is **not yet run**.

A live probe demonstrated that disabling legacy API keys alone is insufficient:
Storage still accepted a retired anon JWT for a bucket-list request. The isolated
target now additionally revokes customer-role privileges on private-object metadata.
A private canary is readable by the recovery controller and not by anonymous/retired
customer credentials. Full TLS hostname/certificate verification and the PostgreSQL
restore permission probe passed. The final controller must maintain these controls
through restore, including restored grants/functions and private bucket settings;
preflight probes do not certify that final invariant.

Evidence: `docs/audits/backup-dr/hosted-preflight-2026-09-22.json`.
Next protected-runner credential transfer is prepared, not executed:
`docs/audits/backup-dr/hosted-runner-secret-plan.md`.

Remaining: full A/B resurrection and automatic independent-ledger re-deletion,
Auth/MFA/private objects/Plaid/jobs checks, failed-ledger activation denial, control
tenant preservation, cleanup, final validation and offboarding certification.
Do not mark Plaid User Offboarding complete on these preflight results.


## Hosted certification and cleanup complete — September 22, 2026

Run 35767459267 passed all required synthetic hosted restore assertions. The artifact
was inspected against the executed code, not just the GitHub status. Customer A was
resurrected under isolation, automatically re-deleted using the live independent ledger,
and B survived. Wrong-key authentication failed closed; no customer/worker activation
or Production cutover occurred. Temporary target secret removed and project deletion
verified. Evidence and remaining application rollout requirements are in the final assessment.


## Final staging runtime certification — September 22, 2026

Protected run 35770340171 verified 15 authoritative completed tombstones and transferred
only approved existing writer secrets/key. Temporary transfer secret removed; one-time
workflow retired. Deployment dpl_9s8CE5XZqU63v3Ji6VzXevik61an passed the REAL scheduled
application-worker sequence: publication failure preserved data; valid publication preceded
controlled downstream failure; identical retry succeeded; conflict failed closed; original
facts completed deletion. Zero remaining rows across 99 business-owned tables, Auth/MFA and
private storage. B survived, then was cleaned up through the same application worker.
All earlier pending-runtime statements are historical. Final assessment: **YES**, at the
explicit evidence levels in `audits/backup-dr/final-offboarding-2026-09-22.md`.
