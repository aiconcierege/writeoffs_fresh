# Canonical Financial Events & Launch Architecture

_What the engine must understand, what the customer should see, and what we deliberately refuse to build_

WriteOffs understands more accounting than it exposes.

## 1. Purpose and Boundary

This document prevents WriteOffs from drifting into a smaller QuickBooks. The engine must understand the financial reality of a U.S. Schedule C solopreneur while exposing only the facts and actions the owner genuinely needs.

- **UNDERSTAND:** the engine must model or reason about it correctly.
- **EXPOSE:** the customer needs a simple way to see, answer, add or correct it.
- **DON'T BUILD:** the capability belongs to accounting-management software, not the WriteOffs experience.

WriteOffs exists to answer four questions:

1. What did I earn?
2. What did I spend?
3. What can I legitimately deduct?
4. Do I have the records and evidence needed for tax preparation?

## 2. Canonical Principles

- Cash movement is an observation; its accounting meaning must be determined.
- Money in is not automatically income. Money out is not automatically an expense.
- Income can exist without an invoice; invoices are optional business context and billing workflow.
- Invoice, payment, processor settlement and bank deposit are separate events that may be linked.
- A purchase may be an expense, mixed-use purchase, asset, transfer or personal activity.
- Loan payments may contain principal and interest; WriteOffs never invents the split.
- WriteOffs never invents gross revenue from a net processor settlement.
- Questions request facts, not accounting judgments.
- Evidence and provenance support material conclusions.
- Optional job/project context improves memory and matching without becoming project management.
- The longer a customer uses WriteOffs, the fewer unnecessary questions the system should ask.

## 3. Customer-Facing Surface

| Area | UNDERSTAND | EXPOSE | DON'T BUILD |
| --- | --- | --- | --- |
| Home | Outstanding work, completeness, exceptions and financial summary. | Status, quick questions, income/expense/profit. | Reconciliation center or close checklist. |
| Transactions | Money movements and their resolved business meaning. | Plain-language history, evidence/status and corrections. | General ledger, journals or chart of accounts. |
| Receipts / Documents | Evidence can contain facts about purchases, settlements, loans and other events. | Upload; automatic extraction/matching; exceptions only. | Document-management suite. |
| Invoices | Optional billing record that can link customer/job/payment. | Simple create/send/status workflow. | Full A/R, collections CRM or complex billing. |
| Reports | Canonical financial and tax-prep outputs. | Plain-language summaries and exports. | Accountant workbench or report designer. |
| + Add | Events the bank cannot observe. | Money received/spent, receipt/document, mileage, invoice. | Manual journal-entry forms. |

## 4. Financial Event Inventory

### Money Coming In

| Area | UNDERSTAND | EXPOSE | DON'T BUILD |
| --- | --- | --- | --- |
| Customer income | Determine which deposits/payments are revenue and prevent duplicates. | Automatic when confident; factual question when ambiguous. | Require invoice or manual revenue posting. |
| Zelle / ACH | Payer/history/context; distinguish revenue from transfer or other inflow. | Resolve ambiguous first occurrences; learn cautiously. | Assume every incoming transfer is revenue. |
| Invoices | Outstanding amount, customer, optional job/note, payment linkage, cash-basis timing. | Simple invoice and paid/awaiting/canceled status. | A/R ledger or aging-management suite. |
| Processor settlements | Net deposit may differ from gross due to fees/refunds/batching. | Ask gross/fee only when missing; use invoice/document evidence. | Reverse-engineer unsupported gross receipts or process cards. |
| Cash / checks | Income may exist before or without bank deposit; later deposit must not duplicate it. | Fast Record money received; optional context. | Treasury/cash-management system. |
| Transfers / contributions / loans | Incoming cash may be non-income. | Plain-language factual choices when unclear. | Expose equity or liability bookkeeping. |
| Refunds / reimbursements | Link credits to their economic source when possible. | Simple clarification if uncertain. | Classify all credits as revenue. |

### Money Going Out

| Area | UNDERSTAND | EXPOSE | DON'T BUILD |
| --- | --- | --- | --- |
| Business purchase | Purpose, evidence, tax treatment and optional job context. | Usually automatic. | Require category approval for every purchase. |
| Mixed purchase | Business portion differs from total cash movement. | Ask business amount/allocation fact. | Itemize when one allocation resolves it. |
| Owner-paid expense | Business expense may be paid personally. | Receipt/document or fast manual capture. | Require every personal account connection. |
| Credit card | Underlying purchases are expenses; payoff is not another expense. | Encourage card connection when useful. | Treat payoff as one expense. |
| Owner withdrawal | Personal withdrawal is not business expense. | Money I took for myself. | Expose draws/equity ledger. |
| Cash expense / refund | Unbanked expense and later credits need correct linkage. | Fast capture or receipt; mostly automatic matching. | Petty-cash accounting. |
| Contractor payment | Expense plus contractor identity, method and reporting relevance. | Minimal contractor facts and W-9/1099 attention. | Vendor-management/procurement suite. |

### Financing, Assets and Vehicles

| Area | UNDERSTAND | EXPOSE | DON'T BUILD |
| --- | --- | --- | --- |
| Loan payment | Principal and interest may differ; evidence required. | Identify obligation; request statement when needed. | Guess split or build loan servicing. |
| Equipment / asset | Some purchases require special tax treatment. | Ask business use / placed-in-service facts when required. | Fixed-asset management UI. |
| Mileage | Business mileage is not observable from bank data. | Fast mobile-first entry; optional job/note. | Spreadsheet mileage bookkeeping. |
| Vehicle costs | Mileage and actual costs may interact with tax treatment. | Capture evidence; ask facts only when needed. | Expose tax-method mechanics. |
| GPS trip detection | Could reduce manual work later. | Future enhancement. | Launch blocker. |

### Shared-Use and Derived Deductions

| Area | UNDERSTAND | EXPOSE | DON'T BUILD |
| --- | --- | --- | --- |
| Phone / internet | Persistent business-use facts apply across recurring charges. | Ask allocation once; reconfirm when appropriate. | Repeat monthly allocation questions. |
| Home office | Eligibility/calculation depend on facts outside bank feed. | Plain-language factual questions. | Expose tax-code tests/property accounting. |
| Derived deductions | Some deductions arise from facts/calculations, not one transaction. | Understandable result and source facts. | Make customer calculate mechanics. |
| Deduction discovery | Identify potentially missing legitimate deductions. | Careful prompts for missing facts. | Unsupported aggressive deduction generation. |

### Contractors / W-9 / 1099

| Area | UNDERSTAND | EXPOSE | DON'T BUILD |
| --- | --- | --- | --- |
| Contractor identity | Associate payments and preserve payment method. | Minimal identity when needed. | Vendor center. |
| W-9 status | Know whether required information is available. | W-9 needed/on file; secure collection later. | Tax-ID spreadsheet workflow. |
| 1099 tracking | Track potentially reportable payments during year. | YTD attention and tax-time summary. | IRS e-file infrastructure at launch. |
| 1099 filing | Future integration through specialist provider. | Later if demand supports it. | Standalone filing platform now. |

### Jobs, Customers and Context

| Area | UNDERSTAND | EXPOSE | DON'T BUILD |
| --- | --- | --- | --- |
| Job / project | Reusable context can connect income, invoice, expense, receipt and mileage. | Optional address/job/project and note. | Project management, job costing or project P&L. |
| Customer / vendor | Identity improves matching and business memory. | Simple names/context. | CRM or master-data management. |
| Notes | Free-form context helps owner remember events. | Optional note. | Complex tagging system. |

## 5. Documents Are Evidence

Receipts should evolve into a broader evidence layer without becoming a document-management product. Evidence may include receipts, invoices, processor settlement reports, loan statements, W-9s and other tax-time supporting documents.

Normal pattern: obtain document → extract facts → connect evidence to the financial event → ask the owner only when existing data and evidence are insufficient.

## 6. Question-System Doctrine

- Ask only when data, evidence, rules and business memory cannot safely resolve the event.
- Ask “What was this deposit?” rather than “Which account should this post to?”
- Prefer one reusable fact over repeated transaction questions.
- Keep unresolved items in one current queue.
- High-volume customers should experience exception-based bookkeeping.
- Never trade correctness for the appearance of automation.

## 7. Launch Scope

### Must Be Architecturally Supported

- Income independent of invoices
- Simple optional invoices/payment linkage
- Ambiguous inflow/outflow resolution
- Transfers and credit-card payment de-duplication
- Cash/check/manual money received or spent
- Receipt/document evidence and rematching
- Mixed-use allocations
- Potential equipment tax treatment
- Mileage/basic vehicle context
- Loan/interest ambiguity without guessing
- Contractor identity/payment method/W-9/1099 awareness
- Optional customer/job/project/note context
- Persistent business memory and evidence provenance

### Explicitly Not Launch Blockers

- Direct Square/Stripe/PayPal integrations
- WriteOffs payment processing
- Automatic GPS mileage tracking
- Full electronic W-9 request workflow
- 1099 e-filing
- Loan management
- Fixed-asset management
- Project management/job profitability
- CRM, procurement, inventory, payroll, accrual accounting or enterprise features

## 8. Scope-Control Test

Before building any feature, answer these questions:

1. Does WriteOffs need to understand this for correct Schedule C records?
2. Does the customer genuinely need to manage it, or can WriteOffs absorb the complexity?
3. Can we ask for a business fact instead of an accounting decision?
4. Does this reduce future customer work, or create a new software workflow they must maintain?
5. Are we building autonomous bookkeeping—or rebuilding QuickBooks?

## North Star

The customer runs the business. WriteOffs maintains the records.
