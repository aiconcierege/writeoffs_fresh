# WriteOffs Security and Environments

## Authentication architecture

Supabase Auth is the identity, session, password-recovery, and MFA authority. Browser sessions use the Supabase SSR cookie integration; server pages and customer APIs derive the user from the authenticated session. Customer-supplied user or Business identifiers are not authentication authority.

WriteOffs supports TOTP authenticator-app MFA. Enrollment begins in **Settings → Security**, verification upgrades the Supabase session, and enrolled users complete a six-digit challenge after password sign-in. MFA removal requires a currently MFA-verified session and server-side ownership validation of the factor.

`MFA_ENFORCEMENT_MODE` supports:

- `off`: development-only troubleshooting; no application enforcement.
- `enrolled` (safe default): anyone with an enrolled factor must complete it.
- `required`: users without a factor are directed to enrollment; enrolled users must challenge.

Use `required` for production launch after subscription/enforcement rollout is approved. Do not set production to `off`. The application does not implement an implicit production bypass.

TOTP must also be enabled in Supabase Auth for every environment. Local Supabase uses:

```toml
[auth.mfa.totp]
enroll_enabled = true
verify_enabled = true
```

Enable the equivalent Auth MFA settings independently in staging and production before setting `MFA_ENFORCEMENT_MODE=required`. The current protected local `supabase/config.toml` has not been changed by this milestone; local MFA integration remains gated until that configuration is enabled. Set `LOCAL_SUPABASE_TOTP_ENABLED=1` only when running the explicit local MFA integration test against a stack with those settings.

## Recovery and session assurance

Password recovery uses Supabase email recovery links. A recovered password does not remove MFA. The user signs in again and completes the normal MFA challenge. Invalid or expired links receive generic customer-facing errors.

WriteOffs does not create custom backup codes, store TOTP secrets after enrollment, use knowledge-based questions, or expose an automatic factor-reset endpoint. Loss of every enrolled authenticator therefore requires a separately verified support recovery process using Supabase administrative procedures. Email alone is not sufficient authorization to disable MFA.

Ordinary bookkeeping does not repeatedly prompt for MFA. Security settings may be viewed to enroll, but factor removal requires an MFA-verified session.

## Environment model

Next.js loads more-specific files after general files. In development, `.env.development.local` overrides `.env.local`, which overrides `.env.development` and `.env`. Never assume `.env.local` won when another environment-specific file exists.

Set `WRITEOFFS_ENVIRONMENT` explicitly:

- `local`: local Supabase, Plaid Sandbox, and test/local payment configuration.
- `staging`: staging Supabase, Plaid Sandbox until approval, and test payment configuration.
- `production`: production Supabase and production secrets. Plaid remains Sandbox until separate Production approval.

When `WRITEOFFS_ENVIRONMENT=local`, the development server blocks a remote Supabase URL unless `ALLOW_REMOTE_SUPABASE_IN_DEV=true` is explicitly set. The override is for deliberate, temporary development use only and must never be committed.

## Local setup and test users

1. Run `supabase start`.
2. Run `supabase db reset` when a clean schema is needed.
3. Copy the local API URL, anon key, and service-role key printed by `supabase status` into an ignored local environment file.
4. Set `WRITEOFFS_ENVIRONMENT=local`, `PLAID_ENV=sandbox`, and `PLAID_SANDBOX_LINK_ENABLED` only as required for the test.
5. Create two clearly synthetic users through `/signup` or the local Auth UI after a reset. Use unique `@example.test` addresses and non-shared disposable local passwords. Do not place passwords in source, fixtures, or documentation.
6. Use the two users for tenant-isolation checks; never seed them automatically into staging or production.

Local resets remove local Auth users. Recreate them after each reset rather than depending on retained identities.

## Secret handling

- Only the Supabase URL and anon key use `NEXT_PUBLIC_` names.
- `SUPABASE_SERVICE_ROLE_KEY`, worker secrets, OpenAI keys, Plaid secrets, and token-encryption keys are server-only.
- Service-role clients live in server-only modules and are not a fallback for customer API authorization.
- Never log sessions, access/refresh tokens, passwords, MFA codes, setup secrets, signed URLs, or provider credentials.
- Environment files containing values remain ignored and must not be committed.

Plaid is Sandbox-only until the independent Production approval and credential process is completed.
