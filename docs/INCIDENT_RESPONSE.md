# WriteOffs Incident Response

Status: launch runbook. Last reviewed: 2026-08-25.

This runbook is practical for a small operating team. Preserve evidence, protect tenants, and prefer disabling a risky mutation/provider over guessing.

## Severity

- **SEV-1:** suspected cross-tenant exposure, credential compromise with production access, active unauthorized financial/security changes, database loss/unavailability, or broad application outage.
- **SEV-2:** sustained Stripe webhook failure, queue/cron outage, provider outage affecting many customers, material data-integrity risk, or widespread authentication failure.
- **SEV-3:** isolated stuck/dead-letter job, one membership mismatch, one failed connection, or customer-specific access issue without exposure.
- **SEV-4:** nonurgent defect or operational follow-up with no current security/data risk.

## Initial response

1. Open an incident record with UTC time, reporter, affected surface, bounded identifiers, and current severity. Never paste secrets, tokens, raw statements/receipts, MFA codes, or full webhook payloads.
2. Assign an incident lead. Establish one evidence/decision log.
3. Determine scope: environment, tenants, time window, provider, read versus mutation, and ongoing versus contained.
4. Preserve Vercel/Supabase/provider logs and relevant immutable event/job history before rotating or changing state.
5. Contain the smallest surface. Examples: pause new expensive processing, disable Checkout/Plaid via explicit production flags, revoke a credential/session, or roll back the application. Do not weaken RLS or edit canonical records.
6. Escalate to providers and legal/privacy counsel when exposure, regulated data, notification duties, or payment/provider compromise may be involved.

## Containment playbooks

### Credential or webhook compromise

Disable the affected integration, rotate the secret in its provider and Vercel, redeploy, verify old credentials fail, inspect event/access logs, and replay only provider-authenticated idempotent events. Stripe signatures and Plaid webhook verification must remain enabled; never add a temporary unsigned bypass.

### Suspected tenant-data exposure

Treat as SEV-1. Stop the affected route/release, preserve query/request logs, identify affected Business IDs without broad data export, run RLS/isolation tests, and determine read/mutation scope. Do not notify conclusions until evidence is reviewed, but do not delay required legal/privacy escalation.

### Account takeover

Revoke sessions, guide password recovery, reset TOTP only after approved identity verification, preserve factor/session evidence, review recent membership/account-link/provider changes, and rotate connected-provider tokens when compromise is credible. Require MFA re-enrollment. Never ask for the customer's password or one-time code.

### Queue/OCR outage or cost spike

Set `DOCUMENT_EXPENSIVE_PROCESSING_ENABLED=false`; intake and queued evidence remain durable. Confirm cron, database, lease age, provider status, retries, and dead letters. Resume only after root cause and with backlog monitoring. Never delete jobs or invent financial results.

### Stripe outage or membership mismatch

Canonical membership remains authoritative. Do not grant access from a redirect or email. Preserve event IDs/status categories, confirm signature/event ordering, return retryable errors when persistence failed, and use the documented reconciliation procedure. Historical records remain available according to lifecycle state.

### Plaid outage

Do not repeatedly recreate Items or reset cursors. Preserve encrypted access tokens/source observations, show delayed/reconnect language, and resume idempotent sync. Statements and CSV remain the customer alternative.

### Supabase/database outage

Fail closed; never redirect to another project or use service role as customer fallback. Pause mutation-producing integrations where needed. Confirm provider status and recovery point. A restore is performed only into an isolated environment until incident leadership approves a production recovery.

## Recovery and validation

Restore services in priority order: authentication and tenant-safe historical reads; canonical database and private document linkage; membership/webhook state; ingestion; durable processing; optional financial-source providers. Run synthetic cross-tenant, canonical totals/current-record, membership, and queue checks before reopening mutations. Watch error rates and queue age through an observation window.

Application rollback normally leaves additive schema in place. Do not run broad DOWN migrations during an incident. If data has been written under new schema, forward-fix is generally safer.

## Communication

The incident lead decides customer/provider communication with legal/privacy input. State known impact, affected time, customer action, and next update without exposing another tenant, security details that aid exploitation, or unsupported assurances. Do not claim “no data exposure” until supported by evidence.

## Evidence and post-incident review

Preserve timestamps, releases, migration versions, provider event IDs, affected bounded IDs, configuration changes (names/status, not values), containment actions, and decision owners. Do not alter original logs.

Within the practical follow-up window, document root cause, detection gap, customer impact, timeline, recovery, invariant checks, and bounded preventive actions. Update this runbook and tests. Rotate temporary access and remove emergency configuration when safe.

## Support escalation triggers

Lost authenticator with uncertain identity, suspected compromise, any cross-tenant symptom, unexplained canonical duplicate/missing money, provider mapping to the wrong Business, inability to retrieve historical data, or deletion requests with legal holds become specialist/security cases. Ordinary unreadable documents and isolated payment failures remain support cases unless patterns indicate abuse/outage.
