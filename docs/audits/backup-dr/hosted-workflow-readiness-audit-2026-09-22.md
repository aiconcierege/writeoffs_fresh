# Hosted DR workflow readiness after run 35763762162

**This is readiness evidence, not completed hosted restore certification.**

## Exact failure

Reviewed the full 294-line GitHub log, job step results, and the diagnostic artifact.
The PostgreSQL 17 Docker clients succeeded. The drill started and failed at
`target-preflight` with `DR_PRIVILEGE_BARRIER_FAILED`.

This was an **activation-gate implementation issue in the certification adapter**.
The connection uses `postgres`. Storage tables are owned by `supabase_storage_admin`,
which also issued the customer-role grants. `postgres` has grant options but cannot
assume the owner role or revoke that owner's grants. Its REVOKE did not remove those
grants. The following permission predicate returned false; the harness raised its
own assertion. No underlying database exception was recorded in the run.

TLS, empty-target inspection and HTTP/private-canary checks had passed. Public ACL
statements had executed. No source schema copy, synthetic customer creation, backup,
ledger publication, resurrection, or reconciliation occurred. The gate stayed closed.

## Corrections

1. Storage isolation now verifies the actual provider controls: both tables have RLS
   enabled, no policies exist, customer roles cannot bypass RLS or inherit table
   ownership, and no buckets are public. These checks are conservative: *any* Storage
   policy blocks readiness. Public-table and function privileges are checked separately.
   Removed the ineffective Storage REVOKE. No provider grants were broadened or changed.
2. Extracted the exact hosted drill body for a local rehearsal. Only provider boundaries
   change; backup, fixtures, restore selection, encryption, ledger matching, canonical
   deletion, verification and controller transitions execute the same code.
3. Unexpected restore/database failures now retain their original error/SQL state rather
   than being replaced by `DR_FAILURE_TEST_UNEXPECTED` inside the deliberate bad-key test.
4. Local fixture metadata was stale by five Plaid Update Mode columns. Applied those
   accepted repository declarations **locally only**, populated representative repair/
   new-account state, and verified all 256 relevant columns and five deletion functions
   match staging. The hosted job continues to read current staging schema with no data.
5. Local provider modeling now faithfully represents managed schema ownership, database
   CREATE privileges, role switching, and Storage's `allow_delete_query` API context.
   These are local adapter corrections, not changes to hosted permissions or API behavior.
6. The source PostgreSQL image is pulled during preparation, before credentials are used, instead of relying on a cold image pull completing inside a database-operation timeout.
7. Local source cleanup failure now fails certification; target cleanup is independently
   recorded. Local rehearsal rejects live ledger, target, database and AWS credentials.

## Complete workflow audit

| Stage | Evidence / result |
| --- | --- |
| PostgreSQL clients/container invocation | Real PostgreSQL 17.6 Docker clients, read-only mounts and secret-free command arguments; regression tests and actual TLS query PASS. |
| TLS/database connectivity | Full hostname/CA verification against the disposable target PASS. |
| Dump/restore compatibility | Actual PG17 custom dump, encrypted archive extraction and selective SQL restore completed in the shared-code local run. |
| Database creation/reset | Fresh local target created; only its empty public schema replaced transactionally. Existing Auth schema retained. Hosted CREATE privilege and inherited ownership of `public` verified read-only. No hosted reset performed. |
| Schema/migrations | 256 fixture/lifecycle columns and five deletion-function hashes exactly match staging; no customer rows read. |
| Synthetic fixture | A/B with Auth/MFA, financial/Plaid state including repair fields, bookkeeping, question/answer history, private files and live job leases. PASS. |
| Backup creation | Real encrypted `.wobak` containing pre-deletion A/B dump and four files. PASS. |
| Restore execution | Shared restore code restores both tenants exactly; A is demonstrably resurrected while isolation remains enforced. PASS locally. |
| Independent ledger | Actual authenticated encryption and conditional/versioned provider interface in local rehearsal; wrong-key failure tested. Existing live AWS/recovery-key certification remains separate. No live key accessed locally. |
| Deletion reconciliation | Same canonical verified-request/claim/delete/complete SQL functions; ledger obligation exists before source deletion; recovery matches identities and removes A. PASS locally. |
| Auth/MFA | Rehearsal deletion and cascade PASS; real hosted insert/delete/cascade tested inside a rolled-back synthetic transaction. |
| Plaid state | A Item/token/cursor/repair/new-account/lease row removed; B row unchanged byte-for-byte in snapshot comparison. Synthetic tokens, no real Plaid API call. |
| Private objects | Ledger-based owner mapping, orphan-capable cleanup, A files gone and B files intact. Real hosted upload/read/private denial/delete cycle PASS; temporary probe removed. |
| Jobs/leases | A processing jobs/leases absent; B preserved; local targets have no customer network or normal workers. |
| Gate | Bad ledger key prevents eligibility; six negative variants fail closed: public bucket, permissive policy, disabled RLS, role bypass, public table grant, executable public function. Success grants eligibility only, never activates. |
| Cleanup | Local source/target containers removed; host target and temporary secret deliberately preserved for certification. Final hosted cleanup still pending. |
| Artifact/report | Failure artifact present for this run; preparation fallback retained; detailed sanitized stage/SQL-state evidence preserved without source data or secrets. |

## Evidence boundaries

- `hosted-workflow-local-rehearsal-2026-09-22.json`: **INTERNAL DETERMINISTIC FULL DR**.
  Uses isolated local PG17, SQL-backed synthetic Storage and a local encrypted/versioned
  ledger. Does not certify live S3 + hosted restore as one combined operation.
- `hosted-boundary-check-2026-09-22.json`: **HOSTED SYNTHETIC BOUNDARY CHECK**.
  API/gate/TLS checks, Auth/MFA rollback, and an actual Storage API cycle. The target is
  still empty of Auth users/application tables; original canary remains.
- `hosted-schema-compatibility-2026-09-22.json`: **READ-ONLY SCHEMA COMPATIBILITY**.
- Previous independent live S3/key-recovery certifications are retained; no key changes.

The next protected run is justified by a complete shared-code rehearsal plus direct
checks of the hosted boundaries. Provider/runtime faults can still occur. Do not mark
Plaid User Offboarding complete until the actual hosted combined drill and cleanup pass.

## Validation and known warnings

- Complete shared-code local rehearsal: PASS, including all six negative gate variants
  and local container cleanup. Repeated successfully after aligning Plaid schema.
- Full regression suite: 1,884 passed; 143 existing environment-dependent tests skipped.
- Optimized webpack build: PASS. TypeScript checked separately after build generation
  to avoid competing writes to `.next/types`.
- Lint: no errors; 16 existing warnings. Backup-script secret scan and diff checks pass.
- Dependency audit: two existing moderate development findings (`vitest` and
  `@vitest/mocker`, GHSA-82fw-gwwq-j7x9); package/lock files unchanged. No production
  dependency findings in the preceding production-only audit. A major test-runner
  upgrade is outside this targeted DR correction and is not claimed completed.
- No protected run was dispatched during diagnosis or these rehearsals. No hosted
  schema/data restore, ledger-key access, AWS changes or permission broadening occurred.
