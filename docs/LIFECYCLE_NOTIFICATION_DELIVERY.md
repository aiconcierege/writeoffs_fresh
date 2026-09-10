# Lifecycle notification delivery

This document implements the lifecycle policy in `MEMBERSHIP_ARCHITECTURE.md`; it does not redefine it.

## Delivery model

Lifecycle transitions first create durable semantic intents. A separate service-only worker materializes those intents into `lifecycle_notification_outbox`, claims them with a two-minute lease, renders both plain-text and restrained HTML, and records provider acceptance. `semantic_key` is unique and is also sent as the provider idempotency key. Repeated lifecycle and delivery drains therefore do not create a second notice.

The current provider adapter is Resend because the repository already uses Resend for waitlist transactional mail. `LIFECYCLE_EMAIL_MODE=sink` is restricted to staging and an explicit recipient allowlist. `disabled` fails closed. Production delivery requires `resend`, a verified sender, and completed DNS/provider setup.

The outbox has no customer-data foreign key. This lets a pre-enqueued completion notice survive Business and Auth removal. Its only direct contact field is an AES-256-GCM encrypted recipient. The recipient is cleared immediately after provider acceptance and retained for no more than 30 days after a terminal failure. Audit records contain only safe codes and provider-message fingerprints; operational alerts use pseudonymous hashes and never include books or financial details.

## Notices and timing

- `read_only_started`: queued when active service transitions to read-only.
- `retention_30_days`: scheduled 30 days before automatic deletion.
- `retention_7_days`: scheduled 7 days before automatic deletion.
- `explicit_deletion_scheduled`: queued after the verified request.
- `explicit_deletion_canceled`: queued after verified cancellation; it does not imply billing or Plaid restarted.
- `deletion_completed`: encrypted recipient is staged before Auth removal, but delivery is not activated until canonical deletion completes.

A missed warning is delivered when the drain returns if it is still relevant. Customer-owned retention events disappear with permanent deletion, so obsolete warnings cannot be materialized after completion. Internal scheduling is UTC; display uses the canonical Business IANA timezone when available and falls back to UTC.

## Retry and operations

Network failures, rate limits, and provider 5xx responses retry with exponential backoff capped at one hour. Invalid recipients and provider configuration errors terminate immediately. Other transient failures terminate after six attempts. Expired leases are reclaimable. Provider acceptance—not request initiation—is the delivered boundary.

Durable operational alerts are created for terminal notification failures, delivery retry state older than one hour, deletion retry state older than one hour, and lifecycle drain failure. Tombstone-reconciliation tooling must create `tombstone_reconciliation_failed` alerts when external scheduling is added. An external paging destination remains an operator configuration dependency; the database alert ledger is the canonical source until then.

## Required configuration

- `APP_ORIGIN`: environment-specific HTTPS application origin.
- `LIFECYCLE_NOTIFICATION_ENCRYPTION_KEY`: base64-encoded 32-byte server-only key, stored in the environment secret manager.
- `LIFECYCLE_EMAIL_MODE`: `sink` for local/staging certification; `resend` for controlled staging or Production after approval. Every staging delivery remains subject to the staging recipient allowlist.
- `LIFECYCLE_EMAIL_STAGING_RECIPIENTS`: staging-only allowlist.
- `LIFECYCLE_EMAIL_FROM` and `LIFECYCLE_EMAIL_REPLY_TO`: verified transactional identities.
- `RESEND_WEBHOOK_SECRET`: endpoint-specific Resend signing secret for `/api/resend/webhook`. The endpoint verifies the raw payload and Svix headers, rejects messages older than five minutes, and records a hash of `svix-id` for idempotency.
- `RESEND_API_KEY`: server-only provider credential.

Staging and Production must use separate credentials/settings. Never use `NEXT_PUBLIC_` for these values.

## Rick/provider launch checklist

1. Verify the sending domain in Resend.
2. Publish the provider-supplied SPF and DKIM records.
3. Publish a DMARC policy (begin with monitored policy if advised by the domain administrator).
4. Confirm the From and Reply-To addresses and operational owner.
5. Add Production environment values only after explicit Production approval.
6. In each Resend environment, configure `/api/resend/webhook` for `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`; store its signing secret only in that environment. Provider events are immutable and contain no recipient, subject, or message body.
7. Route open lifecycle operational alerts to the selected paging destination.
8. Send controlled deliverability checks to major mailbox providers and monitor rejection/complaint rates.

## Operational alerts

Critical rows in `lifecycle_operational_alerts` are the source of truth. The lifecycle drain creates a separate encrypted delivery intent for `support@writeoffs.io`; customer-notification state is never reused or overwritten. Staging sends as `WriteOffs Operations <notifications@writeoffs.io>`, replies to `support@writeoffs.io`, and remains constrained by the staging recipient allowlist.

The dedupe window is one UTC hour per alert. Repeated occurrences continue incrementing the internal incident record, while at most one external message is created for that alert in the hour. Delivery uses a two-minute lease, exponential backoff, and at most six attempts. Permanent provider rejection ends the delivery attempt without resolving the underlying alert and without creating a recursive alert-about-alert loop. Signed Resend delivery, bounce, complaint, failure, delay, and suppression events update the external delivery row.

Inspect `lifecycle_operational_alerts` for open incidents and `operational_alert_delivery_outbox` grouped by `status` for pending, retryable, terminal, and delivered external mail. If external delivery itself fails, inspect its safe failure code in the database and use the Resend dashboard/provider logs; do not include customer financial content in manual escalation.
