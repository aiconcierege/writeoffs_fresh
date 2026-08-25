# WriteOffs Production Launch Gate

Review date: 2026-08-25. Status values are `READY`, `NEEDS CONFIGURATION`, `BLOCKED EXTERNALLY`, `BLOCKED INTERNALLY`, and `POST-LAUNCH`.

## Gate matrix

| Area | Status | Evidence / required action |
| --- | --- | --- |
| Next.js security | READY | `NEXT SECURITY GATE CLEAR`: Vercel moved the release to August 25; installed 16.3.3 is the Active LTS fix for the announced critical issues. Recheck official advisories immediately before deployment. |
| npm audit | READY | Current install must retain 0 critical/high/moderate; rerun immediately before release. |
| production build | READY | Local production build gate is mandatory; pin Vercel Node 22. |
| Auth/session/recovery | READY | Supabase SSR, safe redirects, recovery, logout, and route policy are implemented; production URLs/SMTP require configuration. |
| Mandatory customer MFA | NEEDS CONFIGURATION | TOTP flow is validated; production must enable TOTP and set `MFA_ENFORCEMENT_MODE=required` after staged enrollment/support validation. |
| Supabase production | NEEDS CONFIGURATION | Dedicated project, expected-host binding, Auth URLs/SMTP, capacity/logs/backups/PITR and secrets must be configured. |
| RLS/tenant isolation | READY | Representative static/integration suites cover major Business domains; repeat against staged migration set. Any failure is P0. |
| Migration set | NEEDS CONFIGURATION | Compare remote migration history, stage full ordered chain, backup, then apply before dependent code. No remote state was assumed. |
| Queue/worker | READY | Durable claims/leases/retries/dead letter, bounded authenticated drain, cost pause, and health metrics exist. |
| Vercel cron | NEEDS CONFIGURATION | One-minute declaration exists; configure strong `CRON_SECRET`, 60-second duration support, success/backlog alerts, and prove staging invocations. |
| Monitoring/alerting | NEEDS CONFIGURATION | Thresholds/runbooks defined; provider-native dashboards and operator destinations must be configured. |
| Database/Storage backups | NEEDS CONFIGURATION | Verify plan backup retention and private Storage recovery; select PITR and perform isolated restore exercise. |
| Restore procedure/DR | NEEDS CONFIGURATION | Procedure and RPO/RTO targets documented; first restore exercise must pass. |
| Stripe test lifecycle | READY | Real TEST Checkout/webhook/lifecycle validation is documented. |
| Stripe live | NEEDS CONFIGURATION | Live Products/Prices/secrets/webhook/restricted Portal/email/dunning/Tax decision and controlled smoke test remain. |
| Plaid Sandbox | READY | Link/sync/current-record/convergence behavior tested; Sandbox only. |
| Plaid Production | BLOCKED EXTERNALLY | Plaid approval/security review and Production institution/webhook tests required. Non-Plaid launch path remains possible. |
| OCR/receipts/statements | READY | Durable storage, dedupe/reuse, bounded OCR/chunks/retries and emergency pause exist. Configure provider credentials/cost alerts. |
| Memberships/read-only | READY | Business-owned authority, entitlements, history/export, grants, and lifecycle are implemented. Live Stripe remains separate. |
| 2026 tax rules | READY | Approved versioned catalog; 2025 preserved; 2027 fails closed. Re-review final Schedule C instructions before form-level claims. |
| Legal/privacy/support | NEEDS CONFIGURATION | Reachable Terms/Privacy/contact exist; professional review, approved recovery/retention/deletion policy and support ownership remain. |
| Account deletion/retention | BLOCKED INTERNALLY | No complete self-service deletion workflow or approved retention/purge policy. Approve policy and operationalize a reauthenticated request before paid public launch. |
| Rate limiting/abuse | NEEDS CONFIGURATION | Supabase Auth/provider limits plus app idempotency exist; configure distributed Vercel WAF rules and alerts before public traffic. |
| Smoke/staging | NEEDS CONFIGURATION | Production-shaped staging must pass migrations, mandatory MFA, Stripe TEST, Plaid Sandbox, cron/OCR, desktop/mobile E2E and smoke list. |

## P0 — cannot launch paid public product safely

1. Any tenant-isolation failure discovered in staging/production-shaped tests.
2. Production environment/provider identity check failure or a missing required secret for an enabled feature.
3. No verified database/private-document backup and restore path.
4. Exposing live Checkout before signed webhook synchronization is proven.

## P1 — required before paid public launch

- Configure dedicated production Supabase, TOTP/mandatory-MFA rollout, SMTP/redirects, capacity, logs, backups and PITR decision.
- Stage and review the full migration chain; create explicit approved prelaunch membership grants before entitlement enforcement.
- Pin Node 22 in Vercel; configure cron secret, duration, monitoring and successful worker drain.
- Configure Vercel WAF distributed limits for Auth, billing-session and costly endpoints; preserve legitimate bulk intake.
- Configure monitoring/alerts, provider cost budgets, support ownership, incident contacts, and perform restore/incident exercises.
- Complete Stripe live configuration, restricted Portal, webhook, email/dunning and Stripe Tax professional decision. Use a controlled synthetic/authorized smoke test.
- Approve retention/deletion policy and provide an operational, reauthenticated deletion-request path.
- Obtain legal/privacy review of customer surfaces and approve lost-factor/account-compromise procedures.
- Decide whether launch waits for Plaid Production or launches with statement/CSV alternatives; do not expose Sandbox in production.

## P2 — shortly after launch

- Automate more provider-cost anomaly summaries and restore evidence.
- Add a bounded operator status surface only if provider-native tools and approved SQL/RPC are insufficient.
- Mature transactional support notifications without duplicating Stripe email behavior.
- Review retention automation/orphan reconciliation after policy is approved.
- Reassess monitoring thresholds and RPO/RTO using actual load.

## Staging exit criteria

Staging uses the complete migration set, production-equivalent environment validation, mandatory MFA, Stripe TEST, Plaid Sandbox, private Storage, cron/worker and OCR. It passes desktop/mobile MFA, membership/read-only and statement journeys; tenant/RLS suites; production build; signed Stripe/Plaid webhook checks; queue interruption/recovery; rate-rule QA; and the production smoke checklist with synthetic data.

## Production activation sequence

1. Reconfirm the cleared Next.js advisory gate and dependency audit immediately before release.
2. Confirm access roles/MFA and backup checkpoint.
3. Configure validated environment identity with Stripe/Plaid disabled.
4. Apply staged migrations in order and verify RLS/functions/views.
5. Create approved Business-owned prelaunch grants.
6. Deploy and smoke-test Auth, mandatory MFA, membership/read-only, historical data and canonical reporting.
7. Enable cron and OCR processing; verify queue completion and alerts.
8. Configure Stripe live Products/Prices, signed webhook, restricted Portal, emails/dunning; prove synchronization before exposing Checkout.
9. Keep Plaid disabled until external approval and Production test plan pass.
10. Run synthetic smoke tests, observe, and use the rollback decision point. Never reset production or use customer data as fixtures.

## Current recommendation

The application code and architecture are suitable to enter production-shaped staging, but paid public production is not cleared. Provider/project configuration, backup restore proof, rate/monitoring configuration, and the retention/deletion decision remain launch gates. The Next.js security gate is clear on installed 16.3.3 as of August 25, 2026.
