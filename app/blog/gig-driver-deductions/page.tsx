import BlogShell from "../../components/BlogShell";
import Callout from "../../components/Callout";
import RuleCard from "../../components/RuleCard";
import ArticleCTA from "../../components/ArticleCTA";

export const metadata = {
  title: "Overlooked Tax Deductions for Gig Drivers",
  description: "A practical checklist for drivers. Many items are often deductible with proper records.",
};

export default function Post() {
  return (
    <BlogShell
      title="Overlooked Tax Deductions for Gig Drivers"
      subtitle="This is a practical checklist. Many items are often deductible when used for business and properly documented."
    >
      <Callout tone="info" title="Keep it simple, keep it consistent.">
        Track the business purpose, date, amount, and vendor. Attach receipts and keep a mileage log.
      </Callout>

      <div className="grid gap-4 md:grid-cols-2">
        <RuleCard
          heading="Mileage (standard) or actual vehicle costs"
          body="Most drivers pick the standard mileage rate for simplicity. Actual expenses can make sense with high costs."
          hint="Pick one method per vehicle per year."
        />
        <RuleCard
          heading="Phone / service (business-use %)"
          body="Calls, data, hotspot for navigation are commonly business use. Deduct only the business portion."
          hint="A simple usage log supports your percentage."
        />
        <RuleCard
          heading="Supplies & small equipment"
          body="Charging cables, mounts, dash organizers, hot/cold bags for deliveries—often ordinary/necessary."
        />
        <RuleCard
          heading="Tolls & parking on business trips"
          body="Directly related to pickups/deliveries—usually deductible."
        />
        <RuleCard
          heading="Car washes"
          body="In many cases deductible when used to maintain a presentable vehicle for rideshare/delivery work."
        />
        <RuleCard
          heading="Pro-rata home office (if eligible)"
          body="If you dispatch/work admin from a dedicated space used regularly and exclusively for business."
        />
      </div>

      <Callout tone="warn" title="Documentation matters.">
        If any expense is mixed-use (e.g., phone or vehicle), deduct only the business-use portion and keep proof of how you computed it.
      </Callout>

      <ArticleCTA />
    </BlogShell>
  );
}
