# Authenticated product composition — September 22, 2026

This is a design-review handoff, not final UX acceptance or clean-room product certification.

## Scope and visual decisions

Reference: `docs/design/references/work-with-betti-approved-direction.png`, the live landing page, and authenticated staging before this pass. The baseline served commit was `dccd1cb4d78795a865fec7e2d06c6b957b36b445` (Vercel deployment `dpl_BortDd7SddQA1xZsuRMfie2LSPxg`). Provider metadata confirmed the dedicated staging project binding.

- Shared presentation: compact 72rem workspaces; white primary surfaces, warm canvas, blue actions/amounts, selective green context; consistent fields, disclosures, focus rings and subtle depth. `Workspace.tsx` owns presentation only. Logo and right-side Menu are unchanged.
- Home: white conversation area paired with Betti's green region; working numbers and secondary tools share a deliberate row; blue profit emphasis; one recent-activity surface. Needs-customer meaning, CTA and absence of task counts remain intact.
- Check-in: retains the persistent 37/63 stage and all question/receipt/defer behavior. A white financial work surface, stronger question hierarchy and compact mobile Betti identity replace the flatter treatment. No new artwork or animation runtime.
- Transactions: retains explicit Select mode, search, filters, tabs and one ledger; adopts shared page-top/field/surface rhythm. No categorization changes.
- Mileage first use: one connected setup composition, with Betti's introduction and a white vehicle setup area. No empty trip/export furniture. Native personal-use radio controls remain accessible.
- Mileage returning: one workbench, with trip entry primary and vehicle decisions in a supporting rail. Genuine miles in the loaded log are labeled “In this log,” never as an annual total/deduction. History has a deliberate empty state or scannable recorded rows. Export stays with the log.
- Invoices: activity first when populated; deliberate keyboard-accessible composer opening. Bill-to and work facts sit opposite a prominent amount and date area on desktop. Mobile gives the amount a clear place in the sequence. Optional email/project/location/note remain available. Creating an invoice does not recognize income.
- Reports: no source or calculation changes. Included in browser review for coherence and regression.

## Mileage timing investigation

### Proven findings

The original annual question asks for a final calendar-year denominator, not a year-to-date reading. A final total cannot be known on September 22 for that calendar year. The previous form, question generation, canonical selector and write guards were already present in the live baseline. A fresh, authenticated synthetic leased/actual-cost session on that baseline did **not** show a 2026 annual-total input.

A separate real gap remained: already-published Betti action projections could bypass the canonical question selector. `readBettiActionIndex`, an indexed answer continuation, and the guided-command early-return path trusted the stored projection. A legacy deduction action did not carry fact type/year metadata. Consequently, deploying the previous timing guard did not by itself make every cached action obey it.

This pass preserves deduction fact type/scope in the projected question and rejects an outdated/current-year annual question projection, using the existing canonical fallback. If that fallback fails after an answer is committed, the answer remains successful but its stale continuation is removed; the existing client recovery path handles the refresh. This does not delete question history or introduce another question engine.

### Attribution limit

We have not reproduced the exact earlier screen from Rick's already-open session or established its URL/deployment at that moment. The cached-path defect is confirmed in code and deterministic tests; it is **not proof** that it caused a question rendered directly inside `/mileage`. Stale-tab versus historical-session attribution remains unproven. The final public-staging DOM check is the evidence for current behavior, rather than an assertion about that earlier browser session.

### IRS basis

[IRS Publication 463](https://www.irs.gov/publications/p463) describes allocating actual vehicle expenses between business and personal use and keeping records of total annual mileage. [IRS Topic 510](https://www.irs.gov/taxtopics/tc510) explains standard mileage versus actual expenses and business/personal allocation. These support the need for a real denominator when finalizing actual-cost business use; they do not prescribe an in-app question schedule.

Deferring the final annual fact until the calendar year has ended is WriteOffs' implementation decision. Business trips continue during the year. Completed prior-year actual-cost follow-up remains available where unresolved. Rates, lease safeguards, cost eligibility, money precision and deduction arithmetic are unchanged. The year-end boundary uses Hawaii time so the latest US-state calendar year has ended.

## Behavioral protection

No Plaid, receipt-matching, invoice recognition, Reports arithmetic, transaction classification, database schema, account scope or unrelated tax policy changes. No real customer data used. No unapproved Fiverr/Rive asset committed. Main and real Production are excluded.

## Validation and hosted evidence

Final validation, public staging deployment identity and screenshot gallery are recorded alongside this document after deployment. Screenshots use explicitly synthetic staging customers and real MFA. No fake question/completion state is introduced for screenshots.
