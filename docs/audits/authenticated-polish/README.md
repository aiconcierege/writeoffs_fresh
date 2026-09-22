# Authenticated consistency and polish

Scope: Home, Work with Betti, Transactions, Mileage, Reports. Presentation only; dedicated staging. This is a reviewable visual pass, not final product-design acceptance.

## Changes

- Shared `AuthenticatedPage` frame, 72rem record/report width, compact top spacing, warm pale-green surfaces, indigo actions, consistent fields and focus treatment.
- Home: “Answer Betti’s questions”; removed task-count copy. Hero, five recent transactions, state logic and financial snapshot preserved.
- Check-in: existing persistent conversation, Betti boundary and 37/63 composition preserved. A narrow enlarged-text fallback wraps identity/actions without changing the normal composition.
- Transactions: removed duplicate main/container padding; cohesive views/search/date filters; one containing ledger surface; wrapping merchant names and aligned tabular amounts. Selection, bulk controls, filters, pagination and detail links unchanged.
- Mileage: removed decorative Betti intro; clear vehicle setup with primary name and secondary optional fields; native personal-use radios preserve the existing yes/no payload and default. Established vehicles retain the trip-entry-first layout. Vehicle tracking details, history, corrections and export retain their existing behavior.
- Reports: shared frame, responsive period controls, category alignment, and a pale-green Tax-time & exports section. Financial calculations and export destinations unchanged.
- Logo asset and right-side navigation preserved. Logo uses contain sizing to preserve its aspect ratio under enlarged text.

## Validation

- Full suite: 1,896 passed; 143 environment-dependent skipped.
- TypeScript and optimized webpack build passed.
- Lint: no errors; 16 existing warnings.
- Tracked-source secret scan: no leaks. No private fixtures, environment files or unapproved Betti assets included.
- Dependency audit: two existing moderate development-tool findings; no high/critical findings. Dependencies unchanged.
- `git diff --check` passed.
- Synthetic authenticated browser review includes 390, 430, 1280 and 1440 widths, all five routes, keyboard date filters, bulk selection, native radio navigation, and enlarged text/reduced-motion checks.

Public staging verification uses real authenticated browser renders and an existing explicitly synthetic customer. No mocked API responses or fabricated financial values are used. The fixture shows deferred/coverage-gap Home and Check-in states; the needs-customer CTA/no-count contract is also covered by Home projection tests. One synthetic vehicle was created through the real UI to inspect normal trip entry. No trip or tax-method facts were changed.

A 200% root-text stress test initially exposed clipping despite zero page overflow. Visual inspection led to container-based reflow for Home, Check-in and Transactions, and readable report-summary numbers. Normal desktop/mobile compositions are preserved. This is a targeted accessibility check, not a full screen-reader conformance certification.

Public deployment and final screenshot evidence are listed below. Existing unrelated Plaid audit files and security migration are excluded from this visual change.

## Public staging delivery

- Application commit: `185b6ed` (preceded by `ac8670b` and `d6b925b`).
- Dedicated project: `writeoffs-fresh-staging`, `prj_o56739F1pzd0TjFirEYoLMaa6oIJ`.
- Deployment: `dpl_F2qjoXoExrUEFzDNYuvpj2vBJejv`.
- Public alias: https://writeoffs-fresh-staging.vercel.app
- Review routes: `/home`, `/check-in`, `/transactions`, `/mileage`, `/reports`.
- [Screenshot gallery](gallery.md). Includes the initial vehicle setup and established-vehicle trip-entry states.

Transactions and Mileage headings begin 16px below the 72px header on narrow mobile, and 24px below on desktop. Reports uses the same top spacing with its existing eyebrow above the title. Home and Check-in retain their accepted hero/conversation geometry.

Shared text contrast spot checks: ink on pale green 10.95:1; muted text on warm white 5.96:1; indigo on selected pale blue 10.13:1.

Preserved: canonical financial and mileage calculations; classification, question generation and receipt matching; Plaid; persistent question readiness; bulk actions; transaction detail/history; filters and period selection; exports; immutable logo and right-side Menu. No database migration, dependency, secret, or Production configuration change belongs to this pass.

Normal screenshots were visually inspected, not certified solely from DOM overflow measurements. Extended-text screenshots were reviewed separately and used to fix actual overlap and clipping. No full screen-reader or every-business-state certification is claimed. Final product/design approval remains with Rick.

Final public run: 20/20 route/width captures succeeded; zero page overflow, one main landmark per route, Menu on the right, and zero browser runtime errors. Keyboard date filters and bulk controls passed. First-use native radio keyboard behavior passed before vehicle creation (`accessibility-vehicle-setup.json`); it is not present in the subsequent trip-entry state, hence `radioKeyboard: false` in the final artifact means not exercised in that state.

At 200% text, long content reflows vertically. Native date/select inputs retain browser-managed editing/selection within their available width; the stress test is not a claim that every long field value is simultaneously visible.
