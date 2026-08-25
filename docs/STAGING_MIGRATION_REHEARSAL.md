# Staging Migration Rehearsal

Rehearsal date: 2026-08-25. Target: Supabase project `writeoffs-staging` (`sgrqrrxrlglhjuetdtps`), region `us-east-2`. No production resource was used.

## Before migration

The linked remote migration ledger matched local migrations exactly through `20260821000200_add_receipt_understanding_shadow.sql`. There were no remote-only, renamed, missing-history, or checksum reconciliation conditions. Eleven local migrations were pending.

Supabase reported a completed physical backup from August 25 before the migration, seven additional completed daily artifacts, WAL backups enabled, and PITR disabled. No destructive reset was run.

`supabase db push --linked --dry-run` named exactly the expected eleven files. Only then was the linked staging push authorized.

## Applied order

1. `20260824000100_add_compound_economic_reconciliations.sql`
2. `20260824000200_add_canonical_business_mileage.sql`
3. `20260824000300_add_canonical_manual_financial_activity.sql`
4. `20260824000400_add_canonical_invoice_workflow.sql`
5. `20260824000500_add_deduction_intelligence_foundation.sql`
6. `20260824000600_add_contractor_awareness.sql`
7. `20260825000100_add_durable_document_processing.sql`
8. `20260825000200_add_statement_intelligence.sql`
9. `20260825000300_add_statement_ocr_account_links.sql`
10. `20260825000400_add_canonical_memberships.sql`
11. `20260825000500_correct_2026_contractor_awareness.sql`

The migration application completed in roughly 30 seconds. No SQL error, lock error, manual history repair, seed, role change, or destructive reset occurred. A post-run `supabase migration list --linked` showed every local version applied remotely through `20260825000500`.

## Validation and findings

Static schema suites and the full deterministic test suite validate tables, views, RPCs, indexes and RLS contracts. A synthetic remote integration attempt confirmed the migrated APIs were reachable, but launching twelve local-oriented suites concurrently exceeded staging Auth request limits: 7 tests completed, while remaining tests timed out or received `Request rate limit reached`. This was not accepted as an application defect. A paced rerun with one worker and 30-second remote timeouts passed all four membership and reporting/current-record tests, including separate Businesses, denied cross-tenant reads, denied browser membership writes, grant idempotency, stale provider-event protection, and canonical reporting isolation. The remaining domains retain static/local RLS coverage but were not all re-exercised remotely in this incomplete deployment rehearsal.

The migration rehearsal itself passed. The full staging application rehearsal did not: no Vercel staging project/domain was linked, required staging environment values were missing, and therefore mandatory MFA browser behavior, Stripe TEST webhooks, Plaid Sandbox webhooks, cron, deployed headers/cookies, OCR and desktop/mobile staging E2E could not be validated.

No permanent prelaunch membership grants were created because staging test Businesses and secure operator credentials were not defined. Synthetic integration fixtures exercised canonical grant behavior. The broad timeout-interrupted run left 49 recent synthetic users/Businesses; a bounded Auth administrative cleanup attempt returned provider status 500 because referenced application data prevents direct user deletion. Do not manually edit canonical tables to remove them. Resolve these fixtures through the future approved account-deletion/retention procedure before the next rehearsal.

## Rollback and production lesson

These migrations are additive/history-preserving. If application rollback is required, leave the schema in place and redeploy the prior compatible application; after data/provider events, forward-fix rather than running destructive DOWN migrations. Pause expensive processing and provider entry points before rollback when necessary. Provider webhook idempotency remains authoritative.

For production: obtain a current backup, confirm exact ledger parity, run the same dry-run, apply these versions in order before dependent application code, verify RLS/current views/membership functions, create approved grants, then deploy. Do not expose Checkout before signed webhook synchronization.

## Backup/restore status

`BACKUP/RESTORE PROOF INCOMPLETE`. A real staging backup artifact is confirmed, but it was not restored into a separate rehearsal project, and private Storage recovery/linkage was not exercised. Both remain P0 before paid production.
