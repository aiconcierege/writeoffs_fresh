# Tax Rules v1 — candidate catalog and safety matrix

Status: **candidate specification; no entries are active**. Research target: federal
tax year 2025. “Full” and “zero” below are proposed downstream tax-preparation
outcomes only. Every row preserves the full economic business portion on the P&L.
Authority codes refer to `TAX_RULES_V1_AUTHORITIES.md`.

## Universal taxonomy

| # | Proposed rule / customer category | Schedule C grouping | Tier | Facts required before evaluation | Proposed tax outcome / adjustment | Special context and fail-closed behavior | Authority |
|---:|---|---|:---:|---|---|---|---|
| 1 | `tax.advertising` / Advertising | Line 8 | A | Business use; promotional purpose; item/service nature | Full business allocation | Capital asset, lobbying/political, personal, or unclear promotion → unresolved | A1, A2 |
| 2 | `tax.commissions-fees` / Commissions and fees | Line 10 | B | Payee/service; revenue or business-service relationship; reimbursement | Full when ordinary/current | Asset acquisition, worker reporting, or unclear fee → unresolved/special | A1, A2 |
| 3 | `tax.contract-labor` / Contract labor | Line 11 | B | Service performed; business purpose; payee; amount | Full ordinary business amount | Worker status and information reporting remain separate; no automatic employee/contractor conclusion | A1, A2 |
| 4 | `tax.business-insurance` / Business insurance | Line 15 | B | Policy/coverage type; covered period; business use | Full eligible business premium | Health, home, vehicle, personal, prepaid, or mixed coverage → route to applicable special facts | A2, A3 |
| 5 | `tax.business-interest` / Business interest | Lines 16a/16b | B | Debt/account purpose; period; business allocation | Full eligible business interest | Personal debt, capitalized interest, prepaid/future-year amount, or mixed debt → unresolved | A2, A3 |
| 6 | `tax.legal-professional` / Legal and professional services | Line 17 | B | Provider type; matter/purpose; business allocation | Full current operating portion | Asset acquisition, startup, personal matter, settlement, or capital transaction → unresolved/special | A2, A3 |
| 7 | `tax.office-expense` / Office expense | Line 18 | A | Consumable/current item; purpose; business use | Full business allocation | Durable property, inventory, personal/mixed item → unresolved or another candidate | A2 |
| 8 | `tax.supplies` / Supplies | Line 22 | A | Consumable material; purpose; business use; not inventory | Full business allocation | Durable asset, inventory/COGS, or personal use → unresolved/special | A2, A3 |
| 9 | `tax.postage-shipping` / Postage and shipping | Line 18 or 27b by supported mapping | A | Shipment/service nature; business purpose; reimbursement | Full business allocation | Inventory/COGS, client reimbursement, or personal shipment → unresolved | A2 |
| 10 | `tax.software-cloud` / Software and cloud services | Line 18 or 27b | A | Service identity; business purpose; service period; business use | Full current business portion | Multi-year right, acquisition/intangible, durable equipment, or mixed use → unresolved/special | A2, A3 |
| 11 | `tax.payment-bank-fees` / Bank and payment fees | Line 27b | A | Fee nature; business account/transaction connection | Full business fee | Interest, penalty, personal account, capital transaction, or chargeback principal → unresolved | A3 |
| 12 | `tax.business-license` / Business licenses and regulatory fees | Line 23 | A | Agency; license/fee type; current business connection | Full ordinary current fee | Initial/startup, penalty, personal, tax, multi-year, or asset right → unresolved/special | A2, A3 |
| 13 | `tax.professional-dues` / Professional dues and publications | Line 27b | B | Organization/publication type; current-business connection; lobbying notice | Full eligible portion | Social/athletic/entertainment club or political/lobbying portion → zero/unresolved; merchant alone insufficient | A3, A6 |
| 14 | `tax.business-rent` / Rent of business property | Line 20b | B | Property; business use; payment is for use only; no title/equity | Full business allocation | Home use, related party/unreasonable amount, equity/title, advance rent → unresolved/special | A1, A2, A3 |
| 15 | `tax.equipment-lease` / Equipment lease | Line 20a/20b | B | Equipment; lease term/payment; business use; no ownership | Full current business portion | Purchase/equity, vehicle, prepaid term, mixed use → unresolved/special | A2, A3 |
| 16 | `tax.utilities` / Business utilities | Line 25 | B | Dedicated business premises/service; covered period | Full business allocation | Home-office or mixed service → allocation/special calculation | A2, A3 |
| 17 | `tax.phone-internet` / Phone and internet | Line 25 or 27b | B | Service; exact business/personal use; covered period | Full established business portion | Unresolved use or home-office bundling → unresolved; no tax limit may alter economic split | A2, A3 |
| 18 | `tax.repairs-maintenance` / Repairs and maintenance | Line 21 | B | Property/unit; work performed; restore versus improve; business use | Full qualifying repair portion | Betterment, restoration, adaptation, acquisition defect, or major component → Tier C capitalization | A2, A7 |
| 19 | `tax.travel` / Business travel | Line 24a | C | Tax home; away-from-home status; dates; destination; trip purpose; business/personal days; costs; reimbursement | Trip-level eligible amount; no ordinary transaction result | Mixed/foreign/convention/per-diem facts and section 274 records require trip context | A2, A4, A6 |
| 20 | `tax.business-meals` / Business meals | Line 24b | B | Business purpose/relationship; attendee; taxpayer present; not lavish; meal separated from entertainment; reimbursement/exception facts | Proposed 2025 standard outcome: 50% of the qualified business-meal amount downstream; exceptions require separate reviewed rules | Missing context → unresolved; never reduce P&L expense | A2, A4, A6 |
| 21 | `tax.entertainment` / Entertainment | No ordinary deduction; line 27b only if reviewed exception | D | Activity/facility nature; business connection; separately stated food; statutory exception facts | Candidate zero for ordinary entertainment; separately stated meal evaluated separately | Employee/public/customer exceptions need facts beyond v1; preserve business economics | A3, A4, A6 |
| 22 | `tax.business-gifts` / Business gifts | Line 27b | C | Recipient; relationship/purpose; date; description; direct/indirect recipient; incidental cost; annual recipient total | Proposed 2025 outcome: section 274's $25 direct/indirect recipient-year limit, with separately reviewed exceptions | Annual aggregation, spouses, gift-vs-entertainment, promotional-item exceptions → special | A3, A4, A6 |
| 23 | `tax.vehicle` / Car and local transportation | Line 9 / Form 4562 | C | Vehicle; ownership/lease; placed-in-service; mileage; total/business use; trip purpose; commuting; method history; parking/tolls | Vehicle-year method calculation | Never infer “gas deductible”; commuting/personal excluded economically; method/elections remain special | A2, A4, A5, A13 |
| 24 | `tax.depreciable-property` / Equipment and depreciable property | Line 13 / Form 4562 | C | Asset identity; basis; acquisition and placed-in-service dates; business use; property class; prior use; disposition | Depreciation/possible capitalization calculation | No “equipment = full deduction”; listed property and recapture require history | A2, A5, A7 |
| 25 | `tax.section-179` / Section 179 election | Line 13 / Form 4562 | C | All asset facts; eligibility; purchase; placed in service; taxpayer-wide property totals; business income; election; carryover | Taxpayer-year elected amount | 2025 limits and vehicle constraints are annual/versioned; no transaction auto-rule | A2, A5 |
| 26 | `tax.home-office` / Business use of home | Line 30 / Form 8829 | C | Regular/exclusive use or exception; principal place/client/separate structure; area; period; direct/indirect costs; method; income limit/carryover | Home/year calculation | Simplified versus actual method and limitations require annual context | A2, A8 |
| 27 | `tax.education-training` / Education and training | Line 27b | B | Current trade; course; maintains/improves or legally required; minimum requirement; new-trade qualification; purpose | Full qualifying business portion | New trade, minimum qualification, personal education, or indefinite absence → zero/unresolved | A3, A9 |
| 28 | `tax.startup-costs` / Startup and pre-opening costs | Line 27b / Form 4562 | C | Cost nature; same prospective business; active-business start date; totals; election; prior amortization | Proposed 2025 framework: up to $5,000, reduced over $50,000 aggregate costs, with remainder over 180 months | Never infer from “before first revenue”; active start and aggregate phaseout matter | A5, A10, A11 |
| 29 | `tax.business-taxes` / Business taxes and government fees | Line 23 | B | Government; payment type; jurisdiction; business connection; period | Full eligible business tax/fee | Federal income/SE tax, personal tax, penalty, capital/asset tax, or nonbusiness fee → zero/unresolved/other basis | A2, A3 |
| 30 | `tax.charitable-political` / Charitable or political payment | Not an ordinary Schedule C deduction | D | Recipient/purpose; charitable versus advertising consideration; political/lobbying character | Candidate zero as Schedule C business deduction | Possible personal charitable treatment is outside this engine; do not label Personal merely to zero tax amount | A3, A12 |
| 31 | `tax.fines-penalties` / Fines and penalties | Line 27b only for qualifying private contract amounts | B | Payee; governmental status; violation/investigation versus private contract; purpose | Candidate zero for covered governmental violation; private contract penalty may be ordinary | Ambiguous government payment → unresolved; full business economic amount remains | A3, A12 |
| 32 | `tax.other-expense` / Other business expense | Line 27b | D | Specific nature and purpose; business use; proof no named/special rule applies | Unresolved until a reviewed specific rule applies | Not an ordinary-and-necessary catch-all automation rule | A1, A2, A3 |

## Automation recommendations

### Tier A — review for eventual automatic activation (7)

Advertising, office expense, consumable supplies, postage/shipping, routine
single-period software/cloud service, payment/bank service fees, and ordinary
current business licenses. Each still requires resolved business use/purpose and
negative checks for capital, inventory, personal, reimbursement, and special facts.

### Tier B — approve only with factual gates (15)

Commissions/fees, contract labor, insurance, interest, legal/professional services,
professional dues/publications, business rent, equipment lease, utilities,
phone/internet, repairs/maintenance, meals, education/training, business taxes, and
fines/penalties. No merchant-only rule is recommended.

### Tier C — special or annual calculation (7)

Travel, gifts, vehicle, depreciable property, Section 179, home office, and startup
costs. Capture facts and evidence, but do not produce an ordinary transaction-level
deduction until a separately approved calculator exists.

### Tier D — manual/unsupported for automatic v1 (3)

Entertainment, charitable/political payments, and uncategorized “other” expenses.
Explicit zero-deduction rules may later be appropriate for well-proven entertainment
or political facts, but they require separate approval and must preserve business
bookkeeping treatment.

## Realtor context evidence — no separate rules

| Context example | Universal candidates it may support | What remains necessary |
|---|---|---|
| MLS access, e-signature, CRM | `tax.software-cloud`, `tax.professional-dues` | Actual service, business account/use, period, lobbying notice if dues |
| Listing signs, flyers, digital leads | `tax.advertising`, `tax.supplies` | Promotional/listing purpose; durable asset or inventory conflict |
| Listing photography/video | `tax.advertising`, `tax.legal-professional` | Service nature and listing/business purpose |
| Lockboxes | `tax.supplies`, `tax.depreciable-property` | Item longevity, ownership, placed-in-service facts |
| Transaction coordinator | `tax.contract-labor`, `tax.legal-professional` | Service relationship; reporting/worker questions remain separate |
| Association/board dues | `tax.professional-dues`, `tax.business-license` | Organization/fee nature and lobbying/nonbusiness portion |
| Continuing education/licensing | `tax.education-training`, `tax.business-license` | Current-work versus initial/new-trade facts |
| Open-house/staging costs | `tax.advertising`, `tax.supplies`, `tax.legal-professional`, `tax.other-expense` | Ownership, reimbursement, gift/meal, capital, and actual service facts |
| Client meals and gifts | `tax.business-meals`, `tax.business-gifts` | Attendee/recipient, relationship, purpose, annual/special facts |
| Driving to listings/clients | `tax.vehicle`, `tax.travel` | Contemporaneous trip purpose, mileage, commuting, vehicle method |

Profile context raises or lowers evidentiary confidence only. It cannot establish
business use, activate a rule, or create profile-specific tax treatment.
