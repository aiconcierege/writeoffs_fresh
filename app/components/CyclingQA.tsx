// /app/components/CyclingQA.tsx
"use client";
import { useEffect, useState } from "react";

const ROTATE_MS = 8000;

const ITEMS = [
  {
    q: "Is coffee with a client a write-off?",
    a: "Often 50% deductible. Keep the receipt and note the business purpose.",
  },
  {
    q: "Is my phone bill deductible?",
    a: "In many cases—deduct your business-use percentage. Keep a usage log.",
  },
  {
    q: "Can I deduct my car?",
    a: "Usually via standard mileage or actual expenses. We’ll explain trade-offs.",
  },
];

export default function CyclingQA() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % ITEMS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const { q, a } = ITEMS[i];

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-0">
      {/* Header — bolder */}
      <div
        className="px-4 py-3 text-sm font-semibold"
        style={{ color: "#243186", backgroundColor: "rgba(36,49,134,0.06)" }}
      >
        Ask WriteOffs™
      </div>

      {/* Prompt area (looks like a big input) */}
      <div className="px-4 pt-4">
        <label className="mb-1 block text-sm font-semibold text-neutral-700">Question</label>
        <div className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-neutral-900">
          <span className="text-sm">{q}</span>
        </div>
      </div>

      {/* Answer area (chat-style) */}
      <div className="px-4 pb-4 pt-3">
        <label className="mb-1 block text-sm font-semibold text-neutral-700">Answer</label>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
          <p className="text-sm text-neutral-800">{a}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Guidance only. Deductions depend on facts; keep records and confirm current rules.
          </p>
        </div>
      </div>
    </div>
  );
}
