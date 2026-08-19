# WriteOffs v1 onboarding architecture

Onboarding asks customers how their business operates and leaves accounting
interpretation to the one canonical bookkeeping and tax-treatment path. It does not
configure accounts, categories, Packs, tax rates, home-office calculations, vehicles,
or bank connections.

## Required flow

1. Business name (optional), plain-language description, and optional Realtor context.
2. Plain-language confirmation that the business is reported on Schedule C.
3. New versus existing business and start month.
4. Customer-job materials and substantial future-sale merchandise facts.
5. For an existing business using job materials, prior handling at tax time.
6. Historical catch-up start date, defaulted in the UI to January 1 of the current year.
7. First activity: canonical CSV import or canonical receipt upload.
8. Review and completion.

Each completed step is persisted on the authenticated user's single Business. The
server derives product eligibility; the client cannot select another Business or
declare itself eligible. Completion is versioned, tenant-scoped, and idempotent.

## Eligibility and unsupported states

V1 supports U.S. owner-operated Schedule C businesses, including service businesses,
trades, creators, consultants, contractors, and Realtors. Realtor is optional evidence
inside the same path, not a separate workflow or engine.

Partnerships and corporations, Schedule E activity, payroll, full accrual systems, and
businesses requiring substantial ongoing merchandise inventory management are outside
v1. The UI explains this as a product limitation and does not create false-complete
books. “I’m not sure” preserves the answer and fails closed until clarified.

Normal leftover parts and modest truck/shop stock do not make a contractor unsupported.
WriteOffs supports parts and materials installed, used, or provided through customer
jobs. Their Business economics remain valid, while federal tax timing stays unresolved
until approved business-level accounting-method context exists.

## Invisible accounting behavior

WriteOffs is designed around its approved cash-basis Schedule C model, but onboarding
does not ask customers to name an accounting method. Prior handling of customer-job
materials is captured as factual history only. It never activates a tax rule, changes
an accounting method, creates COGS, or changes bookkeeping allocation.

## Existing users

Explicit legacy answers may be safely derived: an existing Schedule C answer becomes
`yes`, another explicit filing type becomes `no`, and Profile `vertical` becomes the
matching business context. No job-material, merchandise, prior-method, business-stage,
or catch-up answer is fabricated.

Completed v2 users retain all progress and see a small Home follow-up link for only the
missing v3 facts. They do not restart from the beginning, and no duplicate Business is
created. Old home-office, vehicle, financial-account-preference, and recommendation
data remains stored for compatibility but is not required by v3 onboarding.

## Later corrections

Business profile remains editable in Settings and stays synchronized with Business
context. Other accounting-sensitive onboarding facts are reviewed through the
resumable onboarding surface. A later approved correction workflow must preserve
history and invalidate dependent tax conclusions rather than casually overwriting an
established method. This milestone does not implement tax-method changes.
