// /app/components/Callout.tsx
export default function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warn";
  title: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: { bg: "bg-[#F0F9FF]", text: "text-[#1D4ED8]", border: "border-[#BFDBFE]" },
    success: { bg: "bg-[#ECFDF5]", text: "text-[#047857]", border: "border-[#A7F3D0]" },
    warn: { bg: "bg-[#FFFBEB]", text: "text-[#92400E]", border: "border-[#FDE68A]" },
  }[tone];
  return (
    <div className={`rounded-xl border ${tones.border} ${tones.bg} p-4`}>
      <div className={`font-medium ${tones.text}`}>{title}</div>
      {children ? <div className="mt-1 text-sm text-neutral-700">{children}</div> : null}
    </div>
  );
}
