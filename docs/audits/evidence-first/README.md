# Evidence-first staging workflow verification

Scope: dedicated staging, synthetic/control customers. This is engineering
verification, **not Rick's clean-room manual certification**. No Production work.
Application implementation: `f994c88`, `42b654c`, `e71af5b`.

## Product behavior

- One bookkeeping engine and canonical financial history. A rolling recent-work
  window prioritizes last month through today; unfinished previously included work
  stays included. Purchased earlier cleanup retains its fixed end date.
- For September 23 joining and January coverage: August onward is ongoing;
  January–July is earlier cleanup. October does not make August newly billable.
- Home and Check-in communicate the work context without new navigation. Missing
  periods remain unconfirmed; no receipt or bank-history absence implies zero.
- An optional account/month evidence opportunity precedes substantive purchase
  questions. None, later, and provided are distinct immutable responses. They do
  not change financial treatment. Later uploads continue to reassess the books.
- Uploaded evidence batches wait for dependent extraction/matching/reassessment.
  Current independent work retains priority. Unknown unassigned uploads wait
  conservatively until their dependencies are known.
- Specific remaining facts follow evidence. Loan/refund workflows remain distinct;
  ordinary receipts do not magically establish business percentage or loan split.
- Optional exception copy makes clear Betti already treated ordinary purchases as
  business. Incoming money asks where it came from; cash asks how it was used.
- One viewport-visible saving treatment; authoritative continuation remains intact.

## Actual hosted evidence

The synthetic May statement imported 24 financial transactions. The normal Send
receipts UI uploaded one PDF page with two independent receipts and one two-page
phone bill. Real extraction produced **three logical receipts**, two crop-lineage
records, and no receipt-only duplicate expenses. Authenticated previews were
verified against stored length and SHA-256. See `hosted-receipt-results.json`.

- Printing: business cards/promotional flyers removed the purchase-purpose question.
- Insurance: commercial-liability evidence removed the insurance-coverage question.
- Phone bill: documentation/service evidence improved; business percentage remained.
- Before answers and loan evidence: income **$2,100.52**, expenses **$1,425.73**,
  profit **$674.79**. Zero transaction answers were required for those results.
- Duplicate upload retained three logical receipts and 24 financial transactions.
- Later loan statement: $450 payment split into **$400 excluded principal + $50
  business interest**. Expenses became $1,475.73; income stayed $2,100.52.
  Zero customer answer/loan-confirmation events were fabricated.
- Receipt-only printing expense, followed by an exact later bank transaction:
  **one $218.40 working expense**, not two. Original history retained.
- Irrelevant invitation: normal "Not for my books" action succeeded, preserving
  the source and immutable disposition; no financial classification fabricated.
- Browser refresh after each measured transition returned the same next action.

## Receipt matrix

"Local SQL" means real PostgreSQL canonical functions, synthetic fixtures,
rollback, and deferred constraints forced before completion. "Unit" does not mean
live OCR. Hosted evidence is explicitly identified.

| # | Scenario | Result / evidence level |
|---|---|---|
| 1 | One receipt → one transaction | PASS — hosted printing/insurance/phone matching |
| 2 | Multiple receipts on one page | PASS — hosted two-receipt PDF; unit three-part boundary detection |
| 3 | Multi-page single receipt | PASS — hosted shared-ID two-page phone bill → one logical receipt |
| 4 | One transaction, multiple documents | PASS — local SQL accumulation, one financial amount |
| 5 | Receipt before question generation | PASS — receipt-only hosted pipeline; unit evidence-driven question construction |
| 6 | Receipt after existing question | PASS — hosted May questions replaced after evidence processing |
| 7 | Evidence answers whole question | PASS — hosted printing and insurance |
| 8 | Evidence answers only part | PASS — hosted phone percentage remains |
| 9 | Unmatched receipt | PASS — hosted retained receipt-only expense; local SQL |
| 10 | Incorrect match → rematch | PASS — local SQL; immutable uploaded/matched/unmatched/matched history |
| 11 | Receipt-only expense / later bank | PASS — hosted automatic treatment convergence; customer-authored treatment preservation separately verified in local SQL |
| 12 | Duplicate upload | PASS — hosted repeat and local idempotency/conflict checks |
| 13 | Irrelevant document → discard/set aside | PASS — hosted unknown-document set-aside; local SQL receipt discard |
| 14 | No receipts available | PASS — hosted normal response; local SQL documentation-only change |
| 15 | Receipts deferred | PASS — local SQL distinct deferral; unit no immediate repeat |
| 16 | Missing documentation, supported expense | PASS — hosted baseline amounts and local SQL preservation |
| 17 | Bank fee evidenced by statement | PASS — 24-transaction routing regression, no personal/receipt turn |
| 18 | Loan statement principal/interest | PASS — hosted exact split; local unknown/stale/mismatch/retry guards |

## Defects found and corrected during this work

1. An automatically assessed receipt could remain separately counted when its bank
   transaction arrived later. The preserved pre-fix control showed a $218.40 excess.
   Exact convergence now transfers its supported allocation atomically. Customer
   decisions use the existing later-source attachment path instead of being copied
   or overwritten. Ambiguous matches remain unresolved.
2. A valid written-month loan payment date was rejected by an ISO-only parser.
   Strict unambiguous written dates now work; invalid dates remain rejected.
3. The direct loan-statement turn required a hidden prior loan-confirmation event.
   The worker now accepts current established business-only context for that known
   loan, or the existing explicit confirmation; unknown/conflicting context remains
   unresolved. Changed retry facts fail closed.
4. Related batch reassessment could finish at different times and expose remaining
   questions prematurely. Batch dependencies now hold those questions until settled.
5. Ordinary phone/internet percentage answers blocked on expensive reassessment.
   Answer and job now commit together; trusted current-version indexed eligibility
   avoids a redundant full read. Stale versions retain canonical fallback.
6. Final fresh-customer verification caught a statement-import regression: the
   new association guard rejected the leased worker after its owner-context
   switch as a customer missing MFA. A local reproduction produced `verified
   session required`. The guard now recognizes the original signed service-role
   JWT; customer AAL2, ownership and lifecycle checks remain. The local 24-record
   importer reproduction and MFA/cross-tenant denial regression pass. The real
   fresh synthetic statement then imported through its normal retry.
7. A fresh import could expose an early completed transaction while other purchases
   in the month were still being assessed. Initial account/month assessment now
   settles before the evidence opportunity/question sequence. Other accounts and
   months remain independent; a recorded none/later/provided response prevents
   routine later activity from re-entering this initial batch gate.

## Performance

See `hosted-answer-timings.json` for response timing headers and browser measurements.
This small sample is not a load-test percentile or a guarantee. It includes
intentional authoritative-next-action waiting, not artificial sleeps.

The twelve initial post-correction samples had p50 **987 ms**, p95 **3,532 ms**.
Phone percentage improved from an earlier **7,129 ms** sample to **893 ms**.
Customer-payment samples were **890–1,007 ms**; hypotheses **1,005–1,021 ms**;
purchase **910 ms**; uncertainty **807 ms**; special deferral **1,264 ms**.
The **3,532 ms** free-text sample spent **2,050.5 ms in authentication**.
The grouped exception sample was **3,034 ms**, including **1,260 ms** in its durable
command and **813.2 ms** loading canonical inputs. Authentication, durability, and
canonical consistency were not weakened to improve the numbers. The sub-second
aspiration is not met for every path.

## Visual / security / preservation

Hosted Home, Check-in and Reports captured at 390, 430 and 1280; no horizontal
overflow. Screenshots inspected for evidence opportunity, scope copy, mobile
question identity and actions. This is not the deferred broad art-direction pass.

Local SQL tests cover ownership, MFA, invalid inputs, exact retry conflicts,
service-worker leases, tenant isolation and customer decision preservation. New
lineage/disposition tables use RLS and explicit restricted grants.

Rick's customer: **102 captured tables identical before/after**, 24 transactions,
11 existing answered events preserved, no projection rebuild or new customer
facts. Worker exclusion configuration untouched. `preservation.json` stores only
non-identifying verification results; full private snapshots are not committed.

His existing plain-language printing answer remains business / Advertising; the
freelance logo-design answer remains business / Contract labor. Both original
texts remain durable business-purpose/history evidence. No rewrite was performed.

## Explicit limits / recommendations

- Use a **second fresh clean-room customer** to certify the new receipt-first
  journey. Keep the first customer intact for later-stage tests. Do not retrofit
  its history or resume workers without Rick's authorization.
- Receipt splitting is certified through unified Send receipts/Send documents.
  The legacy direct single-receipt upload path fails closed on a composite rather
  than silently treating it as one expense; it is not certified as an autosplit path.
- Ambiguous boundaries/multipage relationships require review rather than guesses.
  The hosted multi-receipt fixture is a PDF, not a claim about every phone photograph.
- Customer-treated later-bank attachment and rematching have real local SQL
  coverage, not a claimed hosted browser certification of those exact cases.
- Merchant marks remain reviewed bundled assets (Adobe, Google Workspace, Verizon,
  McDonald's). State Farm has no approved bundled mark and uses the generic fallback.
  No remote logo requests, fabricated marks or new external provider added.
- Faster grouped/no-receipt commands and variable auth latency remain measurable
  performance opportunities. No broad worker rewrite was introduced.
- The last supplied task message ended mid-Part 25. No missing visual scope was
  invented, and no broad art-direction changes were made.

## Validation

Latest application candidate: **2,014 tests passed, 143 skipped**. Skips are not
passes. The explicit local SQL fixtures ran separately and passed, including loan,
receipt lifecycle, evidence opportunity, source regions, scheduling, document
set-aside and durable allocation queue. TypeScript and optimized build passed;
lint had zero errors and 15 existing warnings; scoped secret scan and diff check
passed. Main, Production and Plaid configuration remained untouched.
