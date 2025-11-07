import BlogShell from "../../components/BlogShell";
import RuleCard from "../../components/RuleCard";
import ArticleCTA from "../../components/ArticleCTA";

export const metadata = {
  title: "Freelancer Write-Off Toolkit",
  description: "A concise starter kit for creators, consultants, and solo pros.",
};

export default function Post() {
  return (
    <BlogShell
      title="Freelancer Write-Off Toolkit"
      subtitle="A concise starter kit for creators, consultants, and solo pros."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <RuleCard heading="Separate bank account" body="Clean separation reduces errors and makes audits calmer." />
        <RuleCard heading="Receipt pipeline" body="Snap/email-in receipts. Add business purpose on capture." />
        <RuleCard heading="Standard categories" body="Keep to IRS-friendly buckets—advertising, supplies, software, travel." />
        <RuleCard heading="Mileage + trips" body="Log business trips; export with totals by period." />
        <RuleCard heading="Q&A sanity check" body="When unsure, ask: “Is this deductible?” Expect hedged, sourced guidance." />
        <RuleCard heading="Quarterly cadence" body="30-min review monthly; deeper tidy-up at quarter end." />
      </div>

      <ArticleCTA />
    </BlogShell>
  );
}
