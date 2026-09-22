# Backup and Disaster Recovery

Status: launch control and operator runbook. Last verified: 2026-09-14.

This runbook does not authorize a Production restore, plan change, or destructive
operation. Production recovery requires the incident lead and database/security
operator to approve the exact target and recovery point.

## Recovery objectives and coverage

- Launch target: database RPO at most 24 hours and service RTO within one business day.
- Supabase managed daily backups protect Postgres, including Auth records, schema,
  functions, policies, and Storage metadata. They do **not** contain Storage objects.
- WriteOffs therefore requires an encrypted off-provider bundle containing a standard
  PostgreSQL custom-format dump plus a private-object mirror and cryptographic manifest.
- Git plus an immutable Vercel deployment recover application source/builds; neither
  replaces database or private-object recovery.

Supabase Pro and consecutive daily physical database backups are verified in the
Supabase dashboard. PITR remains deliberately deferred. The independent encrypted S3
pipeline was externally certified against staging in GitHub Actions run `34895992706`:
private Storage collection, PostgreSQL 17 custom dump, encrypted deletion-ledger export,
WOBAK creation, S3 upload/HEAD/version/checksum verification, round-trip download, and
authenticated artifact recovery all passed. Production scheduling remains disabled.

## Launch configuration

Use Supabase Pro as the minimum Production tier. It provides daily backups with seven
days of retention, organization MFA enforcement, seven-day log retention, and launch-
appropriate Micro compute allowances. Enable the spend cap initially and monitor
database, connection, bandwidth, and Storage use. Team is not required for initial
capacity; choose it only if 28-day logs, platform audit logs, project-scoped roles, or
its support/compliance features are an approved requirement.

PITR is disabled and intentionally deferred for launch. The approved launch design uses
Supabase scheduled backups plus a nightly independent encrypted database-and-Storage
backup. This makes a 24-hour RPO the honest launch target; it is not equivalent to PITR.
Reconsider PITR after launch if observed write volume or recovery requirements make a
day of possible data loss unacceptable. Enabling it remains a separate recurring-cost
decision requiring Rick's approval.

Recommended cadence:

- Supabase managed database backup: daily, verified every day.
- Independent encrypted database plus Storage bundle: nightly; additionally before
  migrations or risky releases.
- Storage object copy: nightly as part of the same recovery point. A shorter incremental
  interval is an optional later improvement, not a launch claim.
- Integrity verification: every backup; isolated restore: quarterly and before launch.

## Independent encrypted bundle

`scripts/backup/create-encrypted-backup.mjs` packages a PostgreSQL custom-format dump
that preserves grants (required for restored RLS access),
a protected mirror of the private Storage bucket, and a SHA-256 manifest. It encrypts
the archive with AES-256-GCM using a random 96-bit nonce and authenticates the file
header. `scripts/backup/restore-encrypted-backup.mjs` authenticates the archive and
verifies every dump/object hash before restoring.

The 32-byte base64 key is supplied only as `WRITEOFFS_BACKUP_KEY_BASE64`; it must live
in an approved secrets manager, never source control, logs, the backup destination, or
the same recovery account. Rick must designate two key custodians, an offline recovery
copy, rotation procedure, and a separate backup destination. Losing the key loses the
backup. The scripts create mode-0600 artifacts and mode-0700 temporary workspaces and
remove working plaintext on exit, but operators must also use encrypted, access-limited
runner disks.

`scripts/backup/collect-supabase-storage.mjs` now inventories and downloads the private
`receipts` and `statements` path families with a before/after inventory comparison.
`scripts/backup/run-backup-to-s3.mjs` performs the staging-only collection, deletion-ledger
export, encrypted bundle creation, S3 upload verification, download, authenticated
round-trip validation, and protected-workspace cleanup. It refuses a source environment
other than `staging`, validates the expected Supabase project and database identity, and
validates the exact S3 bucket and region.

The approved destination is the private, versioned, Object-Locked AWS S3 bucket
`writeoffs-backups-264524064115-us-east-2-an` in `us-east-2`. Default SSE-S3 remains a
provider-side second layer; the `.wobak` is already encrypted before upload. The runner
uses unique keys shaped as
`<prefix>/staging/<daily|weekly|monthly>/YYYY/MM/DD/<UTC timestamp>-<UUID>.wobak`, never
overwrites, and requires no delete permission. The bucket's 35-day Governance retention
is the anti-deletion floor. Public-access posture is a dashboard/IAM control: the narrowly
scoped runner intentionally lacks permission to change or inspect bucket policy.

Production scheduling remains unconfigured. The staging runner credentials are held in
the protected `staging-backup` GitHub environment, and a real immutable S3 round trip has
passed. Do not retain the plaintext database dump or Storage mirror after a successful
encrypted upload and verification.

Example contract (values intentionally omitted):

```sh
WRITEOFFS_BACKUP_DATABASE_URL=... \
WRITEOFFS_BACKUP_STORAGE_ROOT=/protected/receipts-export \
WRITEOFFS_BACKUP_OUTPUT=/protected/writeoffs-YYYYMMDD.wobak \
WRITEOFFS_BACKUP_KEY_BASE64=... \
node scripts/backup/create-encrypted-backup.mjs
```

The collector uses the privileged server-side Storage API; it does not make the bucket
public or create signed URLs. The entire private `receipts` bucket is covered through its
two current customer path families: `receipts/{userId}/...` and
`statements/{userId}/...`. It records path, source identity/update metadata, byte size and
SHA-256, and discards the mirror if an object is missing, changes size, or the source
inventory changes during collection.

Final runner command (secrets supplied only by its secret store):

```sh
npm run backup:staging-s3
```

The runtime requires PostgreSQL client tools, encrypted temporary storage, outbound HTTPS
to Supabase and S3, and enough time to collect every private object. The manual-only
`.github/workflows/staging-backup-certification.yml` workflow establishes the runner
contract without enabling a schedule. GitHub Actions is the smallest launch runner because
the source and workflow are recoverable there and hosted runners provide secret injection
and job visibility. Configure its protected `staging-backup` environment with approval
and concurrency one; never place the key or cloud credentials in repository variables or
logs. After external certification, a later explicitly approved change can add the nightly
schedule. A dedicated AWS runner is not required at initial scale.

### Approved restore path — September 21, 2026

Rick approved **fresh isolated targets with controller-owned cutover**. In-place restores
of a live Supabase project are not a supported activation path. The hosted verify-only adapter passed run 35767459267 on September 22, 2026.
This certifies reconciliation and eligibility, not an actual customer cutover. Do not
activate a restored target manually outside the controller.

`scripts/backup/restore-controller.mjs` enforces the orchestration contract: source
publisher fence, fresh target, externally verified isolation, artifact recovery, latest
independent ledger, deletion/object/Auth/Plaid/job verification, second ledger read,
required restore checks, durable audit and controlled activation. Failures leave or put
the target back behind the isolation gate. The provider adapter must enforce isolation
outside the database being restored, including direct Auth/REST/Storage and worker access.
It must hold the source fence through cutover and clean up a partially created target if
provisioning fails. Customer-visible API keys/routes and workers must not be released
before successful reconciliation. A restored ready flag is not sufficient.

The following command recovers **artifacts only**, not a live database or ready service.
Direct `WRITEOFFS_RESTORE_DATABASE_URL` use is rejected by the helper. The controller's
provider adapter owns actual database import into its verified fresh target:


```sh
WRITEOFFS_RESTORE_INPUT=... \
WRITEOFFS_RESTORE_DATABASE_DUMP_OUTPUT=/protected/restored-database.dump \
WRITEOFFS_RESTORE_STORAGE_ROOT=/protected/restored-objects \
WRITEOFFS_RESTORE_CONFIRM_ISOLATED=yes \
WRITEOFFS_BACKUP_KEY_BASE64=... \
node scripts/backup/restore-encrypted-backup.mjs
```

Within the gated controller, restore objects to a **private** target bucket at their original
paths. Reconfigure Auth URLs, SMTP, API keys, Storage settings, webhooks, extensions,
cron, and environment secrets; these provider settings are not all restored by a
database clone. Keep autonomous workers and external webhooks disabled until verification.

## Verification checklist

1. Compare migration inventory/checksums and required extensions/functions.
2. Confirm all Business-owned tables have RLS and expected policies.
3. Test Tenant A access and a denied Tenant B read using authenticated roles.
4. Verify receipt metadata path, object hash, private bucket, signed access, and linked record.
5. Verify current canonical decisions, allocations, customer correction/history chain,
   mileage, invoice/manual-money records, reports, and no duplicate current projection.
6. Recreate secrets/provider settings from the controlled configuration inventory.
7. Run queue health checks before enabling workers; then process one synthetic job.
8. The controller must read the latest independent deletion ledger, not only the ledger
   bundled with the backup. `npm run deletion-ledger:reconcile` is a legacy scheduling
   primitive, not a completed restore or service gate. Complete every required deletion,
   including private objects whose owner row is absent. Re-read the external ledger under
   the held source fence and fail closed if it changed. PITR requires the same fresh-target
   isolation and reconciliation; it does not exempt this step.
9. Record recovery point, database/object restore time, deletion reconciliation result,
   validation time, gaps, and approver.

## Incident paths

| Incident | Contain | Recover and verify |
| --- | --- | --- |
| Bad deployment | Stop promotion; retain database | Reassign the known-good Vercel deployment; smoke-test environment identity and queues |
| Corrupt/deleted database data | Disable writes/workers and preserve evidence | Choose a managed or independent backup point; restore in isolation; run full verification before cutover |
| Lost receipt object | Preserve metadata and stop destructive cleanup | Restore exact object/path from independent bundle; verify hash and tenant-only access |
| Supabase project/region outage | Disable provider-dependent writes | Restore DB plus objects into approved replacement project; rotate keys and reconfigure providers |
| Credential compromise | Revoke sessions/tokens and isolate integrations | Rotate affected keys; restore only if integrity changed; audit access and customer impact |
| Plaid outage | Keep canonical state; pause sync retries if necessary | Resume idempotent sync; no database restore unless local integrity was affected |
| Local/source loss | Revoke any local credentials | Clone the protected Git remote; restore provider configuration from controlled inventory |
| Restore predates customer deletion | Keep restored service isolated | Import the off-provider encrypted deletion ledger, schedule and complete reconciliation deletions, verify objects absent, then activate service |

## Current gaps

- Supabase Pro and scheduled daily physical database backups are verified. PITR is
  deliberately disabled. Production SSL enforcement, region, retention detail, and a
  real restore remain manual dashboard/provider verification items.
- The independent AWS destination and its controls are created. Storage collection and
  S3 multipart-capable upload/download are implemented, locally contract-tested, and
  externally staging-certified in run `34895992706`.
- Production scheduling, Production backup credentials/key custody, backup staleness
  monitoring, and longer-class provider lifecycle rules are not configured.
- The deletion ledger must be exported after every completed deletion and at least daily
  to a separately controlled encrypted destination. A backup is not eligible for service
  activation until ledger reconciliation completes.
- A paid provider-hosted isolated restore remains a later resilience exercise, not a
  launch blocker. The disposable PostgreSQL 17 restore and canonical local Supabase
  reconciliation drills used only synthetic tenants and private objects.

## Tombstone restore certification — 2026-09-14

The final staging-only DR certification combines the real custom-format PostgreSQL 17
restore drill recorded below with the database-backed canonical lifecycle test in
`tests/security/account-deletion.local.test.ts`. The restored pre-deletion tenant state
was present before reconciliation. An independently held minimized tombstone entry then
scheduled canonical deletion, the lease-fenced deletion functions removed that tenant,
its restored private-object path was removed, and Auth cleanup completed last. An
unrelated tenant, its transaction, correction/history state, and private object remained.
Reapplying the ledger after completion scheduled zero work.

The encrypted-ledger tests also fail closed for a missing ledger, wrong AES key, tampered
ciphertext, malformed envelope/path, and a restore lacking the explicit isolation guard.
An already-deleted tenant and an already-absent object remain harmless. Tombstones contain
only pseudonymous hashes and deletion control metadata—never books or financial content.
Plaid connections are not resumed by reconciliation; Stripe remains external authority;
workers, webhooks, and lifecycle/notification delivery must remain disabled until the
reconciliation and verification checklist completes.

This supports the launch targets, not stronger guarantees: RPO up to 24 hours and RTO
within one business day. The remaining DR launch blocker is enabling and monitoring the
approved Production nightly job with Production-specific secrets after explicit approval.

The workflow is now manual-only and unscheduled. Because GitHub exposes branch-local
`workflow_dispatch` workflows in the UI only after the workflow exists on the default
branch, a future staging certification must use a reviewed, temporary path-scoped staging
push trigger (added and removed in the same bounded operation), or an authenticated API
dispatch if GitHub later supports the branch-local workflow. Never leave that bootstrap
trigger enabled and never add it to `main` merely for staging convenience.

## External runner configuration

| Variable | Kind | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | config/operator-only | Hosted source API identity |
| `SUPABASE_SERVICE_ROLE_KEY` | secret/operator-only | Private Storage and ledger access |
| `WRITEOFFS_BACKUP_DATABASE_URL` | secret/operator-only | Direct/pooler PostgreSQL dump source |
| `WRITEOFFS_BACKUP_KEY_BASE64` | secret/operator-only | 32-byte application encryption key |
| `ACCOUNT_DELETION_HMAC_KEY` | secret/operator-only | Tombstone identity reconciliation |
| `WRITEOFFS_BACKUP_SOURCE_ENVIRONMENT` | config | Must be `staging` in the current runner |
| `WRITEOFFS_BACKUP_EXPECTED_SUPABASE_PROJECT_REF` | config | Fail-closed source identity guard |
| `WRITEOFFS_BACKUP_S3_REGION` | config | `us-east-2` for the approved vault |
| `WRITEOFFS_BACKUP_S3_BUCKET` | config | Destination bucket |
| `WRITEOFFS_BACKUP_EXPECTED_S3_BUCKET` | config | Fail-closed destination identity guard |
| `WRITEOFFS_BACKUP_S3_PREFIX` | config | Optional vault namespace |
| `WRITEOFFS_BACKUP_S3_ENDPOINT` | config | Empty for AWS; enables S3-compatible portability |
| `WRITEOFFS_BACKUP_S3_ACCESS_KEY_ID` | secret/operator-only | Restricted runner identity |
| `WRITEOFFS_BACKUP_S3_SECRET_ACCESS_KEY` | secret/operator-only | Restricted runner credential |
| `WRITEOFFS_BACKUP_CLASS` | config | `daily`, `weekly`, or `monthly` |
| output/restore path variables | generated/operator-only | Protected ephemeral workspace paths |

Store runtime secrets in the protected runner environment. Keep the backup encryption key
also in the organization password manager and a sealed offline recovery copy, separate
from both S3 and the AWS credential. Rotation is manual today; because bundles carry no
key ID, record the applicable key version in the secrets inventory without putting it in
the archive.

Recommended launch cadence is one coherent nightly database, Storage, ledger, encryption,
upload and verification job. Rick approved the following exact expiration policy on
September 21, 2026: daily backups 35 days, weekly backups 84 days, monthly backups 90 days.
Obsolete noncurrent versions expire after one day once Object Lock/legal holds permit;
remove expired delete markers and abort incomplete multipart uploads after seven days.
The independent minimized deletion ledger must remain outside backup expiration rules.

Live AWS configuration passed read-only run 35662828362; see
`docs/audits/backup-dr/lifecycle-certified-2026-09-21.json`. Actual elapsed expiration
has not been observed. S3 lifecycle
processing is asynchronous, and holds can postpone deletion. Expiring a current version
alone does not remove its noncurrent versions. The current workflow is manual-only;
nightly cadence is not yet certified. A ledger captured only in a backup is insufficient
for post-restore deletion enforcement.

Backup failure reporting should create a minimized WriteOffs operational alert when the
database is reachable and send through the existing Resend operations channel. The runner
must additionally use GitHub's independent failed/missed-workflow visibility (or an
equivalent dead-man check), because a failed database cannot be the sole alert store.

## Source recovery checkpoint — 2026-09-10

The validated staging application and its launch-readiness tooling are preserved in
`github.com/aiconcierege/writeoffs_fresh` on branch `v2-onboarding-staging`. The coherent
current remote checkpoint is commit `49acb24238ccfa086dbdfe7b5a9620d27016e288`
on `v2-onboarding-staging`. The latest named recovery marker is
`staging-recovery-2026-09-10-notifications`; because later validated operational-alert
work follows that tag, the full commit SHA is the authoritative current source marker.

Clean recovery procedure:

1. Clone the repository and check out the recorded recovery branch or tag.
2. Install the locked dependency graph with `npm ci`.
3. Recreate environment values from the approved secrets manager using `.env.example`;
   never recover values from Git or copy an environment file between staging and
   Production.
4. Recreate a database from the ordered files in `supabase/migrations/`, then restore
   the independently encrypted database and private-object bundle using the isolated
   restore procedure above.
5. Verify RLS, tenant isolation, object linkage, bookkeeping totals, corrections, and
   queue health before enabling writes, workers, or webhooks.
6. Reconstruct staging in its dedicated Vercel project and verify its Supabase, Plaid,
   Stripe, Auth, and application-environment identities before assigning the staging
   alias. Production deployment requires separate explicit approval and the same
   environment-identity checks.

When using Vercel's local prebuilt path, run `vercel build --prod`, then
`npm run vercel:sanitize-output` before `vercel deploy --prebuilt --prod`. The
sanitizer removes local `.env*` mappings that the prebuild trace may add to server
functions; deployment credentials must come from Vercel and never from the artifact.

Git intentionally does not contain operational secrets. Full recovery therefore also
requires controlled copies of Vercel environment values; Supabase project/API/database
credentials; Plaid credentials; Stripe credentials and webhook secrets; the independent
backup encryption key and destination credentials; DNS/domain controls; and SMTP/email
provider settings. These belong in an approved organization secrets manager with an
offline recovery process and named custodians, not on a developer laptop or in source.

Historical note: Teller was previously used and a Teller private key was committed in
old Git history. Teller has been removed from the application, the provider/service is
defunct, and no provider endpoint or account remains against which the credential could
authenticate or be revoked. Current source contains neither Teller credential material
nor a Teller runtime integration. The historical blob remains security debt; coordinated
history sanitation may be considered later as defense in depth, but it is not required
for operational recovery of the current source.

## Restore drill record — 2026-09-09

An isolated PostgreSQL 17 source and target were created inside the local Supabase Docker
runtime. The synthetic source contained two tenants, six RLS-enabled Business-owned tables,
six policies, `auth.uid()`, one $217.89 record/receipt linkage, a current Personal decision,
its customer correction event, and a 12.375-mile entry. A private receipt image was mirrored
at its tenant path. No staging or Production data was used.

The encrypted bundle creation and authenticated extraction each measured under one second
at shell-second resolution; PostgreSQL restore and validation completed in the same bounded
local exercise. The first validation correctly failed because the manual restore omitted
grants. The tooling was corrected to preserve privileges and the target was recreated. The
successful rerun proved Tenant A saw exactly one record/receipt/current decision/correction
and 12.375 miles, while Tenant B saw zero Tenant A receipts/records. All six policies, all
six RLS flags, `auth.uid()`, the $217.89 total, object hash, and receipt path matched.

This supports a mechanism RTO of seconds for the tiny fixture and proves no intrinsic
24-hour data-loss window in the archive itself. It does **not** prove operational RTO or RPO:
without scheduled off-provider execution, the defensible current independent-backup RPO is
undefined, and provider recovery RTO remains unmeasured. With a verified nightly independent
backup, the launch target is RPO ≤24 hours and RTO ≤1 business day, pending a
Production-shaped provider-hosted drill.
Lifecycle delivery state is part of the database backup. After a restore, operators must
reconcile deletion tombstones before delivery workers resume so restored obsolete customer
warnings cannot be sent. A reconciliation failure must create a minimized
`tombstone_reconciliation_failed` operational alert before recovery activation.

## Independent ledger deployment prerequisites

- Separate restricted runtime writer credentials and recovery-reader credentials. Proposed
  policies live under `docs/audits/backup-dr/ledger-*-policy.proposed.json`; Rick applied
  them and protected-runner live permission probes passed. The filenames preserve provenance.
- The EXISTING AES-256 ledger key is protected in `staging-backup` and its independent
  `staging-dr-recovery` recovery copy. Do not regenerate it. Recovery-copy authentication
  passed run 35757112853. Never use the backup encryption key as the ledger key.
- Server-only staging configuration: `WRITEOFFS_DELETION_LEDGER_SOURCE=staging`,
  `WRITEOFFS_DELETION_LEDGER_KEY_BASE64`, `WRITEOFFS_DELETION_LEDGER_ACCESS_KEY_ID`,
  `WRITEOFFS_DELETION_LEDGER_SECRET_ACCESS_KEY`. Never use NEXT_PUBLIC variables for these.
- Backfill and verify all existing minimized permanent-deletion tombstones before relying
  on the independent ledger. New writes alone do not protect earlier deletions.
- Certify conditional write/readback, denied overwrite/delete, uncertain-success retry,
  key availability in the recovery environment and the full live paginated reader.
- Publish at the irreversible deletion boundary, before private-object/application/Auth
  cleanup. Keep failed publication retryable. Do not deploy unconfigured fail-closed code
  into a working deletion worker and call the rollout complete.

## Local drill evidence and limits — September 21, 2026

`docs/audits/backup-dr/local-postgres-drill-2026-09-21.json` records an actual encrypted
PostgreSQL T1 backup restored after T2 synthetic deletion, into a fresh network-disabled
Docker database. The customer was present before reconciliation and absent afterward;
Auth/MFA, Plaid state, financial/bookkeeping records, receipt/statement files and jobs were
removed while another synthetic tenant survived. The controller's 13 deterministic tests
also reject failed verification, unavailable/changing ledger and missing source fences.

This is **internal deterministic certification**, not live S3 or hosted Supabase certification.
The source schema came from local development plus accepted offboarding corrections, not
a fresh full hosted staging export. No question/answer fixture rows were populated. Auth
and objects were checked at the database/filesystem layer, not through hosted API gateways.
The drill activation callback validated isolation but deliberately opened no networking.
Remaining hosted-adapter work must enforce actual access/worker release and rollback.

Reproduction currently needs an isolated schema-only fixture prepared as described in
`docs/DR_DELETION_SAFETY.md`, then
`node scripts/backup/drill-local-fresh-restore.mjs --synthetic-only /private/tmp/writeoffs-dr-schema-...`.
Never point this script at an existing customer database. It verifies a synthetic Docker
label and disabled networking before mutations. Retain audit evidence; stop synthetic
containers after the run. Do not delete real backup infrastructure.


## Certified hosted recovery sequence — September 22, 2026

Evidence: [hosted result](audits/backup-dr/hosted-dr-certified-2026-09-22.json),
[cleanup](audits/backup-dr/hosted-dr-cleanup-2026-09-22.json), and
[final assessment](audits/backup-dr/final-offboarding-2026-09-22.md).

1. Select the encrypted database/private-object backup and preserve its manifest. The drill
   used a synthetic T1 archive, not a Production backup or a full live customer dataset.
2. Provision a fresh isolated target through the controlled provider path. Keep customer
   API access, Auth signup, application bindings, webhooks and normal workers disabled.
   Existing/live project replacement is unsupported. Verify public APIs and private-file denial.
3. Fence source deletion publishers through verification/cutover. In the synthetic drill,
   the source database container is paused and checked; real deployment fencing must be
   implemented by the operational adapter, not inferred from a database ready flag.
4. Restore database and private objects under isolation. Preserve managed Auth schema;
   restore only supported Auth data. Apply/recheck public privileges and Storage RLS.
   Storage owner grants cannot be removed by ordinary postgres REVOKE: verify RLS enabled,
   no permissive policies, no public buckets, and no customer bypass/owner inheritance.
5. Load the latest independent ledger using the recovery-reader identity and EXISTING key.
   Missing/incomplete listing, authentication failure or changed ledger fails closed.
   Never substitute the older ledger contained inside a backup.
6. Reconcile minimized identities; delete restored owner-prefixed private files, apply
   canonical deletion, remove Auth/MFA, Plaid tokens/Items/cursors, and jobs/leases.
   Do not run normal workers as a shortcut to reconciliation.
7. Verify all six data classes plus the surviving tenant and retained minimized tombstone.
   Re-read the independent ledger under the source fence. Record the verified audit before
   eligibility. The hosted drill used protected runner evidence for this audit.
8. The certified adapter returns **eligible-not-activated**. It deliberately cannot perform
   real customer cutover. Any future operational cutover adapter must atomically revalidate
   the fence/isolation and control access release; that is not certified by this drill.
9. On any failure keep the target blocked and source fence held. Preserve sanitized error
   evidence, repair/retry through the controller, or discard the disposable target. Never
   override the gate to recover availability. On success remove temporary credentials and
   disposable fixtures when no longer needed; retain nonsecret audit evidence.

The hosted test proved resurrection, re-deletion, wrong-key rejection and B preservation.
It used canonical SQL deletion and hosted Auth SQL, synthetic Plaid state, and real Storage
API cleanup. It did not exercise a newly deployed application deletion worker.

### Staging application rollout certified — September 22, 2026

The existing writer credentials and ledger key were transferred by protected run 35770340171
to sensitive server-only variables on dedicated staging project `prj_o56739F1pzd0TjFirEYoLMaa6oIJ`.
Recovery-reader credentials are absent from runtime. The temporary transfer secret was
removed, and its workflow operation was retired. CLI OAuth refresh resolved the earlier
403 without extra permissions. No ledger key was regenerated or retrieved locally.

The deployed deletion worker now publishes/read-verifies the independent obligation before
irreversible cleanup. Fifteen authoritative pre-existing completed tombstones were durably
verified before deployment. New completed deletions publish through the worker. Publication
failure is retryable without cleanup; exact retry is idempotent and conflict fails closed.
Both synthetic customers were ultimately deleted through the actual scheduled application
worker. Auth/MFA, private files, Plaid state and jobs were removed. The residual audit found
zero deleted-tenant rows across 99 business-owned tables. See the final assessment above.

Existing local tombstone effective_at can represent cleanup time whereas the external
obligation uses stable started_at. When auditing future historical coverage, compare the
authoritative identity/reason and the recorded publication obligation; do not overwrite an
immutable S3 entry merely to make timestamps equal. The one-time historical backfill is
retired; any future conflict must be investigated, never silently rewritten.

Keep using the EXISTING protected key and least-privilege identities. Future Production
configuration requires its own explicit authorization; the staging publisher is intentionally
bound to staging. Do not treat successful staging certification as a Production deployment.
