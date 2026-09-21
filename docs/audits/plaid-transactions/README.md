# Plaid Transactions certification — 2026-09-21

**Latest completion pass:** [completion report](completion/README.md). The original partial-pass evidence below is retained as history.

## Verdict

**PARTIAL — do not mark Launch Center “Build product-specific core workflows” complete yet.**

The cent-accurate fresh Sandbox Item passed real Link, public-token exchange, initial sync, added/modified source revisions, persisted cursor, signed webhook and subsequent no-duplicate sync on public dedicated staging. The dynamic Transactions persona failed atomic ingestion because Plaid generated fractional-cent USD amounts. We did not change monetary precision, silently round records, enable Transactions Refresh or claim a real removed-event journey passed when only the database regression passed.

Public staging: https://writeoffs-fresh-staging.vercel.app

Webhook: https://writeoffs-fresh-staging.vercel.app/api/plaid/webhook

Deployment: `dpl_Fc6uGGMuZr2dUwjmeDkaWTM33bKo`, immutable URL https://writeoffs-fresh-staging-kgyl9l4z2-ricks-projects-3ba59ab5.vercel.app

Base commit: `5014662`. This pass's scoped changes remain uncommitted; no remote push, main change or real Production deployment occurred. Unapproved Betti assets were excluded from deployment.

## Historical policy and days_requested

**Current: 730. Recommended: retain 730. Unchanged.** See `app/lib/plaid/client.ts:newItemLinkRequest`.

- Normal customers: request the maximum useful bank history once; bookkeeping includes only authorized dates. Retrieved records do not grant historical commercial scope.
- Current-year books: the request covers more than a calendar year in principle, but institution availability is not guaranteed.
- Catch-up/prior years: maximize useful connected-bank evidence. Older supported dates remain valid and use uploaded statements/documents for unavailable periods.
- Future older books: initial lookback is not a permanent ceiling on retained history, and neither is it a WriteOffs year limit.
- Performance: larger history requests lengthen Plaid's historical retrieval and increase local processing/storage. Do not wait for the entire history to settle before using a complete available sync update. This Sandbox run does not establish real-institution 730-versus-90-day latency.
- Pricing: official Transactions billing is subscription-based. The published model does not charge per requested history day; optional Refresh is a separate product. **Account-specific commercial terms were not available/verified**, so this is not a contractual price guarantee. Sandbox and application compute costs are separate questions.

Sources: [Transactions/history and billing model](https://plaid.com/docs/transactions/), [pricing and billing](https://plaid.com/docs/account/billing/), [Transactions API](https://plaid.com/docs/api/products/transactions/).

### Scope is not availability

`validateOnboardingBusinessPatch` accepts a valid older start, including 2022-01-01 at a 2026-09-21 test date; no 730-day check is present. Authorized scope is determined by the customer's selected date and existing commercial authorization, not provider history. The work projection retains a 2022 authorized start despite only a 2026 transaction and reports unconfirmed coverage instead of zero activity. A validated 2022 statement closes that account's 2022 gap in the regression test.

Existing `knownSourceCoverage` currently recognizes validated statement periods. Mere presence of bank transactions and `historical_update_complete` are **not** proof of a complete account period. `booksCurrentThrough` remains null without canonical completeness evidence. The earliest retrieved transaction must not become a guaranteed coverage boundary.

**Customer-facing gap disclosure is PARTIAL:** the full projection exposes per-account `coverageGaps`, but no complete customer-facing period-gap list was found. Recommended presentation: requested bookkeeping period, evidence-confirmed periods, and specific unconfirmed periods with a Send statements action. Empty API responses must remain “coverage unconfirmed,” never “no activity.” Do not claim a complete bank-history coverage UI shipped in this certification.

## Requirements matrix

PASS means the cited evidence supports the stated level; unit/source inspection is not represented as a live provider test.

| Requirement | Implementation/evidence | Result | Correction / remaining work |
|---|---|---|---|
| Transactions product, public webhook, intentional history | `newItemLinkRequest`: Transactions, configured public webhook, 730; real Link metadata verified webhook | PASS | None; value unchanged |
| Public-token exchange | Real public staging Link + `/api/plaid/exchange` HTTP 200; server-only encrypted access token | PASS | None |
| Initial sync without cursor | Shared gateway; null DB cursor now explicitly becomes undefined; pagination unit test | PASS | Removed runtime null cast ambiguity |
| Per-Item cursor | Atomic RPC commits cursor with complete update; real Item has persisted cursor | PASS | None |
| Pagination until has_more=false | Up to 500/page; accumulates full update before apply; page failure returns no partial result | PASS (unit/source) | Live fixture fit one page; local multi-page DB suite is environment-gated |
| Mutation-during-pagination restart | Fault injection proves cursor calls original → abandoned → original → retry, discarded abandoned events; bounded retries | PASS | Added direct tests |
| Initial sync activates webhook | Fresh Item received real signed SYNC event and synced successfully | PASS | None |
| Initial/historical/subsequent SYNC updates | Existing flags persisted; fresh real initial delivery and later explicitly fired delivery processed; initial/historical flags true | PASS | Legacy INITIAL/HISTORICAL events are acknowledged, not used as sync triggers |
| Added transactions | Real custom persona: +$2,100 client payment and -$42.19 purchase each create canonical source | PASS | None |
| Modified transactions | Real provider generated a modified revision for each; same canonical IDs reused for identical normalized facts | PASS | Repeated-value revision bug fixed and separately tested |
| Removed transactions | SQL removed → restored → removed regression leaves removed leaf with no current canonical transaction | PARTIAL | Real provider removal through public ingestion not completed |
| Canonical propagation/no duplicates | Immutable sources, current-leaf readers, bookkeeping-record creation, action-index invalidation triggers; real webhook retry leaves 4 versions/2 canonical IDs | PASS for source state; PARTIAL for live downstream treatment | Database fault injection covers changing amounts; no fresh full guided bookkeeping lifecycle asserted |
| Prompt webhook receipt | Signed validation + durable inbox, `after()` schedules sync after response; receiver unit tests | PASS (implementation + live receipt) | Direct Plaid-to-receiver network response latency not measured |
| Retry/idempotency | Lease/cursor guards, durable inbox, bounded pagination retry; current-leaf equality | PASS | Fixed global historical-fingerprint suppression |
| Item tenancy | Business ownership checks/composite foreign keys; different synthetic tenant's public disconnect rejected and Item remains connected | PASS | See tenant proof |
| Token/secrets | Server-encrypted credentials; narrow customer RPCs; generic safe errors; signing verification tests; redacted secret scans | PASS | No token payloads in report |
| Disconnected/deleting customers | New SQL guard before claim and final apply; rolled-back deletion-during-fetch test; real synthetic disconnect HTTP 200 then empty claim | PASS | Closed pending-deletion gap |
| No Refresh dependency | No application `/transactions/refresh`/SDK Refresh calls; Sandbox create endpoint only in certification | PASS | Refresh not enabled or used |
| Fresh isolated end-to-end delta journey | Real Link/exchange/cursor/webhook/added/modified pass; dynamic Sandbox create produced subsequent added delta | PARTIAL | Dynamic fractional cents prevented complete canonical ingestion/removal certification |
| Useful initial results before history settles | Each complete available sync update commits without checking historical completion; later webhook imports more | PASS (architecture) | No real-bank timing guarantee; shared background bookkeeping queue is separate |
| Older bookkeeping independent of Plaid | New 2022 validation/projection/statement-gap regression | PASS (domain/unit) | Customer-facing coverage disclosure remains partial |

## Corrections

1. **Provider revision replay:** the old global `(Item, transaction, event type, fingerprint)` uniqueness skipped a legitimate return to an older value. A → B → A → B incorrectly ended at A. Compare only against the current leaf; preserve prior revisions. Keep Item row lock, expected cursor/lease and one-successor uniqueness. Add a lookup index replacing the removed global uniqueness index. A repeated current revision still creates no duplicate.
2. **Deletion safety:** `business_memberships` alone lacks the pending-deletion field supplied by the customer view. Add service-only `plaid_sync_business_allowed`, with membership-row lock, active/grace checks and open deletion-request check. Enforce before credential claim and final commit. A deletion scheduled after claim rejects commit without advancing cursor.
3. **Initial cursor:** normalize nullable stored cursor to undefined before calling the SDK.
4. Added pagination and historical-scope regression tests; no days_requested, bookkeeping rule, Refresh or customer UX change.

Migration `20261005000200_plaid_transactions_certification.sql` was first tested inside rollback, then applied only to dedicated staging. No data repair was performed.

## Real staging evidence

Fresh cent-accurate Item: `aa43d705-f34f-4788-9ece-30b14e77c700`.

Fresh dynamic Item: `e97c946e-468c-4f1a-af0c-2f697d780a2e` — disconnected through the real UI API after inspection; no further sync claim permitted.

Both belong to an existing explicitly synthetic customer; neither is Rick's manual customer or Production Item.

Post-deployment `/sandbox/item/fire_webhook`:

```json
{"webhook_code":"SYNC_UPDATES_AVAILABLE","webhook_type":"TRANSACTIONS","request_id":"dfa04cf25604d90","webhook_fired":true}
```

Receiver durable event `3e4648b1-da13-40c5-a44e-e5a43bb93545`: received 17:14:29.794 UTC, attempt 17:14:29.838, processed 17:14:30.877. This is ~1.08 seconds from durable receipt to completed sync, **not the HTTP response duration**. Cursor persists; connection active; initial/historical complete; 4 immutable versions referencing 2 canonical transactions. No new versions from repeated sync.

See [public staging proof](public-staging-sync.json), [cross-tenant proof](tenant-proof.json), [disconnect proof](disconnect-proof.json), [Sandbox-created delta](provider-delta.json).

### Dynamic Sandbox limitation

The real dynamic persona returned 155 added transactions, including 35 fractional-cent USD amounts (for example 48.2542). These are not floating-point noise around two decimal places. Existing normalization rejects them before the atomic apply; no cursor advances and no partial altered books are written. `/sandbox/transactions/create` succeeded and a bounded follow-up sync exposed one added transaction, without calling Refresh. It did not produce a removed event during this run.

We intentionally did not round, drop or silently mark malformed records processed. Remaining decision: obtain cent-accurate mutable/removable Sandbox data through Plaid's supported Sandbox facilities, or separately define a provenance-preserving handling policy for provider amounts that cannot be represented in canonical cents. Do not weaken money precision solely to make a Sandbox benchmark pass.

Official [Sandbox custom data](https://plaid.com/docs/sandbox/user-custom/) supports explicit cent-accurate fixtures. [Sandbox Transactions create](https://plaid.com/docs/api/sandbox/#sandboxtransactionscreate) is separate from Transactions Refresh.

## Validation

- Full Vitest: **1,786 passed, 143 skipped** (environment-gated integration suites). No skipped suite is claimed as live evidence.
- Focused pre-final-additions run: 168 passed, 7 skipped; full run includes the six new pagination/history cases.
- TypeScript: pass.
- ESLint: 0 errors; 16 existing warnings.
- Local default Turbopack build: environment denied a subprocess port bind; same failure persisted with escalation. Optimized local webpack build passed.
- Dedicated staging default Turbopack build: passed, including TypeScript; build output completed in 20s.
- Production dependency audit: 0 known vulnerabilities. Full dependency audit: 2 existing moderate development-only findings (`vitest`, `@vitest/mocker`); dependencies unchanged.
- Targeted redacted secret scans: no findings.
- SQL rollback regression: repeated changes, duplicate current replay, repeated removal/restoration, deletion between claim/commit, no cursor advancement after rejection, blocked subsequent claim — pass before and after staging migration.
- Real authenticated browser flow included MFA. Cross-tenant and disconnect tests used only synthetic customers.

## Remaining Launch Center action

**Do not check “Build product-specific core workflows” complete yet.** Finish the real removed-event ingestion case and resolve the malformed dynamic data limitation first. Plaid Dashboard → Developers → Sandbox/Sandbox Studio is the supported place to prepare a cent-accurate mutable fixture; if its available controls cannot generate the necessary removal, obtain Plaid's recommended test route rather than enabling Refresh as a workaround. No Dashboard changes were made.

Existing production activation remains a separate explicit approval. This certification does not turn Production on.
