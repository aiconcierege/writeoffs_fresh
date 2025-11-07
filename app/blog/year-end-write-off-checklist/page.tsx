import BlogShell from "../../components/BlogShell";
import Callout from "../../components/Callout";
import RuleCard from "../../components/RuleCard";
import ArticleCTA from "../../components/ArticleCTA";

export const metadata = {
  title: "Year-End Write-Off Checklist",
  description: "Tidy records, lock deductions, and prep for Schedule C.",
};

export default function Post() {
  return (
    <BlogShell
      title="Year-End Write-Off Checklist"
      subtitle="A calm, 60-minute pass can prevent headaches later."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <RuleCard
          heading="Reconcile bank & card statements"
          body="Confirm transactions and vendor names. Add missing business context to ambiguous charges."
        />
        <RuleCard
          heading="Attach receipts"
          body="Every deductible transaction should have a receipt or acceptable documentation."
          hint="Email-in and phone capture make this fast."
        />
        <RuleCard
          heading="Mileage log tidy-up"
          body="Confirm your trips and export a PDF/CSV of the log."
        />
        <RuleCard
          heading="Big purchases & software"
          body="Note any equipment and subscriptions. Some items may be expensed; others depreciated."
        />
        <RuleCard
          heading="Home office (if eligible)"
          body="Measure square footage once and save a picture/floor plan. Keep utility records."
        />
        <RuleCard
          heading="Export for your tax pro"
          body="Create a clean CSV + receipts ZIP. Save a backup copy."
        />
      </div>

      <Callout tone="info" title="Beta scope note">
        Bank connections are planned. The initial beta focuses on receipts, Q&A, mileage, and clean exports.
      </Callout>

      <ArticleCTA />
    </BlogShell>
  );
}
