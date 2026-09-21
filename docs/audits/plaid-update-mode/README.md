# Plaid Update Mode certification — September 21, 2026

## Release decision

**NO — do not mark “Build update mode” complete yet.**

The existing architecture was extended and the main Update Mode flows passed on public dedicated staging. Certification also found a real API MFA gap. Its correction passes locally against staging, but the final candidate still needs deployment and public security recertification. Automatic approval review rejected a second Vercel `--prod` deployment even after the project binding was verified. An explicit approval request for the dedicated staging primary slot is pending. No workaround deployment or indirect push was used.

Public staging: https://writeoffs-fresh-staging.vercel.app

Already deployed intermediate candidate: `https://writeoffs-fresh-staging-hkqeummay-ricks-projects-3ba59ab5.vercel.app`, deployment `dpl_6RQUqPtsmva5Ew66boZqvq7sBCdc`, dedicated project `prj_o56739F1pzd0TjFirEYoLMaa6oIJ` (`writeoffs-fresh-staging`). This is **not** the final release: MFA enforcement, final prompt cleanup, and Home read resilience are local changes awaiting deployment.

Main, real Production, Rick’s customer, `days_requested = 730`, historical coverage policy, and the Transactions Refresh policy were not changed. No `/transactions/refresh` call was made for this task.

## Existing architecture

- `/api/plaid/link-token` supports new Link and existing Item Update Mode.
- Server-side tenant lookup and encrypted credentials select the existing Item; Update Mode never exchanges a new public token.
- `updateModeLinkRequest` omits `products` and transaction-history options. It supplies the configured public webhook and redirect URI. Account selection is enabled only when `new_accounts_available` is set; ordinary credential repair does not change authorization options.
- `/api/plaid/sync` already targets one Item after Link completion.
- `/api/plaid/webhook` verifies Plaid’s ES256 signature, key, issued-at window, and exact body hash before persisting anything.
- The existing `plaid_webhook_events` inbox, Item sync lease, cursor, immutable revisions, and scheduled retry runner remain the ingestion/recovery mechanisms.

## Corrections

1. Persist a distinct `update_reason` on the existing Item. A successful transaction poll no longer erases pending expiration/disconnection notices.
2. Add Item attention versions. Link carries the starting version through OAuth resume; completion cannot erase a newer notice. Duplicate completion is safe.
3. Clear successful repair state transactionally, after provider account access is verified, without waiting for transaction/bookkeeping completion.
4. Schedule only that Item through the existing durable inbox as `INTERNAL / UPDATE_COMPLETED`. `LOGIN_REPAIRED` also schedules Item-specific sync. Existing cron retries both alongside transaction webhooks.
5. Preserve revoked consent and unrelated notices when a login-repaired notification arrives. Ignore signed notifications older than the latest completed repair/notice. Exact signed-delivery replay remains deduplicated.
6. Share plain-language attention mapping between Home and Bank connections: **Reconnect bank**, **Renew connection**, **Review accounts**. Home links to the affected connection. Refresh while an actionable prompt is visible; suspend refresh while Link is open.
7. Clear the visible prompt after successful completion with an explicit route refresh when already on the return page. Do not claim books are current merely because a bank connection succeeded.
8. Do not offer repeated credential repair for a generic sync issue or an account the customer is no longer sharing. Retain its history and show its disconnected account status separately.
9. **Security finding:** the old Link-token API accepted AAL1 despite the page MFA gate. All four customer Plaid APIs now require AAL2: link-token, exchange, sync, disconnect. The receiver remains provider-signature authenticated, not customer-MFA authenticated.
10. A large Sandbox fixture exposed Home’s oversized recent-record URL and a separate summary-query timeout. Bound recent reads through the existing canonical model, retain its 250-row window, and label unavailable financial/recent data explicitly so it cannot hide a bank-repair entry point. No financial calculations were changed. The larger report-query timeout is a separate performance issue, not certified as solved here.

## Launch Center matrix

| Requirement | Existing implementation | Correction | Real Sandbox evidence | Internal evidence | Result |
|---|---|---|---|---|---|
| 1. Activate entry point | Item errors and pending notices recorded; Settings had generic review | Durable reasons, Home entry point, Item-specific buttons | Genuine `reset_login` → signed ERROR; genuine PENDING_DISCONNECT | PENDING_EXPIRATION state, stale notice and version tests | Functional PASS; final security release pending |
| 2. Messaging and UI | Generic Settings status; no Home prompt | Shared calm copy, affected-connection link, explicit MFA, read-failure resilience | Public Home/Settings screenshots, actual Link launches | Shared copy tests, all four MFA guards, bounded Home read test | PARTIAL until final public deploy |
| 3. Dismiss prompts | Account flag cleared; login/error state depended on subsequent sync | Atomic completion, version guard, direct refresh, LOGIN_REPAIRED clearing and sync | Real login repair; renewal; external provider repair followed by genuine LOGIN_REPAIRED | Replay, concurrent newer notice, revoked/deleted/disconnected guards | Functional PASS; final UI/security release pending |
| 4. New accounts | Existing flag and account-selection request | Preserve existing flow; prevent generic re-repair loop after account authorization changes | Genuine NEW_ACCOUNTS_AVAILABLE → Link account selection → authorization → Item-specific sync, while bank B remains broken | Selection disabled for normal repair, ownership and replay tests | Functional PASS; final prompt/security release pending |

## Real provider/browser evidence

Fresh customer business: `10da165d-5854-40ad-8e8f-924067ab6d51`, isolated synthetic only, real onboarding and MFA. Items were created through actual public-staging Link using Plaid’s supported `user_custom` fixture. Credentials live only in private temporary files.

- Bank A: `76a9afbf-9872-4989-ac54-57662174bfe8`.
- Bank B: `2a327783-e9cd-4af5-ab69-30d19e47d6f8`.
- Real Sandbox tests used First Platypus Bank’s non-OAuth flow. OAuth resume/version handling was inspected; this is not a claim of live certification against every production institution or OAuth variant.

| Scenario | Evidence | Outcome |
|---|---|---|
| ITEM_LOGIN_REQUIRED | [reset and signed receipt](evidence/login-required.json), [browser repair](evidence/login-repair.json) | Prompt, Link, HTTP 200 completion, provider access restored, A sync resumed; B unchanged |
| PENDING_DISCONNECT | [signed notification](evidence/pending-disconnect.json), [browser renewal](evidence/disconnect-renewal.json) | Proactive renewal; completion clears reason and resumes A only |
| PENDING_EXPIRATION | [actual Sandbox rejection](evidence/expiration-sandbox-limitation.json) | `/sandbox/item/fire_webhook` returned HTTP 400 `INVALID_FIELD`; **not** claimed as a real provider-originated event |
| PENDING_EXPIRATION fallback | [internal condition](evidence/expiration-internal-condition.json), [real Link completion from that condition](evidence/expiration-browser-completion.json) | Shared canonical handler and real browser launch/completion passed; originating event is explicitly synthetic |
| LOGIN_REPAIRED | [provider repaired without app callback](evidence/external-provider-repair.json), [real webhook](evidence/login-repaired-webhook.json) | Old prompt remained until genuine webhook; then cleared and A sync finished; B untouched |
| NEW_ACCOUNTS_AVAILABLE | [signed notification and unchanged account set](evidence/new-accounts-webhook.json), [real selection/completion](evidence/new-accounts-completion.json) | Notification alone imported nothing. Customer authorization changed the provider’s shared account set. Only the newly authorized account is active; prior source mapping/history retained |
| B broken while A repaired | Same new-accounts completion proof | B remained login-required, version and last-sync time unchanged; A completed successfully |
| Transactions webhook after Update Mode | [real notification](evidence/transactions-webhook.json), [settled state](evidence/transactions-sync-after-update.json) | Cursor retained; zero pending deliveries; one authorized active account; four source versions |

The Sandbox new-account scenario replaced the set of accounts shared with WriteOffs. Historical source mappings remain; they are not additional active authorizations. A generic `needs_attention` flag from the no-longer-shared account is not a reason to force another credential-repair loop.

## Security and deterministic checks

- [Local route tests against staging identities](evidence/security-local-staging-db.json): foreign Item token HTTP 503; foreign repair HTTP 502; AAL1 HTTP 403 for all four customer APIs; unsigned webhook HTTP 401; direct credential-table read and service-only completion RPC denied. Item versions unchanged.
- **Those MFA results are local, not public-staging results.** The intermediate public candidate still returned HTTP 200 to the AAL1 Link-token test; the final correction has not yet been deployed.
- [Rollback-only database assertions](state-certification.sql): expiration/disconnect survive ordinary sync, duplicate completion, exact webhook replay, stale signed notice, stale completion after a newer notice, login repair and sync, different-Item isolation, pending deletion, disconnected Item.
- Existing Transactions rollback regression rerun successfully after the migration: initial cursor, modified source revisions, replay, quarantined malformed amount, removal, membership/deletion guards. [Execution result](evidence/transactions-rollback-regression.json); the SQL raises on any failed assertion and ended successfully with rollback.
- Webhook persistence uses issued-at from the already-verified JWT, overriding any body-supplied value. This does not invent a Plaid event sequence number: a newly signed, newly delivered notification is still treated as current evidence. Exact duplicates and older signed notices are covered.
- Provider errors/logging remain fixed-code/safe metadata only. No credentials in evidence files or browser responses. No access token or client secret was moved to client code.

## Screenshots reviewed

- [Home mobile renewal](evidence/home-renew-mobile.png)
- [Home desktop renewal](evidence/home-renew-desktop.png)
- [Bank connections mobile](evidence/banking-renew-mobile.png)
- [Bank connections desktop](evidence/banking-renew-desktop.png)

The notice is restrained and separate from the financial hero; it names the affected bank and provides one action. No broad Home or Settings redesign.

## Validation

- Full Vitest: **1,816 passed, 143 skipped** (251 passed files, 42 environment-gated files skipped).
- TypeScript: passed.
- Optimized local Webpack build: passed. The earlier intermediate staging candidate also passed Vercel’s default optimized build. Final Vercel build/public verification remain pending.
- Lint: 0 errors, 16 existing warnings; no new warnings.
- Production dependency audit: 0 vulnerabilities. Full dependency audit: 2 existing moderate development-tool advisories, 0 high/critical.
- Focused rollback tests and real Sandbox tests described above passed, except the explicitly documented unsupported expiration trigger and the discovered public AAL1 gap awaiting deployment.
- Secret scan: no leaks in the staged diff. `git diff --check`: passed. [Validation evidence](evidence/validation.json).

## Remaining release steps

1. Resolve automatic approval review’s dedicated-staging-primary-slot block (approval request already sent).
2. Push the locally committed, reviewed final candidate to `v2-onboarding-staging` as authorized; deploy only `writeoffs-fresh-staging`, main and real Production untouched.
3. Publicly rerun MFA/tenant checks, repair prompt dismissal, new-account authorization, and Home smoke against the final build.
4. Only after those pass, mark **“Build update mode”** complete in Plaid Launch Center. No additional Dashboard configuration change has been identified for these four capabilities.

## Official references

- [Plaid Update Mode](https://plaid.com/docs/link/update-mode/)
- [Plaid Sandbox test API](https://plaid.com/docs/api/sandbox/)
- [Plaid Item webhooks](https://plaid.com/docs/api/items/)

Plaid documents PENDING_EXPIRATION principally for expiring UK/EU consent and PENDING_DISCONNECT for US/Canada. WriteOffs preserves the required renewal entry point for either event; the current product remains US-focused.
