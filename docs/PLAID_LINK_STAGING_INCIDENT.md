# Plaid Link staging incident — September 15, 2026

## Scope and observed failures

Dedicated project: `writeoffs-fresh-staging` (`prj_o56739F1pzd0TjFirEYoLMaa6oIJ`).
Production application, production credentials, Plaid Dashboard, customer bank connections, and account-use designations were not changed.

1. The membership connection-limit check in `POST /api/plaid/link-token` queried `plaid_items` with the authenticated customer client. That table intentionally revokes authenticated access because it contains credentials. Staging reproduced HTTP 403 for the count query, and the route converted the failure to HTTP 503 before contacting Plaid. This applies to any new connection, including an older customer's new connection; update/reconnect mode bypasses this count.
2. After replacing that query with the existing owner-scoped `list_plaid_connections()` RPC, Plaid returned `INVALID_FIELD` for the OAuth redirect. A temporary boolean diagnostic confirmed staging's configured value differed from the canonical callback. Only staging's `PLAID_REDIRECT_URI` was updated to `https://writeoffs-fresh-staging.vercel.app/settings/banking`.
3. A subsequent deployed diagnostic confirmed the canonical callback matched exactly, but Plaid still rejected the redirect field. Dashboard allowlist verification remains required. No callback omission, OAuth bypass, alternate provider, credential replacement, or security relaxation was used.

## Path audit

- `/get-started` uses the existing `BankConnect` click handler, which POSTs to the token route and opens the Plaid iframe when a usable token arrives.
- The page prerequisites preserve MFA, membership, onboarding and business setup ordering. Existing signup/business provisioning and onboarding completion were inspected; no fresh-user-only branch was introduced.
- Membership enforcement remains canonical. Counts still include only active-consent, non-disconnected Items, with existing plan limits; statement/CSV sources do not count.
- The safe RPC derives ownership through `auth.uid()` and returns no credentials. Business resolution for Link remains authenticated. Customer-provided Business IDs are not used.
- Link requests still use Transactions only, US checking/savings/credit-card filters, a stable hashed user identifier, canonical webhook/redirect configuration and the existing 730-day history request.
- The current path does not use Teller. Exchange, sync, reconnect ownership checks, encrypted token storage and account-use behavior were not changed.
- Error logs now contain only predefined codes and field names; never SDK request/response objects, provider messages, credentials, URLs or customer details.

## Validation and limitations

- Browser reproduction used an isolated existing synthetic staging customer with real MFA. It reproduced the exact `/get-started` message before the fix and reached Plaid's redirect rejection after the fix.
- No bank credentials were entered and no accounts were selected or connected.
- New route tests cover post-MFA/paid-membership/onboarding prerequisites with no Items, older-customer connection counts, limits, disconnected/revoked Items, reconnect behavior, membership/read-only denials, unauthenticated access, submitted Business IDs, fail-closed RPC reads and sanitized errors.
- Existing signup, onboarding, membership, security and tenant contracts are included in the full suite. This is not a new end-to-end Stripe checkout test; Rick's real public signup/payment/onboarding success is user-reported.
- The actual fresh customer's identity/session has not been supplied, so that account has not been impersonated or independently browser-certified.
- Final customer Link-open certification remains pending the Plaid callback allowlist check. The feature must not be reported as working until a real iframe opens.

Plaid requires callbacks to be registered in its Dashboard: https://plaid.com/docs/api/link/.
