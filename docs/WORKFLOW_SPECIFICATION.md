WriteOffs Workflow Specification v1.0
Purpose

This document defines the approved customer experience and workflow direction for the WriteOffs MVP.

It supplements the Product Specification and serves as an implementation guardrail for future engineering work.

Where the existing prototype UI conflicts with this document, this workflow specification represents the intended product direction.

This document does not authorize implementation of all workflows at once. Engineering must continue to work only within the currently approved milestone.

1. Product North Star

WriteOffs is not software that helps a solopreneur do bookkeeping.

WriteOffs does the bookkeeping and gives the solopreneur a simple place to supervise it.

Every feature and interaction should be evaluated against one primary question:

Does this reduce the user's time without reducing accounting quality?

WriteOffs should perform work autonomously whenever sufficient evidence exists.

Human interaction should be requested only when:

factual information is unavailable to WriteOffs;
genuine business judgment is required;
confidence is insufficient for a defensible accounting decision; or
the user chooses to inspect or correct WriteOffs' work.

Every interaction must earn its place.

2. Primary Navigation

The intended primary navigation is:

Dashboard
Expenses
Financial Data
Receipts
Reports

Profile and account management should be accessed through a familiar user/avatar control in the upper-right rather than occupying primary navigation.

Review is not a primary navigation destination.

Review is a workflow surfaced through the Dashboard when WriteOffs needs user input.

3. Dashboard

The Dashboard is the primary WriteOffs experience.

A normal user should spend the overwhelming majority of their active WriteOffs time here.

The Dashboard should answer four questions.

3.1 Are my books handled?

Provide a clear status such as:

You're up to date

WriteOffs has reviewed your financial activity through August 11.

Or:

3 things need your attention

About 2 minutes to finish.

The experience should be calm and confidence-building.

3.2 What has WriteOffs done?

Show evidence of work performed by the agent.

Examples:

Transactions reviewed
Business expenses identified
Receipts matched
Potential deductions tracked

Do not add charts or analytics merely because accounting dashboards traditionally contain them.

Dashboard information must be useful.

Historical spending insights may be added later once sufficient historical data exists to make them meaningful.

3.3 What does WriteOffs need from me?

Items requiring human judgment appear as:

Needs Your Attention

This launches the conversational Review workflow.

The Dashboard should never require users to search other areas of the application to discover unresolved bookkeeping questions.

Problems come to the user.

The user does not go looking for problems.

3.4 Quick Actions

The Dashboard should prominently support:

Add Receipt

On mobile:

Take Photo
Choose Existing Photo/File

On desktop:

Choose File
Drag and Drop

The normal workflow should be:

Capture → Upload → Done

Do not require immediate bookkeeping data entry when WriteOffs can extract or determine the information itself.

Add Financial Data

Provide access to:

Connect bank or credit card
Upload CSV transaction file
Upload PDF bank statement
Upload PDF credit-card statement

Plaid is the intended future connected-account provider.

Teller is not the future provider.

4. Weekly Operating Rhythm

WriteOffs should synchronize financial activity continuously and offer review on
the Business's selected weekly check-in day only when relevant activity exists.
Future cadence changes never rewrite historical review periods or confirmations.

Benefits include:

Reducing notification fatigue and user annoyance.
Reducing unnecessary financial-data synchronization activity and associated provider costs.

WriteOffs may process manually supplied data immediately, including:

receipts;
CSV files; and
PDF statements.

However, questions requiring user judgment should normally accumulate for Weekly Review rather than generating constant notifications.

Immediate escalation should be reserved for situations where waiting would materially impair WriteOffs' ability to maintain the books, such as a disconnected financial account.

The operating principle is:

Work quietly. Interrupt predictably. Escalate immediately only when necessary.

5. Weekly Review

Weekly Review should feel like a conversation with an accounting employee, not a bookkeeping queue.

The user interacts in normal business language.

WriteOffs translates those answers into accounting treatment.

5.1 Review Introduction

Example:

Your weekly review is ready

WriteOffs reviewed 52 transactions this week.

We handled 47. We need your help with 5.

About 2 minutes.

Start Review

5.2 Conversational Questions

Ask one question at a time.

Whenever possible, provide quick-answer buttons while still allowing natural-language responses.

Example:

Fleming's — $142.18

This looks like a business meal.

Who was it with?

Client
Prospect
Business associate
Personal

The user may alternatively type:

Lunch with Sarah from Keller Williams about the Thompson listing.

WriteOffs should preserve useful business-purpose evidence and derive the accounting treatment.

Do not ask the user accounting questions when a business-language question will provide the required facts.

6. What Earns a Weekly Review Question

If WriteOffs has enough evidence to make a defensible accounting decision, WriteOffs should make the decision.

Weekly Review is reserved primarily for situations such as:

uncertain business versus personal treatment;
meals requiring business-purpose information;
unclear split transactions;
unmatched receipts requiring payment information;
unusual transactions lacking sufficient context; or
classifications where confidence is genuinely insufficient.

WriteOffs should not routinely ask users to confirm obvious high-confidence classifications.

Example:

Adobe should not repeatedly generate:

We categorized Adobe as Software. Is that correct?

The user can inspect and correct WriteOffs' work from Expenses.

The distinction is:

Weekly Review = WriteOffs needs the user.

Expenses = The user can review WriteOffs.

7. Weekly Expense Confirmation

After conversational questions are resolved, Weekly Review should end with a quick confirmation of the week's completed bookkeeping.

Example:

One last look before we close the week.

We identified 18 business expenses totaling $1,426.37.

Expenses should be presented in a clean format grouped by tax category.

Example:

Advertising — $425.00
Zillow — $300.00
Meta — $125.00
Meals — $186.42
Fleming's — $142.18
Starbucks — $44.24

The user is asked to confirm:

These are actually business expenses.
WriteOffs placed them in the appropriate tax categories.

The user should be able to quickly:

Change Category
Mark Personal / Not Business
Split Expense

If everything looks correct:

Looks Good — Close My Week

Closing the week means the owner reviewed the bookkeeping.

It does not permanently lock the records.

Future corrections remain possible and should be preserved in the audit trail.

8. Expenses

Expenses is the owner's window into the bookkeeping WriteOffs has performed.

Its purpose is:

See what WriteOffs considers a business expense, verify it, and correct anything that is wrong.

Expenses is not intended to become a manual bookkeeping workspace.

8.1 Default View

Default to a useful current period such as This Month.

Provide simple controls for:

Date
This Month
Last Month
This Quarter
This Year
Custom
Category

Filter by tax/Schedule C category.

Search

Search merchant or description.

Status
Business
Excluded / Personal
All
8.2 Expense Information

Each expense should expose the information necessary for review:

Date
Merchant
Amount
Tax category
Receipt/documentation status

Users should be able to open an expense for additional detail.

9. Categories

Tax categorization remains an essential accounting function.

Correct Schedule C classification matters for:

tax reporting;
defensibility;
CPA preparation;
meaningful expense analysis; and
avoiding inappropriate overuse of catch-all categories.

WriteOffs should attempt to select the correct tax category automatically.

The product goal is not to eliminate categories.

The goal is to eliminate unnecessary user categorization work.

Users should be able and encouraged to inspect WriteOffs' classifications and correct mistakes.

10. Source Transactions Are Immutable

Financial Transactions represent source evidence.

If a bank reports:

Costco — $186.42 — August 9

that source record should not be rewritten merely because its bookkeeping treatment changes.

The user may change the accounting interpretation.

The source evidence remains intact.

11. Personal / Excluded Transactions

Users must be able to mark an expense:

Not Business

This does not delete the source Financial Transaction.

Instead, WriteOffs records that the transaction has been excluded from business activity.

Excluded transactions:

disappear from normal business-expense views;
do not contribute to deduction calculations;
do not appear as deductible Schedule C expenses;
remain available through an Excluded/Personal filter; and
can be restored if the user made a mistake.

The audit trail should preserve the decision.

12. Split Expenses

A single source transaction may require multiple bookkeeping allocations.

Example:

Costco — $186.42

$86.42 → Office Expenses
$50.00 → Client Gifts
$50.00 → Personal

Splits may occur:

across multiple business tax categories;
between business and personal; or
both.

The source Financial Transaction remains unchanged.

The bookkeeping allocations must reconcile exactly to the original transaction amount before the split can be saved.

Receipts remain supporting documentation for the underlying transaction and applicable allocations.

Splits should be available but should not dominate the normal workflow because they are expected to be relatively uncommon.

13. Financial Data

Financial Data answers:

What financial activity happened?

It should be clearly separated from receipt/document uploads.

13.1 Connected Accounts

Preferred future method:

Connect bank or credit card

Plaid is the intended provider.

Connected accounts should eventually show:

institution;
account;
connection status; and
last synchronization.
13.2 Uploaded Financial Data

Support:

CSV transaction exports
PDF bank statements
PDF credit-card statements

CSV and PDF ingestion may use different technical pipelines, but the customer should not need to understand those implementation differences.

The resulting financial activity should ultimately enter the same bookkeeping system.

Multiple-file uploads should be supported where practical to reduce onboarding time.

14. PDF Statements

WriteOffs should support transaction extraction from PDF bank and credit-card statements.

Because PDF statement layouts vary and extraction may be less deterministic than structured CSV or connected-account data, WriteOffs should validate extracted activity before treating it as reliable source evidence.

Where possible, statement-level information such as beginning balance, ending balance, and transaction activity may be used for reconciliation.

The customer should not perform manual extraction.

15. Receipts

Receipts answer:

What documentation supports this transaction or expense?

The normal workflow is:

Capture → WriteOffs processes → WriteOffs matches → Done

WriteOffs should:

preserve the original receipt;
extract merchant/date/amount where possible;
identify relevant documentation;
match the receipt to financial activity when possible; and
ask the user only when necessary.

The Receipts page is primarily an inspection and documentation area, not another inbox the user must constantly maintain.

Useful states may include:

Matched
Needs Attention
Unmatched

Unresolved receipt questions should normally surface through Dashboard Review.

16. Cash and Unmatched Receipts

When WriteOffs cannot match a receipt to financial activity, it may ask:

How did you pay?

Possible responses:

Bank/card — it may appear later
Cash
Personal account/card

This allows WriteOffs to correctly handle cash purchases and business purchases made from personal accounts without complicating every receipt upload.

17. Reports

Reports should focus on tax readiness rather than becoming a general accounting suite.

Initial report experiences should include:

Tax Summary

Understandable expense totals organized by relevant tax categories.

Schedule C Summary

Tax-oriented mapping of expenses to applicable Schedule C treatment.

CPA Package

A consolidated tax-preparation handoff containing appropriate:

summaries;
transaction detail;
category treatment;
receipts/documentation;
business-purpose records; and
supporting records.

The objective is:

Your records are organized, documented, and ready for tax filing.

WriteOffs prepares the records.

WriteOffs does not file the tax return.

18. Documentation Health

Where useful, Reports or Dashboard may surface documentation readiness.

Example:

Tax readiness

94% of expenses documented.

7 expenses are missing recommended documentation.

Review Missing Documentation

This should identify actionable gaps rather than create another management dashboard.

19. Profile and Account Management

Profile should be accessed through a familiar avatar/user control rather than primary navigation.

Profile may include:

Profile & Business
General / Realtor selection
Plan & Billing
Preferences
Account/security
Help
Sign Out

Subscription management should be easy to find and straightforward.

20. Launch Verticals

The approved MVP supports:

Realtor
General

Realtor is the primary launch vertical.

General is the fallback for other supported Schedule C solopreneurs.

Driver and Creator are not launch verticals.

The selected vertical influences WriteOffs' internal rules, prompts, examples, and decision-making.

It should not require the customer to manage a category pack or chart of accounts.

21. Onboarding

Onboarding should get WriteOffs working with the minimum necessary setup.

The intended sequence is:

Create account.
Select Realtor or General.
Provide only necessary business/profile information.
Connect or upload financial data.
Optionally add existing receipts.
Enter the Dashboard.

Do not require users to categorize sample expenses to train the system.

WriteOffs should learn naturally from actual user corrections and decisions.

22. AI Learning

User corrections may improve future recommendations for that specific business.

Examples include:

repeated merchant classification;
recurring business-purpose patterns;
personal/business treatment; and
category corrections.

Learning must not override tax/accounting rules or convert ambiguous transactions into unjustifiably confident decisions.

The objective is fewer unnecessary questions over time.

23. Auditability

WriteOffs should preserve the distinction between:

source evidence;
WriteOffs' interpretation;
user-provided facts;
user corrections; and
subsequent accounting treatment.

Changes to bookkeeping treatment should not rewrite historical source evidence.

The system should maintain a defensible record of how significant decisions were reached.

24. Product Scope Discipline

Do not add features merely because traditional accounting software contains them.

The initial product is not intended to become QuickBooks.

Features such as the following should not be introduced without explicit product approval:

accounts receivable;
accounts payable;
inventory;
payroll;
balance-sheet accounting;
budgeting;
forecasting;
complex financial dashboards; or
general small-business ERP functionality.

WriteOffs is focused on eliminating the bookkeeping and documentation burden for Schedule C solopreneurs.

25. Engineering Guardrail

This document defines product direction, not immediate implementation scope.

Codex and other engineering agents must:

Read this document before implementing future product workflows.
Avoid extending legacy prototype behavior where it conflicts with this specification.
Continue implementing only the currently authorized milestone.
Not interpret this document as permission to build all described workflows immediately.
Preserve compatibility where necessary until replacement workflows are intentionally implemented.
Prefer the simplest architecture that supports this approved direction.
Core Principle

WriteOffs does the bookkeeping. The owner supervises.

The customer speaks in business language.

WriteOffs handles the accounting language.

The product succeeds when the owner spends less time doing bookkeeping while maintaining accurate, documented, defensible records.
