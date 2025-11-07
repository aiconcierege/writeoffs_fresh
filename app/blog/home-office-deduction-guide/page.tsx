import BlogShell from "../../components/BlogShell";
import Callout from "../../components/Callout";
import RuleCard from "../../components/RuleCard";
import ArticleCTA from "../../components/ArticleCTA";

export const metadata = {
  title: "Home Office Deduction Guide",
  description: "When it often applies, simplified vs. actual, and what to keep.",
};

export default function Post() {
  return (
    <BlogShell
      title="Home Office Deduction Guide"
      subtitle="In many cases available if the space is used regularly and exclusively for business."
    >
      <Callout tone="info" title="Two methods">
        <div className="mt-1">
          <strong>Simplified:</strong> $5 per sq. ft., up to 300 sq. ft. (max $1,500).<br />
          <strong>Actual:</strong> Pro-rata share of eligible costs (rent, utilities, etc.).
        </div>
      </Callout>

      <div className="grid gap-4 md:grid-cols-2">
        <RuleCard
          heading="Regular & exclusive use"
          body="Space is used on a continuing basis and only for business—no personal use."
        />
        <RuleCard
          heading="Principal place of business"
          body="Admin/management is primarily done here, even if you also work elsewhere."
        />
        <RuleCard
          heading="Documentation"
          body="Keep photos of the space, a simple floor plan, and utility statements."
        />
        <RuleCard
          heading="Switching methods"
          body="You can generally choose the method each year; actual may win when costs are high."
        />
      </div>

      <Callout tone="success" title="Tip">
        Save a single folder with: floor plan, photos, square footage notes, and two recent utility statements. Future-you will thank you.
      </Callout>

      <ArticleCTA />
    </BlogShell>
  );
}
