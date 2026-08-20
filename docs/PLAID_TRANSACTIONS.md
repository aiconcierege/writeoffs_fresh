# Plaid Transactions integration

## Scope and boundary

WriteOffs uses one provider-neutral bookkeeping path:

```text
Plaid Item -> financial account -> immutable financial transaction
           -> canonical bookkeeping record -> existing questions, receipts, tax treatment, and reporting
```

This integration requests only Plaid Transactions. It does not initialize Auth,
Balance, Identity, Investments, Liabilities, Income, Assets, Transfer, or money
movement. `/accounts/get` is used only for account identity metadata; returned
balances are neither persisted nor presented.

The implementation is deliberately gated by `PLAID_ENV=sandbox` and
`PLAID_SANDBOX_LINK_ENABLED=true`. Production Link must remain disabled until
the production checklist below is completed.

## Link and Item lifecycle

1. An authenticated route derives the Business from the signed-in user.
2. `/link/token/create` receives one stable hashed client-user identifier,
   country `US`, and product `transactions`.
3. The browser returns a short-lived `public_token` once. The server exchanges
   it with `/item/public_token/exchange`; the public token is never persisted.
4. A request UUID and public-token hash make completed exchange retries
   idempotent. A crash in the unavoidable external-API/database gap fails closed
   and requires Link to be restarted rather than guessing a credential.
5. The access token is encrypted with AES-256-GCM and a separately managed
   32-byte key before database storage. The base Item table has no authenticated
   grant. Narrow status RPCs omit the token, Plaid Item ID, cursor, and errors.
6. Update mode creates a Link token with the existing access token and no
   products array. A successful update-mode session does not exchange another
   public token.
7. Disconnect calls `/item/remove`, disables future sync, and preserves all
   historical canonical financial and bookkeeping evidence.

## Account mapping

Each selected Plaid checking, savings, or credit-card account maps to one
`financial_accounts` row. `plaid_account_sources` owns the provider identity.
Renames update customer-facing metadata without changing canonical identity.
Unsupported account types fail closed rather than being collapsed into a fake
account type. No account is assumed personal, and linking an Item does not make
Plaid enrichment an accounting conclusion.

New accounts reported by Plaid are shown as needing attention. Authorizing
additional accounts through Account Select update mode is intentionally a
follow-up; WriteOffs does not ingest an account that the customer did not select.

## Transaction sync and cursor atomicity

Initial sync starts without a cursor. Every page is fetched until `has_more` is
false, and no database changes are applied while pagination is incomplete. A
`TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` response restarts the full loop
from the originally persisted cursor. A bounded 100-page guard fails closed.

The database claims a ten-minute Item lease. One transaction then validates the
lease and expected cursor, maps account metadata, appends all provider events,
creates posted canonical source transactions and initial unresolved bookkeeping
records, and advances the cursor. A failure cannot advance the cursor without
the associated rows. Concurrent calls return busy; an expired lease can be
reclaimed.

Plaid positive amounts are outflows and negative amounts are inflows. The single
normalization boundary negates the value and validates exact cents, matching the
canonical convention of positive inflows and negative outflows.

The onboarding `catch_up_start_date` is applied after sync because
`/transactions/sync` does not accept a date range. Earlier provider revisions
retain provenance but do not create canonical financial activity.

## Pending, modified, and removed activity

`plaid_transaction_versions` is append-only. Its unsuperseded leaf represents
the provider's current state.

- Pending events retain provider evidence but do not create customer-visible
  canonical financial activity.
- A posted event, including one that names `pending_transaction_id`, creates the
  one current canonical event. The pending authorization remains history.
- Modified posted facts create a new immutable financial transaction and an
  unresolved canonical record. The old record and its decisions remain history
  but are suppressed from current Transactions, questions, and reporting.
- Removed events append a removal leaf. They suppress the prior provider version
  without deleting source facts, decisions, or evidence.

This is source supersession, not a bookkeeping correction. A provider change
never silently copies or rewrites a customer's decision.

## Webhooks and readiness

The webhook endpoint verifies the Plaid `Plaid-Verification` ES256 JWT using
`/webhook_verification_key/get`, enforces a five-minute age, and compares the
signed SHA-256 value against the exact raw request body. A delivery-signature
hash makes retries idempotent. Unknown Items return safely without tenant lookup
information.

`SYNC_UPDATES_AVAILABLE` is only a signal. It records initial/historical
readiness, sets `sync_requested_at`, and schedules the same cursor-based sync
after the response. An empty first sync initializes webhooks and remains
“Updating transactions…” until historical readiness is reported. Item errors,
pending consent expiration, new-account availability, and permission revocation
become provider-neutral health states. Raw codes stay server-side.

## Security and operations

- Customer routes authenticate first and derive the one Business from `auth.uid()`.
- Only the server service credential may read encrypted tokens or execute sync
  persistence functions. That credential is never sent to the browser.
- Item/account/version foreign keys include `business_id`; RLS scopes customer
  source-history reads.
- Logs may contain the internal Item-row UUID, event type, counts, duration, and
  sanitized error code. They must never contain access/public tokens, Plaid
  secrets, credentials, or full financial payloads.
- Raw provider storage is deliberately minimized to identity/correlation facts
  and selected enrichment evidence. Plaid categories are evidence only and do
  not establish Personal, a tax category, or deductibility.

Environment variables are documented in `.env.example`. Generate
`PLAID_TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded with base64 and manage it
through the deployment secret store. Key rotation requires an approved migration;
do not replace it while tokens encrypted with the prior key remain active.

## CSV, receipts, and Teller

CSV import remains independent and keeps its existing multiplicity and retry
guarantees. Plaid and CSV provenance are never merged solely by amount, date,
and merchant because that can produce false matches. A later reconciliation
milestone is required for reliable same-account correlation; customers should
avoid importing overlapping history meanwhile.

Plaid-created canonical transactions automatically use the existing strict
receipt matching, Transactions, Home, Reports, exports, questions, and tax-rule
paths. There is no provider-specific report or receipt algorithm.

Teller runtime remains retired. Historical Teller schema is retained only for
compatibility; there are no Teller endpoints, enrollment controls, or provider
logic in this path.

## Retention-policy preparation

Disconnect revokes provider access but does not destroy bookkeeping history.
Until written Information Security and Data Retention/Disposal policies are
approved, WriteOffs preserves encrypted Item metadata, minimized provider
revision history, webhook delivery metadata, canonical financial facts, and
bookkeeping decisions. A future deletion policy must distinguish revocable
provider credentials from records required for bookkeeping integrity and must
define log, webhook, raw-evidence, customer-deletion, and encryption-key rules.

## Sandbox validation

Normal automated tests use fixtures and mocked Plaid contracts. Local PostgreSQL
tests exercise token isolation, account mapping, append-only revisions, cursor
compare-and-swap, concurrency, current-state suppression, RLS, and disconnect.
Optional live Sandbox validation requires the environment variables above and
must use Plaid Sandbox users only. Use Sandbox endpoints to create an Item,
create transactions, fire `SYNC_UPDATES_AVAILABLE`, reset login, and exercise
update mode. Ordinary CI must not depend on Plaid network availability.

## Production validation checklist

- Obtain Plaid Production approval for Transactions only.
- Approve written Information Security and Data Retention/Disposal policies.
- Configure production client ID, secret, HTTPS webhook, OAuth redirect URI,
  allowed redirect URIs, Link customization, and Data Transparency Messaging.
- Provision and verify the production token-encryption key and backup/rotation plan.
- Remove the Sandbox-only product gate through a separately reviewed change;
  never reuse Sandbox secrets or Items.
- Validate signed webhooks from the public production URL.
- Link an explicitly authorized low-risk real test account; verify multiple
  accounts, initial/historical readiness, exact signs, pending-to-posted,
  modifications, removals, receipt matching, reporting, update mode, revocation,
  and `/item/remove`.
- Validate institutional OAuth, consent expiration, customer support copy,
  observability redaction, incident response, and customer deletion behavior.
- Confirm the CSV-overlap/reconciliation policy before importing overlapping
  history from a real account.

## Primary references

- Plaid Link API: https://plaid.com/docs/api/link/
- Transactions Sync API: https://plaid.com/docs/api/products/transactions/
- Sync migration and pagination guidance: https://plaid.com/docs/transactions/sync-migration/
- Webhook verification: https://plaid.com/docs/api/webhooks/webhook-verification/
- Link update mode: https://plaid.com/docs/link/update-mode/
- Item removal and permission revocation: https://plaid.com/docs/api/items/
