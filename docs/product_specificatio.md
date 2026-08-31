# WriteOffs Product Operating Manual
> **SUPERSEDED / HISTORICAL — NOT CURRENT PRODUCT AUTHORITY**
>
> This Version 1.0 operating manual is preserved as historical product rationale.
> It contains obsolete realtor-first, dashboard, onboarding, categorization, receipt,
> and workflow assumptions and must not direct current implementation. Current
> authority is defined by `AGENTS.md`, beginning with
> `docs/WORKFLOW_SPECIFICATION.md` and the canonical documents it references.

**Version:** 1.0
**Status:** Superseded historical reference; not approved for current engineering
**Product:** WriteOffs
**Owner:** AI Concierge Inc.
**Document Type:** Product Requirements Document / Product Operating Manual
**Audience:** Founder, Product, Engineering, Design, QA, Advisors, and Future Leadership

---

# Part I — Company, Product Foundation, Customer, and MVP Scope

## 1. Executive Summary

WriteOffs is an AI-powered bookkeeping and tax-readiness platform built specifically for United States solopreneurs operating as sole proprietors or single-member LLCs taxed on Schedule C.

WriteOffs is not intended to function like traditional bookkeeping software.

Traditional bookkeeping software gives business owners tools and expects them to perform bookkeeping tasks. Users are asked to import and review transactions, assign categories, reconcile accounts, match receipts, maintain documentation, prepare reports, and clean up their books before tax filing.

WriteOffs takes the opposite approach.

WriteOffs is designed to function as an **AI Accounting Employee** that quietly performs bookkeeping on behalf of the business owner. The platform imports financial activity, reads and organizes receipts, identifies business expenses, categorizes purchases, creates transaction splits, preserves supporting documentation, tracks unresolved issues, and prepares tax-ready records throughout the year.

The AI performs routine work automatically. The user becomes involved only when human knowledge, business context, documentation, or judgment is required.

The product is built around a simple outcome:

> The business owner should spend less time thinking about bookkeeping while maintaining organized, defensible, tax-ready financial records.

The MVP will initially serve Realtors because they represent a large, accessible market with significant bookkeeping pain, frequent deductible expenses, relatively straightforward Schedule C accounting, and strong referral potential.

WriteOffs will not file tax returns, replace CPAs, provide legal advice, provide tax advice, process payroll, manage inventory, or attempt to become a complete accounting suite during the MVP phase.

The objective of Version 1.0 is to prove that an AI Accounting Employee can maintain tax-ready books for a Schedule C solopreneur while requiring less than five minutes of user interaction during a normal week.

---

## 2. Mission

WriteOffs exists to eliminate the administrative burden of running a small business.

Small business owners should spend their time serving customers, generating revenue, developing expertise, and building their companies. They should not be forced to become part-time bookkeepers simply because they operate a business.

WriteOffs automates routine bookkeeping, preserves financial documentation, maintains organized records, and prepares the business owner for tax filing throughout the year.

The mission is not to teach customers how to perform bookkeeping.

The mission is to remove bookkeeping from their lives as much as practical.

---

## 3. Vision

Every solopreneur should have an AI Accounting Employee working quietly in the background.

That employee should:

- Observe financial activity.
- Import transactions.
- Read receipts.
- Match receipts to transactions.
- Identify cash purchases.
- Categorize expenses.
- Detect mixed personal and business purchases.
- Recommend transaction splits.
- Preserve original documentation.
- Learn the customer’s business behavior.
- Explain every material bookkeeping recommendation.
- Maintain tax-ready books.
- Prepare organized records for the customer’s CPA or tax professional.
- Ask for assistance only when human judgment is required.

The business owner runs the business.

WriteOffs handles the bookkeeping.

The long-term ideal is that customers rarely think about bookkeeping because the work has already been completed.

---

## 4. Product Definition

WriteOffs is an **AI Accounting Employee for solopreneurs**.

This definition is more important than any individual feature.

WriteOffs is not software that helps the customer perform bookkeeping. WriteOffs performs bookkeeping for the customer.

That distinction governs the product experience, AI behavior, engineering architecture, user interface, communication style, and success metrics.

Traditional accounting software typically begins with a transaction and asks the user to decide what to do with it.

WriteOffs begins with available evidence and asks:

1. What happened?
2. Can the AI complete the bookkeeping automatically?
3. Is additional documentation available?
4. Does the transaction contain more than one economic activity?
5. Is human knowledge required?
6. What is the smallest number of questions necessary to resolve the issue?
7. How can the system avoid asking the same question again?

WriteOffs should feel like a competent employee bringing the owner a short list of genuine exceptions, not like software presenting a long list of bookkeeping tasks.

---

## 5. Product Constitution

Every feature, workflow, screen, engineering decision, and AI behavior must improve at least one of the following:

- Reduce bookkeeping effort.
- Increase automation.
- Improve tax readiness.
- Improve documentation.
- Increase customer trust.

If a proposed feature accomplishes none of these objectives, it does not belong in the MVP.

When a product or engineering decision creates a conflict between technical elegance and customer experience, the customer experience takes priority.

When a decision creates a conflict between adding functionality and preserving simplicity, simplicity takes priority unless the added complexity produces clear and necessary customer value.

When a decision creates a conflict between automation and transparency, the platform must preserve transparency.

---

## 6. Core Product Principles

### 6.1 Automation Before Administration

The AI shall attempt to complete bookkeeping before requesting user input.

Routine work belongs to the AI.

Human knowledge and judgment belong to the customer.

The system should not ask the customer to perform a task that can be completed reliably from available transaction data, receipt data, historical decisions, business context, or prior user behavior.

---

### 6.2 Humans Handle Exceptions

The customer should not review every transaction.

The customer should not manually categorize routine purchases.

The customer should not repeatedly answer questions the AI can infer from previous decisions.

The customer should review only unresolved exceptions requiring human knowledge, documentation, or approval.

---

### 6.3 Exception-Based Weekly Review

Unresolved items should be collected and presented during a Weekly Review whenever possible.

The system should avoid interrupting customers throughout the week.

A normal Weekly Review should communicate:

- How many transactions were reviewed.
- How many were completed automatically.
- How many require attention.
- How long the remaining review is expected to take.

The customer should resolve the small number of remaining exceptions and leave the system feeling finished.

---

### 6.4 Preserve Original Evidence

Original imported financial transactions shall remain immutable.

Original uploaded receipts shall remain immutable.

The system may create derived OCR data, classifications, matches, splits, recommendations, economic events, reports, and audit records, but it shall not overwrite the source evidence.

The customer and tax professional must always be able to see:

- What came from the financial institution.
- What came from the receipt.
- What the AI recommended.
- What the user changed or approved.
- What the final bookkeeping result became.

---

### 6.5 Receipts Are the Primary Source of Purchase Detail

A bank transaction identifies where money was spent.

A receipt identifies what was purchased.

When a usable receipt is available, the AI shall prioritize receipt detail over merchant-level assumptions.

The platform should classify purchased items rather than blindly categorizing the entire merchant transaction.

This principle is especially important for merchants such as:

- Walmart
- Costco
- Target
- Amazon
- Home Depot
- Lowe’s
- Office supply stores
- General retailers

These merchants frequently contain purchases across multiple business categories and personal spending.

---

### 6.6 Economic Events, Not Only Transactions

The fundamental bookkeeping object within WriteOffs is the **Economic Event**.

A Financial Transaction represents a payment event imported from a bank or credit card account.

An Economic Event represents the underlying business activity that should appear in bookkeeping and reports.

An Economic Event may originate from:

- A bank transaction.
- A credit card transaction.
- A cash purchase supported by a receipt.
- A split portion of a mixed transaction.

This distinction allows WriteOffs to represent business activity accurately even when no bank transaction exists or when one financial transaction contains several separate business and personal purchases.

---

### 6.7 User Ownership

The customer owns the books.

The AI recommends.

The customer decides.

Customers retain final authority over:

- Whether a purchase is business or personal.
- Which category applies.
- Whether a transaction should be split.
- Whether a deduction should remain when documentation is missing.
- Whether an AI recommendation should be accepted or overridden.

The AI shall never silently reverse a user-approved decision.

---

### 6.8 Explain Every Recommendation

Every material AI recommendation should answer:

1. What happened?
2. Why does it matter?
3. What should the user do next?

The platform must not operate as a black box.

A user should be able to ask why a transaction was categorized, why a receipt was matched, why a question is being asked, why documentation matters, or why the AI lacks confidence.

The answer should be clear, concise, educational, and grounded in available evidence.

---

### 6.9 Document, Do Not Dictate

WriteOffs should encourage strong documentation without becoming the “IRS police.”

The product should explain documentation risk and recommend best practices.

The user retains the final decision.

When a receipt is missing, WriteOffs should strongly encourage the customer to obtain or upload documentation. However, the platform should not automatically remove the deduction.

The user may decide to:

- Upload the receipt.
- Keep the deduction without a receipt.
- Remove the deduction.
- Mark the transaction personal.

If the user keeps the deduction without supporting documentation, WriteOffs shall preserve the decision and acknowledgement in the audit history.

---

### 6.10 Conservative and Defensible Tax Philosophy

WriteOffs exists to help customers claim every legitimate business deduction while maintaining organized documentation.

The platform should not promote aggressive tax positions, manufacture business purposes, or encourage unsupported deductions.

When multiple IRS-approved methods exist, the MVP should favor the method that is:

- Simpler.
- Easier to understand.
- Easier to document.
- Easier to maintain.
- Less likely to create unnecessary audit complexity.

This principle is the basis for supporting only the IRS Simplified Home Office Method in the MVP.

---

### 6.11 Learn Continuously

Every customer correction should improve future recommendations.

The AI should learn from:

- Merchant history.
- Approved categories.
- Rejected categories.
- Receipt matches.
- Split transactions.
- Business and personal designations.
- Weekly Review responses.
- Business-specific spending patterns.

The number of repetitive questions should decrease over time.

The AI should not ask the same question twice when previous behavior provides a reliable answer and the current circumstances have not materially changed.

---

### 6.12 WriteOffs Should Disappear

The customer should spend less time inside WriteOffs over time.

If a customer must log in every day and manually maintain books, the product has failed its core mission.

The ideal customer experience is:

- The AI works quietly.
- The customer receives a Weekly Review.
- Most items are already completed.
- The customer resolves a few exceptions.
- The books are current.
- The customer closes the application.

---

## 7. Customer Promise

Connect your accounts.

Upload receipts when needed.

Answer a few questions when human judgment is required.

WriteOffs will quietly organize the financial activity, preserve documentation, and keep the business ready for tax filing.

The product promise is not that the customer will receive more bookkeeping tools.

The promise is that the customer will have less bookkeeping work.

---

## 8. Initial Target Customer

### 8.1 Primary Market

The initial MVP serves United States Realtors operating as:

- Sole proprietors.
- Single-member LLCs taxed as Schedule C.

The customer should use cash-basis accounting and should not require payroll, inventory, accrual accounting, or entity-level tax return support.

---

### 8.2 Customer Characteristics

The initial customer commonly has:

- One owner.
- No payroll.
- No inventory.
- One primary business checking account.
- One primary business credit card.
- Frequent deductible purchases.
- Mixed personal and business spending.
- Receipts stored across paper, email, photographs, and vehicles.
- Inconsistent bookkeeping habits.
- An annual relationship with a CPA or tax preparer.
- Limited accounting knowledge.
- A strong desire to avoid bookkeeping.

---

### 8.3 Why Realtors

Realtors are the initial market because they provide a strong combination of:

- Large addressable market.
- Frequent Schedule C filing.
- High volume of deductible expenses.
- Repeated merchant patterns.
- Business meals and travel.
- Advertising and marketing costs.
- Office and technology purchases.
- Home office usage.
- Simple cash-basis bookkeeping relative to more complex businesses.
- Easy access to pilot customers.
- Strong word-of-mouth within brokerages and local professional networks.

The first pilot customers should be individual Realtors rather than large brokerages or CPA firms.

The initial goal is to test product behavior, identify workflow failures, improve accuracy, and validate customer value before pursuing larger distribution relationships.

---

### 8.4 Future Schedule C Markets

Following successful validation with Realtors, WriteOffs may expand to:

- Insurance agents.
- Consultants.
- Marketing professionals.
- Freelancers.
- Photographers.
- Designers.
- Content creators.
- Independent contractors.
- Other low-complexity Schedule C businesses.

These future verticals are not required for MVP launch.

---

## 9. Problem Definition

Traditional bookkeeping products assume that business owners want to perform bookkeeping.

Most solopreneurs do not.

They often delay bookkeeping until tax season because the work is repetitive, confusing, time-consuming, and disconnected from the activities that produce revenue.

Common customer problems include:

- Receipts lost or scattered.
- Personal and business purchases mixed together.
- Transactions left uncategorized.
- Business purpose forgotten.
- Meal documentation incomplete.
- Cash purchases omitted.
- Deductions missed.
- Unsupported deductions retained without awareness of risk.
- CPA cleanup fees.
- Poor visibility throughout the year.
- Stress during tax season.
- Fear of audit or IRS questions.

WriteOffs addresses the problem by working throughout the year rather than waiting for tax season.

---

## 10. Product Objective

The MVP must prove that WriteOffs can maintain tax-ready books for a qualifying Schedule C business while requiring minimal customer involvement.

A successful customer should be able to:

- Create an account.
- Confirm that the business fits the supported profile.
- Connect financial accounts.
- Upload receipts.
- Allow the AI to process activity automatically.
- Complete a short Weekly Review.
- Generate organized reports.
- Deliver a CPA Package without significant year-end cleanup.

The product should reduce both bookkeeping time and documentation gaps.

---

## 11. MVP Scope

### 11.1 Included Business Types

The MVP supports:

- Sole proprietors.
- Single-member LLCs taxed on Schedule C.

---

### 11.2 Unsupported Business Types

The MVP does not support:

- Partnerships filing Form 1065.
- Multi-member LLCs.
- S Corporations.
- C Corporations.
- Nonprofit organizations.
- Trusts.
- Estates.

Users outside the supported profile should not be allowed to continue into a workflow that produces misleading or incomplete books.

The product should explain that their business type is not yet supported and may offer a future-support notification or waitlist.

---

### 11.3 Geographic Scope

The MVP supports United States businesses only.

International accounting and tax treatment are outside scope.

---

### 11.4 Accounting Method

The MVP supports cash-basis bookkeeping.

Accrual accounting is outside scope.

---

### 11.5 Financial Connections

The standard MVP supports:

- One primary bank account.
- One primary business credit card.

Additional account connections may become part of a premium plan or future release.

The product should also support CSV import for historical activity or institutions that cannot be connected.

---

### 11.6 Transaction Import

The platform shall support:

- Automatic transaction import from connected accounts.
- Historical transaction import.
- Manual transaction refresh.
- Scheduled synchronization.
- CSV upload.
- Duplicate detection.
- Connection status.
- Reconnection workflow when an institution link fails.

The synchronization strategy may be optimized for cost and reliability, but the user experience should communicate clearly when books were last updated.

---

### 11.7 Receipt Capture

The MVP supports:

- Mobile receipt photograph upload.
- Desktop image upload.
- PDF upload.
- Drag-and-drop upload.
- Original file preservation.
- OCR extraction.
- Duplicate detection.
- Automatic matching.
- Manual matching.
- Unmatched receipt workflow.
- Cash purchase creation.

Email receipt forwarding and automatic merchant receipt retrieval are outside MVP unless already present and inexpensive to support.

---

### 11.8 AI Categorization

The AI shall:

- Identify merchants.
- Recommend Schedule C categories.
- assign a confidence level.
- Explain recommendations.
- detect possible personal transactions.
- use receipt information when available.
- learn from customer corrections.
- preserve user-approved decisions.
- identify transactions requiring additional information.

---

### 11.9 Weekly Review

The Weekly Review is mandatory MVP functionality.

The AI shall collect unresolved exceptions and present them in a short guided workflow.

Typical Weekly Review items include:

- A bank transaction without a receipt.
- A receipt without a bank transaction.
- A possible cash purchase.
- A low-confidence categorization.
- A meal requiring business purpose.
- A potential personal purchase.
- A proposed split transaction.
- Multiple possible receipt matches.
- A failed account connection.

The Weekly Review should generally require less than five minutes.

---

### 11.10 Split Transactions

Split Transactions are required for MVP.

A user must be able to divide one financial transaction across:

- Multiple business expense categories.
- Business and personal portions.
- Multiple receipt items.
- Separate business purposes when appropriate.

The sum of all split lines must equal the original transaction total.

The original imported transaction must remain unchanged.

---

### 11.11 Cash Purchases

Cash purchases are required for MVP.

A receipt without a matching financial transaction may become a cash purchase Economic Event.

The cash purchase should appear in:

- Expense reports.
- Schedule C summary.
- CPA Package.
- Documentation archive.
- Audit history.

The absence of a bank transaction must not prevent a legitimate business purchase from being recorded.

---

### 11.12 Home Office Deduction

The MVP supports the IRS Simplified Home Office Method only.

The Actual Expense Method is outside scope.

During onboarding, the user should be asked whether they regularly and exclusively use part of the home for business.

If the user indicates a qualifying home office, WriteOffs shall collect the information needed to calculate the simplified deduction, subject to current IRS limitations.

The calculation should be stored and included in annual reports.

The user should be asked annually whether the home office has changed.

The customer must be able to update the home office information if they move, stop using the space, or change the dedicated square footage.

---

### 11.13 Reporting

The MVP shall provide:

- Monthly expense summary.
- Quarterly expense summary.
- Annual expense summary.
- Category reports.
- Schedule C summary.
- Receipt archive.
- CPA Package.

Reports should use plain language and should not require the customer to understand accounting terminology.

---

### 11.14 Audit and Documentation

The MVP shall preserve:

- Original financial transactions.
- Original receipt files.
- OCR data.
- Receipt matching history.
- AI recommendations.
- AI confidence.
- User decisions.
- Category changes.
- Split transaction history.
- Missing receipt acknowledgement.
- Home office calculation history.
- Timestamps.
- Actor identity, distinguishing AI from user action.

Audit history must not be silently deleted or overwritten.

---

## 12. Explicitly Out of Scope for MVP

### 12.1 Tax Filing

The MVP shall not:

- Prepare federal tax returns.
- Prepare state tax returns.
- E-file returns.
- Submit data to the IRS.
- Replace a qualified tax professional.

---

### 12.2 Payroll

The MVP shall not provide:

- Payroll processing.
- Payroll tax calculations.
- W-2 preparation.
- Employee management.
- Contractor payment processing.

---

### 12.3 Inventory and Cost of Goods Sold

The MVP shall not provide:

- Inventory tracking.
- Cost of goods sold calculations.
- Product-level inventory valuation.
- Purchase order management.

Businesses requiring inventory accounting are outside the ideal MVP customer profile.

---

### 12.4 Accounts Receivable

The MVP shall not provide:

- Invoicing.
- Customer billing.
- Collections.
- Payment links.
- Accounts receivable aging.

---

### 12.5 Accounts Payable

The MVP shall not provide:

- Vendor bill management.
- Bill approval workflows.
- Bill payment.
- Accounts payable aging.

---

### 12.6 General Ledger Complexity

The MVP shall not provide:

- Manual journal entries.
- Accrual accounting.
- Fixed asset accounting.
- Depreciation schedules.
- Complex closing procedures.
- Full balance sheet accounting.

---

### 12.7 CRM and Marketing

The MVP shall not provide:

- Lead management.
- Contact management.
- Marketing automation.
- Customer pipelines.
- Brokerage CRM tools.

---

### 12.8 Business Banking

The MVP shall not provide:

- Bank accounts.
- Debit cards.
- Lending.
- Credit products.
- Payment processing.

---

### 12.9 Tax Advice

WriteOffs may provide educational explanations based on IRS guidance and general bookkeeping practices.

WriteOffs shall not present itself as providing personalized legal or tax advice.

When a question requires professional judgment, the product should direct the user to a qualified tax professional.

---

## 13. MVP Success Definition

The MVP is successful when a typical Realtor can:

- Complete onboarding without assistance.
- Connect financial accounts in less than ten minutes.
- Upload receipts from a phone.
- Allow the AI to categorize most purchases automatically.
- Complete Weekly Review in less than five minutes.
- Record cash purchases.
- Approve or modify split transactions.
- Understand why the AI made a recommendation.
- Keep or remove a deduction when a receipt is missing.
- Generate organized year-to-date reports.
- Generate a complete CPA Package.
- Arrive at tax season without significant bookkeeping cleanup.

The product is not successful merely because all features exist.

The product is successful when customer effort decreases and tax readiness improves.

---

## 14. Product Boundaries

WriteOffs is intentionally narrow during MVP.

The product must resist pressure to become a broad small-business operating system before the core bookkeeping agent is validated.

Every proposed addition should be evaluated against the following question:

> Does this reduce bookkeeping effort for the supported Schedule C customer?

If the answer is no, the feature should be placed in the roadmap rather than the MVP.

The product should not chase “shiny” AI capabilities to appear differentiated.

The differentiation should come from the quality of the underlying product:

- The AI works first.
- The system preserves evidence.
- Receipts drive accurate bookkeeping.
- Mixed purchases are handled correctly.
- Customers review only exceptions.
- The AI learns the customer’s business.
- Records remain organized and tax-ready.

---

## 15. Initial Product Experience Summary

A Realtor signs up.

The Realtor confirms that the business is a supported Schedule C business.

The Realtor answers onboarding questions.

The Realtor indicates whether a qualifying home office exists.

The Realtor connects a bank account and a business credit card.

WriteOffs imports activity.

The AI reviews transactions.

Receipts are uploaded over time.

The AI matches receipts, reads line items, creates Economic Events, recommends categories, and proposes splits.

Most transactions are completed automatically.

Once per week, the customer receives a review such as:

> I reviewed 31 new transactions.
> 28 were completed automatically.
> 3 need your attention.

The customer resolves the exceptions:

- A meal needs a business purpose.
- A Walmart receipt needs split approval.
- A bank transaction lacks a receipt.

The customer completes the review and closes the application.

At year-end, the customer selects **Generate CPA Package**.

The business is ready for tax preparation.

---

*End of Part I*

# WriteOffs Product Operating Manual
**Version:** 1.0

# PART II – User Journey, AI Behavior, and Weekly Review

## 16. User Journey

### Guiding Philosophy

The onboarding and day-to-day experience should require as little effort as possible.

The customer should never feel like they are learning accounting software.

Instead, they should feel like they are hiring and supervising a bookkeeping employee.

The platform should progressively disappear into the background as the AI learns the business.

---

## Step 1 – Account Creation

The customer creates an account.

Supported authentication methods may evolve, but the experience should be simple, secure, and require minimal information.

Immediately after authentication the customer begins guided onboarding.

---

## Step 2 – Business Qualification

WriteOffs confirms that the business is appropriate for the MVP.

Collect:

- Business name
- Entity type
- Industry
- State
- Accounting method
- Tax year

If the business is outside MVP scope, explain why and provide the opportunity to join a future waitlist.

Do not allow unsupported businesses into workflows that produce inaccurate books.

---

## Step 3 – Home Office

Ask:

Do you regularly and exclusively use part of your home for business?

Options:

- Yes
- No
- I'm not sure

If Yes:

Collect only the information necessary for the IRS Simplified Home Office Method.

Calculate the annual deduction.

Store the information.

Automatically include the deduction in annual reporting.

The customer should not need to revisit this information unless circumstances change.

---

## Step 4 – Financial Connections

The customer connects:

- Primary checking account
- Primary business credit card

The platform begins importing historical activity.

Supported options:

- Current tax year
- Previous 30 days
- Custom range

The customer should not manually import transactions unless using CSV import.

---

## Step 5 – Initial AI Processing

Without customer involvement, the AI shall:

- Import transactions
- Identify merchants
- Detect duplicates
- Match receipts
- OCR receipts
- Classify receipt items
- Recommend categories
- Recommend split transactions
- Calculate confidence
- Detect missing documentation
- Build initial reports

No bookkeeping should be required while this processing occurs.

---

## Step 6 – Dashboard

The Dashboard answers one question:

**What requires my attention?**

Primary information:

- Weekly Review
- Tax Readiness
- Missing Receipts
- AI Questions
- Recent Activity

The Dashboard should not prioritize analytics over action.

---

## Step 7 – Weekly Review

The customer completes bookkeeping through Weekly Review.

Everything possible should already be completed.

Only unresolved items remain.

---

## Step 8 – Reporting

Reports remain continuously available.

Customers should never need to manually close books before viewing financial information.

---

## Step 9 – Year End

Customer selects:

Generate CPA Package.

WriteOffs prepares organized records.

No additional bookkeeping should be required.

---

## 17. AI Accounting Employee

### Purpose

The AI Accounting Employee performs bookkeeping rather than assisting with bookkeeping.

Its objective is reducing administrative work while maintaining complete, defensible records.

---

### Primary Responsibilities

The AI shall:

- Import financial activity
- Read receipts
- Match documentation
- Categorize expenses
- Detect split transactions
- Preserve documentation
- Learn business behavior
- Prepare reports
- Prepare CPA Package
- Explain recommendations

---

### Decision Hierarchy

#### Level 1 – Automate

If sufficient evidence exists:

Complete bookkeeping automatically.

---

#### Level 2 – Research

Review:

- Historical customer decisions
- Merchant history
- Receipt history
- Industry behavior
- Business profile
- Prior Weekly Reviews

Attempt resolution without customer involvement.

---

#### Level 3 – Ask

If uncertainty remains:

Queue the issue for Weekly Review.

Avoid interrupting customers immediately unless a critical operational issue exists.

---

### Confidence Levels

High Confidence

Bookkeeping completed automatically.

Medium Confidence

Bookkeeping completed automatically and surfaced during Weekly Review for optional review.

Low Confidence

Request customer input before finalizing.

---

### Continuous Learning

The AI continuously improves by learning from:

- Customer corrections
- Approved categories
- Merchant patterns
- Receipt item classifications
- Split transactions
- Personal expense identification

The AI should become increasingly autonomous.

---

### Never Ask Twice

If prior customer behavior provides a reliable answer and circumstances have not materially changed, the AI should use that information instead of asking again.

Customers should feel that the AI remembers their business.

---

### AI Safety Rules

The AI shall never:

- Invent receipts
- Invent documentation
- Invent business purposes
- Override customer decisions
- Delete audit history
- Guess when confidence is low
- Present legal or tax advice as authoritative

---

## 18. Weekly Review

### Philosophy

Weekly Review is the primary customer interaction.

Routine bookkeeping belongs to the AI.

Weekly Review belongs to the customer.

---

### Typical Weekly Review Items

- Missing receipt
- Receipt without transaction
- Transaction without receipt
- Meal documentation
- Split transaction approval
- Personal/business confirmation
- Low-confidence categorization
- Multiple receipt matches

Questions should be presented individually.

Minimize typing.

Prefer buttons and selections.

---

### Completion

Upon completion:

- Books update
- Reports refresh
- Audit history updates
- Tax Readiness recalculates

The customer should clearly understand that bookkeeping is complete until new activity occurs.

*End of Detailed Part 02*






# WriteOffs Product Operating Manual
**Version:** 1.0

# PART III – Functional Requirements, Business Rules, Receipt Intelligence & Split Transactions

## 19. Functional Requirements

### Philosophy

Functional requirements define what the platform must do. Every requirement should be testable and support the core mission of reducing bookkeeping effort while improving documentation and tax readiness.

### Transaction Management

The platform shall:

- Import financial transactions automatically.
- Preserve original transaction data.
- Detect duplicate transactions.
- Allow transaction search and filtering.
- Associate transactions with Economic Events.
- Display complete audit history.

Each transaction shall display:

- Merchant
- Date
- Amount
- Category
- Confidence
- Receipt status
- AI explanation
- Customer overrides

---

### Receipt Management

Customers shall be able to:

- Upload receipts from desktop.
- Upload receipts from mobile.
- Upload PDFs.
- Replace receipts.
- Delete receipts.
- Download original receipts.

The AI shall:

- OCR receipts.
- Extract merchant information.
- Extract purchase date.
- Extract totals.
- Extract line items.
- Detect duplicate receipts.
- Attempt automatic matching.

Original uploaded receipts shall always remain available.

---

### Reporting

Reports shall be generated without requiring additional bookkeeping.

Supported reports include:

- Monthly Summary
- Quarterly Summary
- Annual Summary
- Category Reports
- Schedule C Summary
- Receipt Archive
- CPA Package

---

## 20. Business Rules

### AI First

Automation shall always be attempted before customer interaction.

---

### Customer Ownership

Customers own the books.

The AI recommends.

Customers approve.

---

### Missing Receipts

When a deductible transaction lacks supporting documentation, the AI shall present the issue during Weekly Review.

Customers may:

- Upload receipt
- Keep deduction
- Remove deduction
- Mark personal

If the deduction is retained without documentation:

- Explain documentation risk.
- Preserve customer acknowledgement.
- Record the decision within the audit trail.

---

### Receipt Without Transaction

Receipts without matching financial transactions remain available for future matching.

Customers may:

- Match manually.
- Record as cash purchase.
- Leave unmatched.
- Delete.

Cash purchases are fully supported within the MVP.

---

### Conservative Tax Philosophy

WriteOffs encourages every legitimate deduction while emphasizing complete documentation.

The platform should favor simple, defensible bookkeeping rather than aggressive tax positions.

---

## 21. Receipt Intelligence

### Philosophy

Receipts contain richer bookkeeping information than bank transactions.

Whenever available, receipt information shall take precedence over merchant assumptions.

The AI should classify purchased items rather than categorizing merchants.

---

### Receipt Workflow

1. Preserve original receipt.
2. OCR receipt.
3. Validate totals.
4. Match transaction.
5. Classify line items.
6. Recommend transaction split.
7. Learn customer behavior.

---

### Item-Level Classification

Examples:

Office Depot

- Printer paper → Office Supplies
- Desk chair → Office Furniture

Walmart

- Printer ink → Office Supplies
- Camera battery → Equipment
- Milk → Personal

The AI should recommend bookkeeping based upon purchased items.

---

## 22. Split Transaction Engine

### Purpose

Mixed purchases are common.

The platform shall accurately represent business and personal spending within a single transaction.

---

### Customer Capabilities

Customers may:

- Accept AI split.
- Modify AI split.
- Create manual splits.
- Delete split lines.

Each split shall contain:

- Amount
- Category
- Business purpose
- Business/personal designation
- Documentation

The sum of all split lines shall equal the original transaction.

---

### AI Recommendations

The AI shall recommend transaction splits whenever receipt intelligence indicates multiple bookkeeping categories.

Recommendations include:

- Suggested amounts
- Suggested categories
- Confidence
- Explanation

Customers retain final approval.

---

### Learning

Approved split transactions improve future recommendations for recurring merchants and purchasing behavior.

*End of Detailed Part 03*

























# WriteOffs Product Operating Manual
**Version:** 1.0

# PART IV – Core Data Model, Security, Engineering Standards & Acceptance Criteria

## 23. Core Data Model

### Philosophy

WriteOffs models business activity rather than accounting entries.

Every core object represents a meaningful business concept.

The platform should be understandable by engineers, product managers, CPAs, and future AI systems.

---

### User

Represents the authenticated account owner.

Attributes include:

- User ID
- Name
- Email
- Authentication Provider
- Notification Preferences
- Subscription Status

The MVP supports one business per user.

---

### Business

Stores:

- Business Name
- Entity Type
- Industry
- State
- Accounting Method
- Tax Year
- Home Office Configuration

The Business object is the parent object for bookkeeping.

---

### Financial Account

Represents connected institutions.

Examples:

- Checking
- Credit Card

Stores:

- Institution
- Account Type
- Last Sync
- Connection Status

---

### Financial Transaction

Represents imported payment activity.

Stores:

- Merchant
- Amount
- Date
- Institution
- Original Description
- Transaction ID

Transactions remain immutable.

---

### Economic Event

Represents bookkeeping activity.

Stores:

- Category
- Deductibility
- Business Purpose
- Documentation
- Confidence
- Customer Approval

Economic Events may originate from:

- Bank transactions
- Credit card transactions
- Cash purchases

Reports operate from Economic Events rather than Financial Transactions.

---

### Receipt

Stores:

- Original File
- OCR Data
- Merchant
- Date
- Total
- Confidence

Receipts remain immutable.

---

### Receipt Item

Stores:

- Description
- Quantity
- Amount
- Suggested Category
- Confidence

Receipt Items support intelligent split transactions.

---

### AI Recommendation

Stores:

- Recommendation
- Explanation
- Confidence
- Supporting Evidence
- Customer Response

Every recommendation becomes part of the permanent bookkeeping history.

---

### Audit Event

Stores:

- Timestamp
- Actor
- Action
- Previous Value
- New Value
- Explanation

Audit Events are immutable.

---

## 24. Security

### Philosophy

Trust is a product feature.

Customer financial information must be protected throughout the system.

---

### Authentication

Support:

- Secure login
- Password reset
- Session management

Sensitive actions may require reauthentication.

---

### Authorization

Customers may access only businesses they own.

Future collaboration features require explicit permission models.

---

### Encryption

Encrypt:

- Data in transit
- Data at rest

Passwords shall never be stored in plain text.

---

### Data Ownership

Customers own their financial information.

WriteOffs stores data solely to perform bookkeeping.

Customer financial information shall never be sold or used for advertising.

---

### Audit Preservation

Every bookkeeping action must answer:

- Who?
- What?
- When?
- Why?
- AI or Customer?

Audit history shall never be silently altered.

---

## 25. Non-Functional Requirements

Engineering priorities:

- Reliability
- Maintainability
- Simplicity
- Performance
- Scalability

Target performance:

- Dashboard <2 seconds
- Weekly Review <2 seconds
- Transaction Search <1 second

Long-running AI processes should execute asynchronously.

---

## 26. Engineering Principles

Engineering should prioritize:

1. Customer Experience
2. Product Philosophy
3. Simplicity
4. Reliability
5. Maintainability
6. Performance

When uncertain ask:

- Does this reduce bookkeeping?
- Does this improve trust?
- Can the AI explain this?
- Is original evidence preserved?
- Would a human bookkeeper automate this?

---

## 27. Acceptance Criteria

Version 1.0 is complete when:

Customers can:

- Complete onboarding
- Connect financial accounts
- Upload receipts
- Approve split transactions
- Record cash purchases
- Complete Weekly Review
- Generate CPA Package

The AI can:

- Categorize most transactions automatically
- Match most receipts automatically
- Learn customer behavior
- Reduce customer effort over time

The system preserves:

- Original transactions
- Original receipts
- AI recommendations
- Customer decisions
- Audit history

*End of Detailed Part 04*





































# WriteOffs Product Operating Manual
**Version:** 1.0

# APPENDIX – Customer Scenarios & UX Standards

## 32. Customer Success Scenarios

### Scenario 1 – First-Time Customer

A new Realtor creates an account.

Within fifteen minutes the customer should be able to:

- Complete onboarding.
- Configure the business.
- Configure the simplified home office deduction.
- Connect financial accounts.
- Understand that WriteOffs will perform bookkeeping automatically.

The customer should leave onboarding confident rather than overwhelmed.

---

### Scenario 2 – Weekly Review

One week later the customer receives:

> Your Weekly Review is ready.

The AI reports:

- 31 transactions reviewed.
- 28 completed automatically.
- 3 require attention.

The customer resolves:

- One missing receipt.
- One business meal.
- One split transaction.

Total review time:

Less than three minutes.

---

### Scenario 3 – Cash Purchase

The customer buys business supplies using cash.

A receipt is uploaded.

The AI creates an Economic Event even though no imported financial transaction exists.

The purchase appears in reports and the CPA Package.

---

### Scenario 4 – Mixed Purchase

The customer shops at Walmart.

The receipt contains:

- Printer Ink
- Camera Bag
- Groceries

The AI proposes:

- Office Supplies
- Equipment
- Personal

The customer reviews and approves the recommendation.

Future Walmart purchases become more accurate.

---

### Scenario 5 – Missing Receipt

A deductible expense lacks documentation.

During Weekly Review the AI explains why receipts matter and offers the customer four choices:

- Upload receipt
- Keep deduction
- Remove deduction
- Mark personal

The customer retains final authority.

---

### Scenario 6 – Tax Season

The customer generates a CPA Package.

No additional bookkeeping is required.

The CPA receives organized records rather than raw transactions.

---

## 33. User Experience Standards

The product should feel calm, predictable, and trustworthy.

Every screen should have one primary purpose.

Customers should never wonder what action is expected next.

---

### Design Principles

- Reduce typing.
- Reduce clicks.
- Prefer selections over free text.
- Present one decision at a time.
- Explain recommendations.
- Avoid accounting jargon.
- Avoid unnecessary alerts.

---

### Success Messages

Examples:

- Your books are up to date.
- Weekly Review complete.
- Receipt matched successfully.
- Books updated.
- CPA Package generated.

Customers should leave each workflow with confidence.

---

## 34. AI Communication Standards

The AI should be:

- Professional
- Friendly
- Helpful
- Educational
- Respectful

The AI should never:

- Shame customers.
- Use unnecessary accounting jargon.
- Guess when uncertain.
- Create fear.

Every response should explain:

- What happened.
- Why it matters.
- What happens next.

---

## 35. Final Product Statement

WriteOffs is an AI Accounting Employee designed to eliminate bookkeeping as an administrative burden for United States solopreneurs.

Every feature should reduce bookkeeping effort, strengthen documentation, improve tax readiness, or increase customer trust.

If the product accomplishes those goals, it fulfills its mission.

**End of Appendix**
