# Plaid Production security diligence packet

Status: draft for Rick, security, and legal review. Prepared 2026-09-09. This
document does not authorize Production access, a Plaid submission, or legal claims.

## Answer labels

- **Verified in code/config** — directly evidenced in this repository.
- **Verified managed-provider capability** — supported by current official provider documentation; dashboard enablement may still need confirmation.
- **Documented policy** — an internal runbook says this is required; organizational execution still needs Rick.
- **Gap** — not implemented, configured, approved, or proven.
- **Needs Rick** — company, legal, staffing, commercial, or provider-console fact not determinable from code.

## System and data-flow summary

Plaid Link runs in the authenticated browser. WriteOffs creates Link tokens on the
server, exchanges the one-time public token on the server, encrypts the resulting
access token using AES-256-GCM, and stores the ciphertext in Supabase. Plaid Items
map to provider-neutral financial accounts, then append-only Plaid transaction
versions and canonical financial transactions. Webhook signals enter the same
leased, idempotent synchronization path. The customer browser never receives a
Plaid secret or access token.

WriteOffs requests **Transactions only**, for U.S. checking, savings, and credit
card accounts, with up to 730 days requested. `/accounts/get` supplies account
identity; returned balances are not persisted. It does not request Auth, Identity,
Income, Investments, Liabilities, Assets, Transfer, or payment initiation.

Evidence: `app/lib/plaid/client.ts`, `service.ts`, `normalize.ts`,
`token-crypto.ts`, and migration `20260819001000_add_plaid_transactions_ingestion.sql`.

## Draft questionnaire answers

| Topic | Draft truthful answer | Status / evidence |
| --- | --- | --- |
| Company/product | AI Concierge Inc. d/b/a WriteOffs.io provides bookkeeping support for U.S. Schedule C solopreneurs; it does not move money or file tax returns. | **Verified in code/config** for product boundary (`docs/WORKFLOW_SPECIFICATION.md`); **Needs Rick** for legal/company details. |
| Plaid data and purpose | Transactions and limited account/institution metadata are used to import read-only financial activity for bookkeeping, receipt matching, questions, and reports. | **Verified in code/config** (`client.ts`, `normalize.ts`). |
| Data minimization | Only Transactions is initialized; supported accounts are checking, savings, and credit cards. Balances returned by account metadata calls are not retained. | **Verified in code/config**. |
| Secrets management | Plaid client ID, secret, webhook/redirect configuration, and token-encryption key are server-only deployment variables. No Plaid secret uses `NEXT_PUBLIC_`. | **Verified in code/config** (`.env.example`, Next server modules). Vercel environment variables are provider-encrypted at rest; dashboard role review is **Needs Rick**. |
| Access-token protection | Access tokens are encrypted before persistence with AES-256-GCM, a random 96-bit IV, and an authentication tag. The key is separate in the deployment secret store. | **Verified in code/config** (`token-crypto.ts`). Key rotation/runbook and custody review are a **Gap**. |
| Encryption in transit | Customer traffic terminates over HTTPS at Vercel; server calls use HTTPS Supabase/Plaid endpoints. The app sets HSTS for HTTPS clients. Vercel documents HTTPS/TLS 1.3. Supabase documents encrypted network links, but dashboard SSL enforcement must be confirmed. | **Verified in code/config** for HTTPS origins/HSTS and **Verified managed-provider capability** for Vercel/Supabase. Supabase project setting: **Needs Rick/upcoming review**. |
| Encryption at rest | Plaid access tokens additionally have application-layer AES-256-GCM encryption. Vercel documents AES-256 for its persisted data/environment variables. Supabase provider storage/database encryption is provider-managed; WriteOffs does not claim application field encryption for ordinary transaction/receipt data. | **Verified in code/config** plus **Verified managed-provider capability**. Current Supabase plan/settings: **Needs Rick**. |
| Customer authentication | Supabase Auth sessions are synchronized through SSR cookies. Protected routes call `getUser`; Production configuration requires MFA mode `required`. TOTP enrollment/challenge uses AAL2. | **Verified in code/config** (`proxy.ts`, `mfa-policy.ts`, MFA components, environment guard). Dashboard TOTP/redirect/SMTP configuration: **Needs Rick**. |
| Authorization | Plaid routes derive the Business from the authenticated user. Base Item/token tables revoke customer grants; narrow RPCs omit credentials. Account/version reads use Business-scoped RLS. Service-role operations re-check the authenticated Business before accessing an Item. | **Verified in code/config** and database tests. |
| Least privilege | Browser uses Supabase anon credentials and RLS. Service role is server-only. Plaid requests Transactions only. GitHub Actions has `contents: read`. | **Verified in code/config**. Human Vercel/Supabase/Plaid role inventory is **Needs Rick**. |
| OAuth | New and update Link tokens include the configured redirect URI. The browser resumes OAuth using the original short-lived Link token plus `receivedRedirectUri`; access tokens never enter browser storage. Environment-specific redirect allowlists remain a Plaid Dashboard task. | **Verified in code/config** after this phase; Dashboard setup and Sandbox OAuth institution test are **Needs Rick / validation gap**. |
| Webhook authenticity | The endpoint verifies Plaid's ES256 JWT, retrieves the JWK from Plaid, requires a five-minute age, and constant-time compares the signed SHA-256 of the exact raw body before persistence. | **Verified in code/config** (`webhook-verification.ts`, webhook route/tests). Public staging/Production delivery test is a **Gap**. |
| Webhook replay/idempotency | A hash of the signed delivery identity is unique. Item lookup requires Plaid Item ID plus environment. Signals schedule the same leased sync path; unknown Items reveal no tenant information. | **Verified in code/config** (`webhooks.ts`, migration/tests). |
| Synchronization integrity | Item leases, expected-cursor compare-and-swap, full pagination, mutation restart, append-only source versions, and canonical idempotency prevent partial cursor advancement and duplicate bookkeeping effects. | **Verified in code/config** and local database tests. |
| Logging | Plaid errors are reduced to provider error code/type; logs contain bounded internal IDs and diagnostic categories, not tokens or payloads. | **Verified in code/config** (`safePlaidError`, `processPlaidWebhookSync`). Central log-retention/access settings and alert destinations are **Needs Rick**. |
| Secure development | Lockfile, TypeScript, ESLint, Vitest, build checks, private-key rejection, and pull-request/main CI exist. Migrations and RLS have static/database-backed tests. | **Verified in code/config** (`package-lock.json`, package scripts, `.github/workflows/ci.yml`). Review/branch-protection practice is **Needs Rick**. |
| Dependency management | npm audit is part of the documented monthly gate. On 2026-09-09 the Production tree reported zero known vulnerabilities after non-breaking transitive updates. The full development tree retains two moderate findings in Vitest's test-only mocker; the available fix is a breaking Vitest major upgrade and is deferred for a bounded upgrade. | **Verified in code/config** for the lockfile/current run and **Documented policy** for monthly review. Automated Dependabot/code scanning is a **Gap** unless enabled outside this repository. |
| Incident response | A severity, containment, evidence, provider, customer communication, and recovery runbook exists, including Plaid/token incidents. | **Documented policy** (`docs/INCIDENT_RESPONSE.md`). Named staff, notification contacts, and exercise evidence: **Needs Rick / Gap**. |
| Monitoring | Provider and queue health states plus safe diagnostic history exist. Production dashboards/alerts and operator destinations are not repository-verifiable. | **Verified in code/config** for diagnostics; **Gap/Needs Rick** for configured monitoring. |
| Backups | Supabase documents daily backups with seven-day retention on Pro and optional PITR. Database backups include database/Auth/schema state but not private Storage objects. WriteOffs now has an authenticated-encryption bundle for a standard database dump, private-object mirror, and hash manifest. | Provider capability and local tooling are **Verified managed-provider capability / Verified in code/config**. Production plan/PITR, off-provider destination, scheduling, and key custody **Need Rick / remain a Gap**. |
| Disaster recovery | The canonical runbook defines incident paths and restore verification. A 2026-09-09 isolated local drill restored synthetic canonical state, correction history, mileage, RLS, receipt metadata, and a private object without touching staging or Production. | Local mechanism is **Verified in code/config**; provider-hosted drill and operational RPO/RTO remain a **Gap**. |
| Retention | Disconnect invokes Plaid `/item/remove`, stops future synchronization, and retains minimized bookkeeping/source history. Cancellation is not deletion. | **Verified in code/config**. Final retention schedule and lawful basis are **Needs Rick/legal**. |
| Deletion | No complete self-service account/data deletion workflow exists. Support can receive requests, but the deletion/hold/anonymization policy and operational path are not approved. | **Gap**; public launch blocker in `PRODUCTION_LAUNCH_GATE.md`. |
| Privacy/consent | Bank connection UI identifies Plaid, the bookkeeping purpose, and links both privacy policies before Link. The published Privacy Policy is generic and must be legally reviewed and amended before launch. | **Verified in code/config** for connection disclosure; policy publication is **Gap/Needs Rick/legal**. |
| Environment separation | Staging is bound to its expected Supabase host, requires Plaid Sandbox and mandatory MFA, and rejects Stripe live. Production requires its expected host and explicit Plaid Production enablement; Sandbox Link is rejected there. Local remote database use requires an explicit override. | **Verified in code/config** (`environment-safety.js`, tests). Provider-project variable scopes must be verified by Rick. |
| Source/administrator access | Secrets are not committed and private key material is rejected in CI. The repository cannot establish employee screening, device controls, access-review cadence, or Plaid/Vercel/Supabase administrator membership. | **Verified in code/config** for repository controls; remainder **Needs Rick**. |

## Privacy Policy amendment for legal review

Place near “Information We Collect,” “How We Use Information,” and “Sharing”; legal
counsel should reconcile it with retention, deletion, state privacy law, and Plaid's
agreement before publication:

> **Financial account connections.** If you choose to connect a financial account,
> WriteOffs uses Plaid Inc. (Plaid) to help establish that connection. With your
> permission, we receive account and institution details and transaction information
> needed to provide bookkeeping features, such as organizing financial activity,
> matching receipts, asking for missing facts, and preparing reports. WriteOffs does
> not use Plaid to move money, and we do not request Plaid Identity data as part of
> this connection. Plaid's collection and use of information is described in the
> [Plaid End User Privacy Policy](https://plaid.com/legal/#end-user-privacy-policy).
>
> You may disconnect an account in WriteOffs. Disconnecting stops future access
> through Plaid and does not automatically erase bookkeeping records already created.
> We retain or delete those records as described in this Policy and as required to
> provide the service, honor your rights, and meet legal obligations. Contact
> rick@writeoffs.io to request access, export, correction, or deletion where applicable.

Do not promise a deletion period until the retention policy and workflow are approved.

## Plaid Dashboard checklist for Rick

- Confirm application name **WriteOffs** and legal operator **AI Concierge Inc. d/b/a WriteOffs.io**; correct either if corporate records differ.
- Enter the canonical website, support email, reviewed Privacy Policy URL, and Terms URL.
- Describe the use case as read-only transaction import for bookkeeping for U.S. Schedule C solopreneurs.
- Select only Transactions and U.S. checking, savings, and credit-card scope; do not enable Identity/Auth/Transfer or other unused products.
- Upload the canonical WriteOffs logo without altering it; verify Link's application display and Data Transparency Messaging.
- Add exact HTTPS Production and staging OAuth redirect URIs with no query string. Set each deployment's `PLAID_REDIRECT_URI` to its own allowlisted URI.
- Configure the exact HTTPS Production webhook and verify signed deliveries before activation.
- Review the end-user consent/disclosure language against Plaid's current agreement and legal advice.
- Complete Company Info: legal name, address, entity/jurisdiction, website/domain ownership, support/security/privacy contacts, employee/access facts, and geographic scope. Unknown repository facts must come from Rick.
- Submit the questionnaire only after the gaps below are truthfully resolved or disclosed.

## Production-enablement checklist and open dependencies

1. Legal approval and publication of the Plaid/privacy amendment.
2. Approved retention/deletion schedule and a reauthenticated operational deletion path.
3. Production Supabase plan review: daily backup retention, PITR decision, SSL enforcement, Storage recovery, log retention, project access, and an isolated restore test.
4. Backup/DR exercise covering Postgres plus private receipt objects and database-to-object linkage; record actual RPO/RTO.
5. Configure Production-only Plaid/Vercel variables, redirects, webhook, Link display, consent messaging, and access roles without reusing staging values.
6. Run Sandbox OAuth return/update-mode tests on mobile Safari/webview and signed webhook tests against the public staging endpoint.
7. Configure monitoring/alerts for Plaid webhook failures, sync errors, reconnect states, latency, and provider outage; document operator ownership.
8. Review human administrative access, MFA, devices, source-control branch protection, vendor inventory, incident contacts, and any cyber-insurance answers.
9. Re-run CI, production dependency audit, tenant/RLS database tests, and current provider security/advisory review.
10. Only after Plaid approval, use a separately authorized controlled Production account test; keep `PLAID_PRODUCTION_ENABLED=false` until that activation window.

## Supabase and disaster-recovery handoff

The upcoming Supabase review must verify—not assume—the project plan and enabled
capabilities for database encryption/SSL settings, daily backup retention, PITR,
compute availability, log retention, Storage policies/object recovery, project-team
MFA/SSO/access, network controls, and regional/data-processing configuration.

The DR phase must prove an isolated database restore, private Storage recovery,
receipt/statement linkage, Auth implications, migration parity, RLS for two tenants,
canonical totals, queue consistency, exports, Vercel redeployment, configuration
inventory recovery, and measured RPO/RTO. Git and Vercel can rebuild application
code; they do not by themselves recover Supabase database or private Storage data.

The 2026-09-09 readiness packet is in `SUPABASE_PRODUCTION_READINESS.md`; the tested
bundle, drill evidence, incident paths, and remaining operational gaps are in
`BACKUP_AND_DISASTER_RECOVERY.md`. Backup/DR-related answers remain qualified until
Rick enables/verifies Production Pro, PITR, SSL, independent destination/schedule, and
completes the provider-hosted isolated drill.

## Primary external evidence

- Plaid OAuth: https://plaid.com/docs/link/oauth/
- Plaid Link API: https://plaid.com/docs/api/link/
- Plaid webhook verification: https://plaid.com/docs/api/webhooks/webhook-verification/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel security/compliance: https://vercel.com/docs/security/compliance
