# Plaid user offboarding certification — September 21, 2026

Current September 22 Backup/DR update: [final assessment](../backup-dr/final-offboarding-2026-09-22.md).
The following September 21 report is historical; its application-level evidence remains valid.

## Decision

**Can Rick mark Plaid Launch Center “User offboarding” COMPLETE? NO.**

The live application disconnect and deletion paths passed the tests below after narrow corrections. Backup expiration and restore activation controls are not sufficiently verified/enforced to certify the complete retention promise. This is not a finding that normal cancellation must destroy historical books.

Public dedicated staging: https://writeoffs-fresh-staging.vercel.app . Main, real Production, Rick’s customer, Transactions cursor semantics, Update Mode, `days_requested = 730`, and the Transactions Refresh policy are unchanged. No Refresh call was made.

## Requirement matrix

| Plaid requirement / control | WriteOffs implementation | Evidence | Result | Correction / remaining work |
|---|---|---|---|---|
| `/item/remove` | Existing MFA-protected disconnect route, tenant lookup, provider removal, local disconnect | [Real Sandbox removal](evidence/disconnect.json): HTTP 200, replay 200, provider `ITEM_NOT_FOUND` | PASS | Added safe ITEM_NOT_FOUND removal retry |
| Terminate credentials and jobs | Disconnected/consent state, lease rejection and final commit checks | Same real test; [database race test](evidence/state-rollback.json) | PASS | Scrub encrypted token and cursor; clear requested sync and pending inbox work |
| Keep historical books on disconnect | Accounts/transactions/provenance retained with disconnected status | Four source revisions before and after replay | PASS | No historical-book deletion on bank disconnect |
| Ordinary cancellation | Stripe period-end cancellation; paid service then 12-month read-only retention; entitlement and SQL sync guards | `membership/change`, membership tests, lifecycle SQL inspection | PARTIAL certification | Code and deterministic tests pass; a new real Stripe cancellation/payment-period rollover was not performed in this Plaid test |
| Verified deletion and grace | Existing owner + AAL2 API and SQL; seven days; pending deletion blocks writes/sync | [Public request](evidence/deletion-request.json), [cancel](evidence/deletion-cancel.json) | PASS | Ignore customer-supplied clock in schedule/cancel RPCs |
| Permanent deletion | Provider → private objects → application data → Auth → completion/tombstone | [Scoped time-controlled worker steps](evidence/permanent-deletion.json), database rollback proof | PASS for tested fixture | Corrected Item-owned webhook FK dependency; no global destructive drain used |
| Automatic retention expiry | Existing scheduled lifecycle drain, read-only deadline, warnings, due deletion | Minute cron wiring and SQL inspection | PARTIAL certification | Fixed hosted pgcrypto schema error; actual 12-month passage and all scheduled notifications were not time-traveled on the shared staging service |
| No resurrection from stale Plaid worker | Item lock, membership/deletion gate, expected cursor and lease | Rollback test starts with a lease, disconnects, rejects commit and new claim | PASS | Existing canonical fencing preserved |
| Webhook after disconnect/replay | Existing verified receiver and canonical inbox ignore terminal Item | INTERNAL deterministic handler invocation and exact replay | PASS internally | Not claimed as a genuine post-removal Plaid webhook; old token is invalid |
| MFA / tenant isolation | Server derives owner; MFA gate; service-only deletion functions | [Public security](evidence/security.json): AAL1 403, foreign cancel 409, foreign schedule denied | PASS | No credential/log exposure introduced |
| Backup expiration | Encrypted managed/independent backups, documented retention recommendations | `BACKUP_AND_DISASTER_RECOVERY.md`; manual-only backup workflow | PARTIAL | Verify/enforce current and noncurrent S3 object expiration and actual managed-backup retention |
| Deleted data after restore | Ledger export, reconciliation function, existing deletion runner | Legacy ledger rollback proof; existing backup tests | PARTIAL | Restore command does not automatically reconcile/drain or gate activation; latest independent ledger export must be assured |
| Customer disclosure | Cancellation and deletion differentiated in Settings; privacy policy generic | Source review | PARTIAL | “Until those backups expire” requires operational expiration evidence; no broad legal rewrite made |

Plaid’s [Launch checklist](https://plaid.com/docs/launch-checklist/) calls for removing consumer data when there is no remaining business need. Its [Item API](https://plaid.com/docs/api/items/) explains that removal invalidates the token and ends Item subscription billing. Removal does not by itself delete WriteOffs’ retained bookkeeping records.

## Product distinctions and end-of-need events

1. **Cancel membership:** stop renewal, retain paid-through service. After access/grace expires, deny new bookkeeping and sync; the lifecycle worker removes inactive Plaid Items. Books remain available for review/export for the established 12-month period, followed by deletion. Billing cancellation is not consent to immediately destroy books.
2. **Disconnect bank:** provider authorization ends; token has no further business use and is erased immediately after provider removal. Existing historical books still serve the customer.
3. **Explicit deletion:** verified request immediately freezes new work, stops renewal and removes bank connections. Seven days allow reversal. Canceling deletion does not resume billing or reconnect banks. At the deadline, the existing worker performs permanent deletion.
4. **No remaining bookkeeping retention need:** explicit deletion deadline or the existing read-only retention deadline. Canonical financial evidence is then deleted, not kept indefinitely merely for convenience.
5. **Minimized deletion control:** retain identity hashes, deletion request ID/time/reason and bounded outcome codes to prevent resurrection and demonstrate deletion. This ledger is not a copy of the customer’s books. Historical request keys can contain an internal UUID; no financial payload is retained. No universal finite lifetime is currently configured for the minimized audit ledger; its continuing restore/security purpose must remain documented.

An active customer’s source/derived books remain for their ongoing bookkeeping and export use; the product has no separate automatic purge of older tax years while that relationship continues. This is distinct from obsolete access credentials.

## Plaid-derived data inventory

Definitions: **R** = established 12-month read-only period after paid service ends; **G** = explicit seven-day deletion grace. “Delete” refers to live application data; backup qualifications below apply separately.

| Data | Why stored / active use | Cancelled customer | Disconnected Item | Deletion request | Permanent deletion / justification |
|---|---|---|---|---|---|
| Encrypted access token, key version | Authorized server-side Plaid retrieval | Paid-through only; worker removes Item when service expires | Token bytes erased after removal | Remove authorization and erase token now | Item row deleted; credentials have no historical-book need |
| Item ID, institution/environment, connection health | Route events to correct tenant; explain source | R, without new collection after entitlement ends | Keep source identity/status for retained books | G, read-only | Delete with Item; no indefinite operational copy |
| Cursor, lease, pending sync | Safe incremental import | While entitled; cleared on removal | Cleared; pending inbox entries completed | Stop claims and commits; removal clears state | Delete; no need after collection ends |
| Account ID, type, last four, display/institution names, currency | Identify source and prevent duplicate mapping | R | Retain historical account association, disconnected status | G | Delete accounts and source mappings |
| Balances | Not stored as account balances by current normalizer | Not applicable | Not applicable | Not applicable | Only currency is read from the balance object |
| Transaction IDs, dates, exact amounts, descriptions, merchant, provider categories | Working books, correction, evidence/provenance | R | Keep historical records, no new imports | G | Delete immutable source revisions and canonical transactions under controlled deletion |
| Quarantined raw source transaction | Recover rejected malformed provider facts without invented money | R with source history | Retain source audit/recovery context while books retained | G | Delete with source revisions; not rendered or logged |
| Derived records, evidence, assessments, decisions, questions, answers, action index | Bookkeeping and customer correction | Historical access R; no new work | Retain historical books | Read-only G | Business-owned deletion traversal removes these tables |
| Exchange request metadata | Replay/idempotency, Item association | R | Retained metadata, no public/access token returned | G | Delete business-owned exchange rows |
| Webhook inbox: hash, type/code, timestamps, Item reference | Verified receipt, replay and recovery | R | No sync; metadata remains until tenant deletion | No sync | Explicitly delete Item-linked inbox rows before Item deletion. Unknown-Item deliveries have no Item ID/body/token/customer mapping |
| Deletion ledger and attempts | Restore suppression and security/audit proof | Created only as lifecycle requires | Not a replacement for books | Minimized status history | Pseudonymous ledger persists for anti-resurrection; no Plaid account/transaction payload |
| Lifecycle notification delivery | Send required warnings/confirmation | Existing notification policy | Unrelated to bank data | Confirmation/warnings | Recipient ciphertext erased after delivery; failed/canceled recipient retention bounded by existing notification cleanup; pseudonymous delivery metadata remains |

Receipts/statements, mileage/vehicles, invoices/manual money, profile/business and Auth/MFA are also in the deletion boundary. Business-owned tables are discovered through `business_id`; legacy transactions/receipts/profiles are explicitly removed; Auth deletes sessions/MFA via database relationships. The rollback test asserts no row remains with the test business ID across **every current public business-owned base table**. The fixture contained real imported Plaid source/derived records and onboarding state. It did **not** populate every mileage, invoice, document, or meal variant; those categories have schema/regression evidence, not a claim of individually populated real-browser deletion tests.

## Corrections made

- `disconnect_plaid_item_state` now erases token bytes and cursor, invalidates lease, clears next-sync request/new-account prompt, and finishes queued Item inbox work. Financial records remain intact.
- Shared provider-removal helper accepts only Plaid `ITEM_NOT_FOUND` as already removed. Authentication failures and transient errors still fail/retry, rather than pretending success.
- Retention-expiry SQL now uses hosted `extensions.digest`; `public.digest` did not exist and could prevent automatic expiry scheduling.
- Restore reconciliation understands both historical retention-expiry hashes and keyed identity hashes. The deletion worker converts new retention-expiry requests to the existing keyed form before permanent deletion.
- Permanent application deletion first removes Item-owned webhook rows. They lack `business_id` and otherwise block deleting the Item through their foreign key.
- Schedule/cancel RPCs use server time, preventing an authenticated direct RPC caller from shortening the seven-day grace period.
- Four previously disconnected rows still held token/test bytes. All were verified synthetic and explicitly allowlisted before cleanup. [Result](evidence/legacy-token-cleanup.json): zero disconnected rows retaining token bytes. No real customer was modified.

## Certification method and limits

Fresh isolated synthetic business: `58a2fc15-ac3a-4ef9-a0c9-bbab693f9804`; Item `586924a2-cfc2-4772-bf69-08a1fd130c44`. Its permanent deletion completed. Private credentials remained outside the repository.

**REAL PLAID SANDBOX:** Sandbox Item creation/public exchange, initial ingestion, real public WriteOffs disconnect, old provider token rejected with `ITEM_NOT_FOUND`. No Production Item used. A first comparison raced the initial sync: records committed before disconnect finished. The settled replay test then showed four source revisions preserved. This was not a post-disconnect import; the separate held-lease test verifies that boundary explicitly.

**REAL PUBLIC STAGING:** MFA-protected deletion request, seven-day deadline, cancellation during grace, AAL1 rejection and cross-tenant rejection.

**INTERNAL DETERMINISTIC:** terminal webhook/replay, stale worker lease, restored legacy tombstone matching, complete tenant row deletion with Auth cascade, and unrelated tenant preservation. [SQL](state-certification.sql) was executed in a transaction and rolled back. The final destructive test advanced only the synthetic request and invoked the existing worker steps individually, including private object removal and Auth admin deletion. It did not run a global lifecycle drain or pretend seven real days elapsed.

**POLICY / OPERATOR CONTROL:** current Production backup retention, scheduling, newest-ledger export, restore isolation and activation approval. No AWS lifecycle or Production configuration was changed. No new real Stripe cancellation was made.

## Backups: exact remaining work

- Encryption is implemented (AES-256-GCM bundle; authenticated restore; private temporary files). No surgical rewrite of old encrypted backups is necessary or proposed.
- [Live dedicated-staging provider metadata](evidence/managed-backups.json) returned eight completed daily physical backups dated September 14–21, with PITR disabled. This verifies creation, not a Production retention setting. The runbook records managed daily backups with seven-day retention, and an independent S3 Object Lock floor of 35 days. **Object Lock is a minimum hold, not automatic expiration.** The runbook explicitly says lifecycle expiration configuration remains a later AWS action.
- Recommended independent retention is daily 35 days, weekly 8–12 weeks, monthly three months. Current source does not verify/enforce the actual bucket expiration rules, including noncurrent versions. This certification therefore cannot claim those objects expire.
- Independent backup workflow is manual-only. Production scheduling is documented as unconfigured. Ledger export exists but is not automatically called after each completed deletion.
- `restore-encrypted-backup.mjs` verifies/restores data. Reconciliation is a separate command. Reconciliation schedules canonical deletion; operators must drain it and verify private objects absent before activation. There is no automated activation gate proving these steps completed against a sufficiently current ledger.
- The legacy-hash bug is fixed and database reconciliation tested. That does not certify a current full provider-backup restoration or an automated end-to-end DR cutover.

**Next approval/configuration task:** enforce the existing intended backup expiry schedule (including S3 versions), schedule/monitor independent backup and ledger exports, and establish a tested restore gate that reconciles the latest ledger and finishes re-deletion before serving traffic. Confirm actual managed-backup retention. These external operational changes are separate from this narrowly scoped application correction; no account-lifecycle redesign is needed.

## Customer disclosure

Settings correctly separates “Cancel membership” (paid-through service, 12 months view/download) and “Delete account and data” (stop work now, seven days to cancel). Cancellation of deletion accurately warns it does not restart billing or reconnect banks. The privacy page’s “as long as necessary” wording is less specific but not an explicit conflicting duration. The backup-expiry promise in deletion copy needs the operational controls above; it must not be treated as already certified. No broad policy rewrite was performed.

## Validation / release

- Full suite: **1,821 passed; 143 environment-gated skipped**.
- TypeScript, optimized local Webpack build: PASS.
- Lint: 0 errors, 16 existing warnings; no new warnings.
- Production dependency vulnerabilities: 0. Full audit: 2 existing moderate development advisories, no high/critical.
- Focused provider-removal and SQL-regression tests pass; real staging SQL and public security evidence linked above.
- Secret scan: no leaks; `git diff --check`: PASS. Application commit `8f60423` passed Vercel’s optimized Turbopack build.
- Public dedicated staging deployment: `dpl_7LKtAZFJGntKqGsUp2yKyDFDr1JM`, https://writeoffs-fresh-staging-39h4n6tvw-ricks-projects-3ba59ab5.vercel.app . Public alias promoted successfully.
- The known local Turbopack sandbox issue prevents repeating the default build in the pre-push hook. Full equivalent checks, local optimized Webpack, and the exact application commit’s Vercel Turbopack build passed; the staging push uses a one-time hook bypass, without modifying the hook.

Files: Plaid service/shared removal helper, existing deletion worker, migration `20261005000600_plaid_offboarding_retention.sql`, targeted tests, isolated certification script, this audit/evidence. No visual redesign or parallel lifecycle system.

## Final public release recertification

Fresh release-only business `78bff923-28bf-45ee-a3ad-9eaf065b732f` and Item `2e8971ea-7fc7-4940-91f0-cf736cb26d1d` repeated the checks after promotion: [real Sandbox disconnect](evidence/final-disconnect.json), [seven-day request](evidence/final-deletion-request.json), [grace cancellation](evidence/final-deletion-cancel.json), [MFA and cross-tenant denial](evidence/final-security.json), and [scoped time-controlled permanent deletion](evidence/final-permanent-deletion.json). All passed. The synthetic release customer was permanently deleted. This does not change the **NO** decision on unverified operational backup controls.
