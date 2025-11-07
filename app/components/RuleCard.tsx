// /app/components/RuleCard.tsx
export default function RuleCard({
  heading,
  body,
  hint,
}: {
  heading: string;
  body: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card">
      <div className="text-base font-semibold">{heading}</div>
      <p className="mt-2 text-sm text-neutral-800">{body}</p>
      {hint ? <p className="mt-2 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}
