# Dependency security upgrade

## Outcome

WriteOffs moved from Next.js 15.5.21 / React 18.3.1 / Vitest 2.1.9 to the smallest reviewed framework and test-tool lines that clear the registry advisories available on 2026-08-25. No accounting, tax, ingestion, billing, or product behavior was intentionally changed.

Baseline audits reported:

- Production (`npm audit --omit=dev`): 4 high, 0 critical, 0 moderate.
- Complete tree (`npm audit`): 1 critical, 12 high, 3 moderate.

Final audits report zero known vulnerabilities in both the production and complete dependency trees.

## Advisory classification

| Package | Severity | Direct? | Scope and parent | Affected installed version/range | Fixed version used | Upgrade character |
| --- | --- | --- | --- | --- | --- | --- |
| `next` | High (aggregate) | Yes | Production framework; bundled vulnerable PostCSS and Sharp | 15.5.21 | 16.3.3 | Breaking major, required for the supported fixed Sharp chain |
| `sharp` | High | No | Production image pipeline through Next.js | 0.34.4 / `<0.35.0` | 0.35.3 via Next 16.3.3 | Parent major upgrade |
| `postcss` | High + moderate | Yes and nested | Production build/runtime framework chain and CSS build | 8.5.6 direct, 8.4.31 under Next / `<=8.5.22` | 8.5.26 direct, 8.5.23 under Next | Direct minor plus parent major |
| `nanoid` | High | No | PostCSS transitive dependency; production tree | 3.3.11 / `<=3.3.17` | 3.3.18 | Transitive patch |
| `vitest` | Critical | Yes | Development/test UI server | 2.1.9 / `<3.2.6` | 3.2.6 | Minimum fixed major |
| `vite` / `esbuild` | High + moderate | No | Vitest development server/build tooling | Vite 5.4.20, esbuild 0.21.x / Vite `<=6.4.2`, esbuild `<=0.24.2` | Vite 7.3.6, esbuild 0.25+ resolved by Vitest | Parent major upgrade |
| `rollup` | High | No | Vitest/Vite build tooling | 4.52.4 / `<4.59.0` | 4.63.0 | Transitive patch |
| `glob` | High | No | Tailwind/Sucrase development tooling | 10.4.5 / `<10.5.0` | 10.5.0 | Transitive patch |
| `minimatch` | High | No | ESLint and glob development tooling | 3.1.2 and 9.0.5 | 3.1.5 and 9.0.9 | Transitive patch |
| `brace-expansion` | High + moderate | No | Minimatch development tooling | 1.1.12 and 2.0.2 | 1.1.18 and 2.1.4 | Transitive patch |
| `js-yaml` | High + moderate | No | ESLint config parsing | 4.1.0 / `<4.3.1` | 4.3.1 | Transitive minor |
| `yaml` | Moderate | No | PostCSS/Vite configuration parsing | 2.8.1 / `<2.8.3` | 2.9.0 | Transitive minor |
| `picomatch` | High + moderate | No | Tailwind and Vitest glob matching | 2.3.1 and 4.0.3 | 2.3.2 and 4.0.7 | Transitive patch |
| `flatted` | High | No | ESLint cache tooling | 3.3.3 / `<=3.4.1` | 3.4.4 | Transitive minor |
| `ajv` | Moderate | No | ESLint schema validation | 6.12.6 / `<6.14.0` | 6.15.0 | Transitive minor |

The production advisories were relevant because Next's server/image and CSS pipeline is part of the deployed artifact. The Vitest/Vite, lint, and glob families are development/CI-only, but were still remediated because malicious or untrusted project inputs could affect developer or CI hosts. No advisory was suppressed.

## Direct dependency changes

- `next`: 15.5.21 → 16.3.3
- `react` and `react-dom`: 18.3.1 → 19.2.8, matching the Next 16 App Router compatibility line
- `eslint-config-next`: 15.5.21 → 16.3.3
- `postcss`: 8.5.6 installed from the prior range → 8.5.26 pinned
- `vitest`: 2.1.9 → 3.2.6
- `@types/react`: 19.2.2 → 19.2.18
- Removed the direct `@eslint/eslintrc` dependency; ESLint now consumes Next's native flat presets.

No Supabase, Stripe, Plaid, PDF.js, Tailwind, or Playwright direct dependency was upgraded for this milestone.

## Framework migration notes

The relevant Next 16 changes are:

- Node.js 20.9 or newer is required. The repository now declares `node >=20.9.0`; validation used Node 22.19.0 and npm 10.9.3. This is compatible with Vercel's supported Node 20/22 runtimes; production should select Node 22 unless the deployment configuration already standardizes another supported release.
- React 19.2 is the supported App Router line.
- synchronous request APIs are removed. WriteOffs already awaited route `params`, cookies, and headers where used; typecheck found no migration defect.
- Turbopack is the default production compiler. The existing `serverExternalPackages` entries for PDF.js and canvas compile successfully.
- `middleware.ts` is deprecated in favor of Node-runtime `proxy.ts`. The auth/MFA/session logic was renamed without semantic changes, and its static regression tests now inspect the canonical file.
- Next 16 uses native flat ESLint presets. The compatibility bridge was replaced with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`. The newly introduced `react-hooks/set-state-in-effect` advisory rule is disabled to preserve the prior lint contract; refactoring existing effects is explicitly outside this security upgrade.
- Next 16 selects the React automatic JSX runtime and adds development type generation paths to `tsconfig.json`.
- `next build` no longer performs ESLint, so CI must continue running `npm run lint` independently (the repository's `ci-checks` already does).

The first Turbopack build attempt encountered a transient page-data module lookup after a network-constrained font attempt; an immediate clean production build completed and emitted all canonical routes. No route source change was needed.

## Security and application compatibility

- Existing security headers remain configured unchanged: CSP (`frame-ancestors`, `base-uri`, `object-src`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Supabase cookie refresh, logged-out redirects, MFA enrollment/challenge routing, and security-route enforcement remain in the renamed proxy.
- Stripe's webhook route remains a Route Handler with raw-body signature verification; no Stripe SDK or membership lifecycle code changed.
- Plaid remains Sandbox-only; its routes and entitlement tests are unchanged.
- Receipt, statement/PDF.js/OCR, durable queue, invoices, manual money, mileage, contractor, deduction, reporting, and current-record code was not changed.
- The Supabase SVG MFA QR continues to use the established native image element; Next Image behavior was not introduced.

## Build and deployment implications

- Vercel must use Node 20.9+; Node 22 is the recommended current setting for this repository.
- The existing build command (`npm run build`) and one-minute processing cron remain valid.
- The production build needs network access to fetch the existing Google Inter font unless its cache is warm. This pre-existing build dependency is unchanged; self-hosting the font can be considered separately for reproducible offline builds.
- No database schema or remote configuration change is involved.

## Rollback

The pre-upgrade application commit is `783c9cf`.

To roll back before deployment, restore the prior `package.json`, `package-lock.json`, ESLint config, TypeScript config, generated Next environment declaration, and `middleware.ts` from that commit, then reinstall dependencies. There is no schema dependency, provider state change, or remote side effect to reverse.

## Launch recommendation

This gate is clear when the final validation matrix remains green and both audit commands continue to report zero vulnerabilities. Because registry disclosures can change, rerun both audits immediately before a production release. As of 2026-08-25 there is no remaining dependency-security blocker identified by npm audit.

## Validation record

- Full deterministic suite: 118 files passed, 35 credential-gated files skipped; 744 tests passed, 117 skipped.
- Focused auth, membership, routing, statement, durable-processing, Plaid, and reporting suite: 14 files / 93 tests passed.
- TypeScript: passed.
- ESLint: passed with 30 pre-existing/advisory warnings and no errors. Three warnings are new Next 16 guidance for internal client navigation; they are documented rather than mixed into this security change.
- Production build: passed under Next 16.3.3/Turbopack; all 76 generated pages and canonical Route Handlers were emitted.
- Local PostgreSQL/RLS: 857 of 860 enabled tests passed in one serial aggregate run. The three queue-global cases were affected by pre-existing jobs in the non-reset local database; each underlying durable-document flow passed when run in isolation before the aggregate run. No database code changed. A pristine-reset run was intentionally not performed because it would destroy unrelated local QA state.
- MFA browser journey: passed enrollment, SVG QR display, TOTP verification, sign-out/sign-in challenge, fresh assurance for factor removal, and removal.
- Membership/read-only/mobile browser journey: passed.
- Statement browser journey: passed upload, browser departure, durable worker processing, transaction/report visibility, exact-duplicate suppression, and its 390px no-overflow assertion. The test now prioritizes only its synthetic statement job so an unrelated dirty local queue cannot starve the browser fixture.
- Security headers: unchanged and covered by the account-protection tests.
- Stripe webhook: static raw-body/signature and membership security regression tests passed. No external Stripe calls were made.
- Plaid Sandbox: static link, webhook, normalization, security, and entitlement tests passed. No Production access was used.
- `git diff --check`: passed.
- Credential-pattern scan of the milestone diff: passed.
