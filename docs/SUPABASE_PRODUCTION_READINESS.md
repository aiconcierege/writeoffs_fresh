# Supabase Production Readiness

Status: decision packet; no Production settings verified or changed. Reviewed 2026-09-09.

## Architecture and launch recommendation

WriteOffs uses a dedicated Supabase project per remote environment. PostgreSQL holds
Supabase Auth identity/linkage, Business ownership, provider-neutral financial accounts,
immutable transaction/bookkeeping/evidence/correction history, queues, mileage, invoices,
memberships, and Storage metadata. The private `receipts` bucket holds receipts and bank/
card statements. Browser/server access uses the HTTPS Data API and Supabase SSR sessions;
trusted workers/provider webhooks use a server-only service-role client after explicit
ownership/provider validation. Vercel, not Supabase Edge Functions or database cron, runs
the application and one-minute queue drain.

**Recommendation: Supabase Pro with Micro compute for the first 25–100 customers, plus
the seven-day PITR add-on at launch.** Pro is the minimum sensible tier: no inactivity
pause, seven days of daily database backups, organization MFA enforcement, seven-day
API/database logs, support, and materially larger database/Storage/bandwidth allowances.
Micro is sufficient initially because runtime traffic primarily uses the Data API and
the workload is bounded/idempotent. Review CPU, memory, direct/pooler connections, query
latency, database size, Storage, and egress weekly; resize based on measured pressure.

Team is optional, not a launch requirement, unless Rick requires 28-day logs, platform
audit logs, project-scoped/read-only dashboard roles, priority support, or the associated
compliance features. Network restrictions are desirable, but must be designed around
Vercel/serverless egress and operator/backup connectivity; do not enable an allowlist that
breaks runtime or recovery.

## Capacity sanity check

Planning envelope (not a quota): 100 customers × roughly 2,000–5,000 annual transactions,
20–80 monthly receipts, and frequent immutable history events remains a modest Postgres
workload. If receipts average 1–3 MiB, 100 customers at 80/month is roughly 8–24 GiB of
new objects monthly at that upper bound. Storage and egress—not row count—are therefore
the first likely cost drivers. Enforce existing upload bounds, retain compact list queries,
and alert on growth. Confirm current Supabase quotas/pricing in the dashboard before launch.

## Repository-verified controls

- `config/environment-safety.js` binds remote public/server Supabase URLs to the expected
  host and requires HTTPS application identity, mandatory app MFA, and explicit provider modes.
- Supabase SSR refreshes authenticated cookies; protected routes derive the user from
  `auth.getUser()`. TOTP AAL2 is required by configured policy. Service role is server-only.
- Business-owned tables/views use RLS policies. Security and database-backed suites test
  cross-tenant access. The receipt bucket is created private; object policies restrict
  receipt/statement path ownership and membership-qualified uploads.
- Receipt viewing uses authenticated or short-lived signed access; list retrieval does
  not eagerly generate signed URLs.
- Schema is migration-controlled. No application dependency on Supabase Edge Functions,
  hosted database cron, Realtime business logic, or image transformation was found.

## Rick's Production dashboard checklist

These are **unverified** until checked in the Production dashboard:

1. Create/use the dedicated Production project in the chosen U.S. region; record region
   and project owner(s). Require organization MFA and at least two recoverable owners.
2. Select Pro/Micro, keep spend cap initially, verify connection limits/pooler settings,
   and configure capacity alerts. Use direct SSL connection for migrations/backup; runtime
   can continue through the HTTPS Data API.
3. Enable Postgres SSL enforcement (expect a brief database restart). Review certificate
   verification for every direct backup/migration client.
4. Confirm daily backups are succeeding and retained seven days. Approve and enable
   seven-day PITR. Record the first recoverable point and test clone/restore permissions.
5. Confirm Production Site URL and exact redirect allowlist; enable TOTP, email confirmation,
   secure password changes, suitable Auth rate limits/CAPTCHA, and approved custom SMTP.
6. Confirm the `receipts` bucket is private, file limits/types, RLS policies, signed-URL
   expiry, S3 bulk-export access, and orphan monitoring. Never make the bucket public.
7. Review every exposed schema/table in Security Advisor; run migration/RLS tests against
   Production-shaped staging before launch. Confirm no service key is client-exposed.
8. Review API keys and rotate any bootstrap credentials after setup. Limit dashboard,
   database, S3, and personal-access-token holders; record access-review owner/cadence.
9. Confirm seven-day logs, Auth audit logs, alert destinations, database/storage metrics,
   log redaction, and whether paid Log Drain or Team audit logs are required.
10. Record backup destination/key custodians, schedule the independent bundle, and complete
    a provider-hosted isolated restore before customer launch.

## Capacity, monitoring, and dependencies

Minimum alerts: database/API availability and 5xx; connection/CPU/memory/disk pressure;
slow queries; database and Storage growth/egress; Auth error spikes; private-object failures;
managed/independent backup failure or staleness; restore-job failure; Plaid sync/webhooks;
and bookkeeping queue age/retry/dead-letter/stuck lease. Existing bounded queue health and
diagnostic classifications are present; provider alert routing and backup job monitoring
remain configuration work.

Supabase-dependent Plaid answers may truthfully state that application RLS, private-bucket
policies, environment binding, and isolated local recovery are verified. They may not yet
state that Production daily backup/PITR, SSL enforcement, region, organization MFA, log
retention, custom SMTP, or off-provider recovery are enabled.

## Retention/deletion handoff

Data spans Auth users/sessions/factors; Business/profile/membership; Plaid encrypted tokens,
Items/accounts/versions; canonical financial records and immutable bookkeeping/evidence/
correction histories; questions/deferrals; receipts/statements and Storage metadata/objects;
mileage/vehicles; invoices/manual money; contractor awareness; and operational queue/events.

Disconnecting Plaid revokes/removes ongoing provider access state but does not equal deletion
of historical books. Subscription expiry is read-only access, not deletion. No complete
self-service deletion workflow exists. Rick/legal must decide retention by data class,
customer export/access period, tax-record hold, fraud/security exceptions, backup expiry,
receipt deletion, legal hold, and verified-request process. The next phase must implement
an auditable workflow that cancels providers/billing, observes holds, deletes or anonymizes
eligible database data and private objects, and records completion without rewriting retained
canonical history contrary to policy.
