# Repository hygiene audit — September 15, 2026

Maintenance evidence, not product authority. `WORKFLOW_SPECIFICATION.md` remains authoritative.

## Scope and starting state

Branch: `v2-onboarding-staging`. Baseline: `d04f095da1876b088cd318b68e6862637f43e4a8`.
The starting index/tracked working tree was clean: 802 tracked files and six untracked files. No customer data, database, hosted secrets, provider configuration, backup/DR infrastructure, main branch or real Production changes are part of this cleanup.

[Per-item classification and action table](REPOSITORY_HYGIENE_INVENTORY.csv) includes every original suspicious filename and all observed numbered build/vendor copies. Its columns record classification, action, reason, unique content, reference evidence, and original Git status. The initial broad filename scan flagged 139 files (including legitimate `template`, backup and migration names); an expanded numbered-path scan found 86 generated numbered paths. A separate dependency scan found 1,461 numbered vendor copies. These overlapping counts are not a count of obsolete source files.

## Source and dependency findings

Five untracked source copies were removed:

- `app/api/waitlist/confirm/route 2.ts`
- `app/components/PublicFooter 2.tsx`
- `app/home/WeeklyReview 2.tsx`
- `app/login/page 2.tsx`
- `app/reports/tax-time/page 2.tsx`

Each matched an existing historical Git blob, differed from the current canonical implementation, and had no active import. None contained a unique uncommitted fix. They were superseded copies, not byte-identical copies of today's source. Next.js did not treat their filenames as special page/route entrypoints, but TypeScript's source glob could discover them. Their naming is consistent with file-copy/sync artifacts; the creating process was not established.

An import/export graph rooted at App Router entrypoints, followed by test/script/text-reference inspection, identified 21 dead application files. Removed items include old Home weekly-review UI, abandoned review modal/table/category controls, unused waitlist/marketing components, the obsolete client-price BuyButton, a prototype CSV uploader, obsolete Supabase wrappers, an unused mailer, a dead three-tier plan recommender and two superseded read-model wrappers/helpers. The inventory lists every file. Canonical account, correction, Check-in, receipt, report and payment paths remain.

Removed 220 CSS selector branches tied exclusively to the retired weekly/Home components. Shared selectors used by current Check-in were retained. Tests solely describing deleted UI were removed; backend, migration, security and current workflow coverage remains. Added source-copy regression coverage and current/historical Stripe price mapping coverage.

No package was removed or upgraded. Tooling/peer/transitive requirements were distinguished from application imports. `npm ci` rebuilt the contaminated vendor directory from the unchanged lockfile; a subsequent scan found zero numbered vendor copies. CI now uses the already-declared Node 22 runtime. Typecheck runs `next typegen` before TypeScript so a clean checkout does not depend on leftover generated route declarations.

## Product compatibility and environment references

- **Teller:** no active provider package, route or runtime integration to remove. Historical migrations, provider provenance and negative security tests remain.
- **Membership:** removed unused $19/$29 display catalog and obsolete three-tier recommender. The $39 launch membership remains. Historical Stripe price-to-plan mappings remain necessary for existing subscription/webhook records. Environment validation now requires the launch membership price instead of requiring two obsolete tier prices. No subscription was changed.
- **Weekly review:** removed dead customer UI. Retained worker scheduling, legacy records, processing APIs and regression contracts. No notification scheduling or database fields were changed.
- **Waitlist:** removed unused form/CTA/mailer. Hardened endpoints, rate limiting and signup-policy guards remain; the active public funnel remains signup.
- **Onboarding:** month-level start, catch-up pricing, mileage deferral and Phase 2A historical question policy remain. The superseded Phase 1 historical splitter had no runtime caller.
- **Environment example:** uses required MFA, current launch/catch-up price names and explicitly labeled historical price mappings. Removed unused CI `NEXT_PUBLIC_APP_URL`; CI uses canonical `NEXT_PUBLIC_BASE_URL` and local placeholder Supabase URL.
- **Hosted variables:** names were read from the pinned staging project only. `EXPECTED_SUPABASE_HOST` appears to be a redundant legacy name; source uses `WRITEOFFS_EXPECTED_SUPABASE_HOST`. It is a candidate for a separate operator review, not automatically removed. Historical Stripe price variables, staging MFA guards, Resend, backup keys and provider variables remain referenced or compatibility-required. No hosted variable was changed. Local secret files were neither printed nor deleted.

## Assets and generated output

Removed four unused old marketing mockups and five unused press-name SVGs. Removed unreferenced `public/media/writeoffs_logo_clean.jpg`, an exact byte duplicate of the canonical logo, and the superseded `writeoffs_logo_clean.png` press variant. The immutable canonical logo bytes were not changed. Both `writeoffs-logo-tight.png` (PDF) and identical `logo-header.png` (active public/download URL) remain intentionally required.

The four current Betti PNGs, replaceable character interface, active landing illustration, social image, logo SVG and working CSV template remain. Three unique unreferenced portrait originals (`public/founder-photo.png`, `public/rick.png`, `public/media/founder.jpg`) remain pending an owner decision; no filename-based deletion was performed.

`public/betti/ betti-working.webp` is a unique, untracked historical two-panel Home design mockup, not an active Betti character asset. Its README calls it a design reference. It remains explicitly excluded from deployment and intentionally untracked pending owner approval to delete. It is the only explained pre-existing untracked item left.

Removed stale `.next` (2,311 files; 1,357,659,489 bytes), `.vercel/output`, generated `.vercel/node`, TypeScript build cache and Finder metadata. Generated `next-env.d.ts` is no longer tracked; Next regenerates it. `.gitignore` and `.vercelignore` now consistently exclude generated/cache/browser-test output and local secrets. Source duplicate filenames are not hidden by ignore rules; obsolete per-file source exclusions were removed after deleting the files.

Local `.env*`, `.vercel` project/credential state, `supabase/.temp` operator state, backups, DR material and external historical certification evidence remain protected. The audit does not purge `/private/tmp` indiscriminately.

## Documentation and database

The old onboarding/experience documents are now explicitly historical companions with links to current authority. Useful incident/certification evidence remains. This report and its inventory are the durable cleanup record; temporary raw comparison logs stay outside the repository.

All migrations remain immutable. Possible future schema review areas include legacy provider provenance, historical tier fields and old weekly-review preferences. None is approved for deletion here, and no schema/data operation was performed.

## Validation procedure and limits

Local verification: 1,249 tests passed, 143 database-dependent tests skipped; TypeScript passed; ESLint had zero errors and 16 existing warnings. The skipped tests require a database and were not run against customer data during this maintenance task.

Before staging deployment, push the reviewed cleanup non-forced and certify an isolated checkout from `origin/v2-onboarding-staging`: lockfile install, TypeScript, ESLint, full tests, optimized build, dependency audit, redacted secret scan, diff check, route manifest inspection and clean Git status. Use placeholder public configuration without copying local secret files. Record the actual checkout path, commit, results and staging deployment in the delivery report. No fresh-checkout or deployment result is claimed by this pre-deployment record.

Staging smoke testing must remain read-only: public routes, authenticated-route gates, asset loading and browser errors. Do not run fixture creation or mutation scripts against Rick's customer to certify repository hygiene.

### Read-only staging smoke follow-up

The first certified cleanup deployment exposed an existing signed-out API response defect: `/api/reports/tax-time` loaded membership before checking authentication and reported absent membership as HTTP 500. The baseline contained the same implementation. The follow-up adds the same explicit user check used by the PDF endpoint and returns 401/403 for authentication/membership failures. It does not change readiness calculations or access policy. Regression tests cover signed-out rejection before any books query, missing membership, and preserved read-only access. Repeat fresh-checkout certification for this follow-up before final deployment.
