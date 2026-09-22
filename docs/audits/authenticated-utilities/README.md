# Authenticated utilities — staged visual review

September 22, 2026. Ready for Rick's next visual review, not final UX acceptance.
No clean-room product certification was started.

## Scope and changes

- **Transactions:** removed the floating Home link; clearer money-in/out introduction;
  retained one containing list surface; quieter inactive selection controls and no
  redundant zero-selection count. Existing filters, views, amounts, receipt statuses,
  selection, bulk operations and history navigation remain unchanged.
- **Mileage:** routine entry leads with business miles/date, vehicle and purpose.
  Miles/date share a compact mobile row; enlarged text reflows to one column.
  Optional project/destination fields remain in the form behind Trip details, and
  open automatically when an edited trip has either value. Removed redundant copy.
  Existing first-vehicle setup, personal-use choice, tax-method controls, exports,
  precision, mutation payloads and history remain intact.
- **Invoices:** shared authenticated page and utility-first presentation. Light semantic
  fieldsets group customer, work/amount and dates. Project/location/note remain under
  Additional details. Existing invoice activity leads for returning customers, with
  real customer/amount/description/issue/due date/status fields. Top Create invoice
  opens the existing form and focuses Customer. The lower toggle is secondary.
  First use opens the form immediately. Existing creation API, idempotency key,
  field names, detail route, payment recognition and status semantics are unchanged.
- **Shared missing records:** quieter consistent surface, account dividers and a
  recognizable Send statements control. Source coverage facts, per-account dates,
  default open/closed behavior and coverage calculations are unchanged.
- **Home / Check-in / Reports:** approved compositions preserved. Shared coverage
  presentation only. Home's Answer Betti’s questions CTA stays unchanged. No
  conversation mounting, question readiness or transitions were altered.
- **Brand:** existing logo and right-side Menu preserved; no new artwork or Rive.
  Utility pages do not gain decorative Betti.

## Public staging verification

Base: https://writeoffs-fresh-staging.vercel.app

Six routes captured in a real authenticated Chromium browser at **390, 430, 1280,
1440** pixels, with real MFA and explicitly synthetic existing staging customers.
No mocked API responses or screenshot-only financial values. Screenshots were
opened for visual review, in addition to layout measurements.

- Main capture: 24 renders, zero horizontal page overflow, one main landmark,
  Menu on the right, no browser runtime errors (`screenshots/results.json`).
- Transactions: populated All; Needs review's genuine empty state; populated Needs a receipt; keyboard date
  filtering and focus order; selection shows existing bulk controls without applying
  a financial change.
- Mileage: genuine no-vehicle first use and returning vehicle state. The existing
  synthetic vehicle still needs tax-method setup; that genuine incomplete state is
  shown, not suppressed or fabricated. No trip or tax fact was changed.
- Invoices: genuine empty state, creation through the real public UI, populated
  list and keyboard-opened creation form at all four widths. One synthetic invoice
  ($175.25, “Synthetic utility review”) was created. No payment was invented or
  linked. Reports stayed at income $2,100.00, expenses $1,088.58, profit $1,011.42.
  See `screenshots/invoice-behavior.json`.
- Home: genuine deferred-completion state, collapsed and expanded missing-records
  disclosure, five recent transactions. Reports: populated working books.
- Check-in: genuine records-request action and deferred-completion state. Existing
  fixtures did **not** offer an ordinary transaction question; no question was
  fabricated or forced into canonical state to produce a screenshot. This is a
  visual-review limitation, not a new certification of every question type.
- 200% root text scaling and reduced-motion preference tested across all six routes;
  zero horizontal overflow. Keyboard/native controls retained. This is not a full
  screen-reader conformance certification. First-use native radio keyboard behavior
  is inherited from the prior pass; `radioKeyboard:false` in the returning fixture
  means the setup radio was not present, not a failed keyboard assertion.

See [gallery](gallery.md) for screenshot links and state distinctions.

## Validation

- `npm test`: **1,896 passed; 143 skipped**. Skipped suites require separate local
  integration infrastructure; they are not claimed as passes.
- `npm run typecheck`: pass.
- `npm run lint`: zero errors; 16 existing warnings.
- Optimized `next build --webpack`: pass locally and on dedicated Vercel staging.
- Gitleaks on current tracked source: no leaks.
- `git diff --check`: pass.
- No API/domain/SQL/Plaid code or dependency changes. Unrelated pending Plaid audit
  files and unapproved Betti assets were excluded from commits and deployment.

## Deployment incident and cleanup

An initial archive command failed due to the local Python version not supporting
`tarfile.extractall(filter=...)`. The following unguarded CLI call created an empty
new Vercel project, `writeoffs-utility-deploy-c83559c`, not the WriteOffs application.
Provider file-list inspection returned `[]`; build time was 0ms; no source, secrets
or customer data were uploaded. After that evidence established disposability,
the temporary project was removed. A provider lookup confirmed **404 Project not
found**. Real Production was never targeted.

Deployment was retried using a single fail-fast controller that verifies branch,
commit, required packaged files and the exact dedicated staging project binding
before launching the CLI. Future staging packaging must retain these guards.

## Final staging release

Application commits: `c83559c`, `731a83f`. Final deployment:
`dpl_6Nzwod3FNKp3S3nCcCHLeTUCRfqE`, dedicated project
`prj_o56739F1pzd0TjFirEYoLMaa6oIJ`. The final invoice-only hierarchy refinement
was rechecked on public staging at all four widths; other routes retain the
previously captured identical presentation. `final-invoices/` and `first-use/`
contain the final invoice screenshots. Earlier `screenshots/invoices*` images
are preserved as iteration evidence; use the gallery for the current presentation.
