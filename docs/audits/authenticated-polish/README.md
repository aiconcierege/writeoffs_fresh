# Authenticated consistency and polish

Scope: Home, Work with Betti, Transactions, Mileage, Reports. Presentation only; dedicated staging. This is a reviewable visual pass, not final product-design acceptance.

## Changes

- Shared `AuthenticatedPage` frame, 72rem record/report width, compact top spacing, warm pale-green surfaces, indigo actions, consistent fields and focus treatment.
- Home: “Answer Betti’s questions”; removed task-count copy. Hero, five recent transactions, state logic and financial snapshot preserved.
- Check-in: existing persistent conversation, Betti boundary and 37/63 composition preserved without changes.
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

Public staging verification and screenshot evidence are recorded after deployment. Existing unrelated Plaid audit files and security migration are excluded from this visual change.
