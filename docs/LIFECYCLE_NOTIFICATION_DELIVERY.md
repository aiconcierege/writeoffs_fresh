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
- `LIFECYCLE_EMAIL_MODE`: `sink` for controlled staging certification; `resend` for Production after approval.
- `LIFECYCLE_EMAIL_STAGING_RECIPIENTS`: staging-only allowlist.
- `LIFECYCLE_EMAIL_FROM` and `LIFECYCLE_EMAIL_REPLY_TO`: verified transactional identities.
- `RESEND_API_KEY`: server-only provider credential.

Staging and Production must use separate credentials/settings. Never use `NEXT_PUBLIC_` for these values.

## Rick/provider launch checklist

1. Verify the sending domain in Resend.
2. Publish the provider-supplied SPF and DKIM records.
3. Publish a DMARC policy (begin with monitored policy if advised by the domain administrator).
4. Confirm the From and Reply-To addresses and operational owner.
5. Add Production environment values only after explicit Production approval.
6. Configure signed Resend delivery/bounce/complaint webhooks before claiming full bounce/complaint automation.
7. Route open lifecycle operational alerts to the selected paging destination.
8. Send controlled deliverability checks to major mailbox providers and monitor rejection/complaint rates.
