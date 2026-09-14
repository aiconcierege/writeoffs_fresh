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
Supabase dashboard. These remain recovery targets until the independent backup schedule,
destination, key custody, and a provider-hosted isolated drill are configured and tested.
The 2026-09-09 local drill proves the mechanism, not provider-region recovery time.

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

Production scheduling, destination credentials, an actual S3 round trip, and a
provider-hosted isolated restore remain unconfigured until the operator runner receives
secrets out of band. Do not retain the plaintext database dump or Storage mirror after a
successful encrypted upload and verification.

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

Restore only into a newly created, isolated target:

```sh
WRITEOFFS_RESTORE_INPUT=... \
WRITEOFFS_RESTORE_DATABASE_URL=... \
WRITEOFFS_RESTORE_STORAGE_ROOT=/protected/restored-objects \
WRITEOFFS_RESTORE_CONFIRM_ISOLATED=yes \
WRITEOFFS_BACKUP_KEY_BASE64=... \
node scripts/backup/restore-encrypted-backup.mjs
```

After database restore, upload objects to a **private** target bucket at their original
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
8. Import the separately encrypted deletion ledger, run `npm run deletion-ledger:reconcile`,
   drain every scheduled reconciliation deletion, and verify restored private objects for
   those identities are absent. This also applies if PITR is enabled later.
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
  S3 multipart-capable upload/download are implemented and locally contract-tested.
- AWS runner credentials and a staging backup key are not available in the current
  operator environment, so no real S3 object was created in this phase. Scheduling,
  secrets-manager custody, backup staleness monitoring, and provider lifecycle rules are
  not configured.
- The deletion ledger must be exported after every completed deletion and at least daily
  to a separately controlled encrypted destination. A backup is not eligible for service
  activation until ledger reconciliation completes.
- A provider-hosted isolated restore remains required after those choices. The local
  drill used synthetic financial records and a private object without Production data.

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
upload and verification job. Retain daily points for 35 days, weekly points for 8–12 weeks,
and monthly points for three months initially. Unique keys and the 35-day Object Lock
prevent cleanup from altering protected versions; lifecycle expiration for longer classes
is a later AWS dashboard configuration. Export the deletion ledger after every completed
deletion where practical and always in the nightly bundle.

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
