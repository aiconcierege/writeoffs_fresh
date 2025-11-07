// components/CyclingQA.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A tiny rotating Q&A viewer for the "Suggested write-offs" card.
 * - No external libs
 * - Smooth crossfade between items
 * - Pauses on hover (so users can read)
 */
type QA = { q: string; a: string; confidence?: "Low" | "Medium" | "High" };

interface Props {
  items?: QA[];
  intervalMs?: number; // how long each QA stays visible
  fadeMs?: number;     // crossfade duration
}

const DEFAULT_ITEMS: QA[] = [
  {
    q: "Can I deduct part of my cell phone?",
    a: "Yes—the business-use portion is generally deductible. Keep a usage log. Many small businesses cap practical usage around 85% unless they can substantiate higher.",
    confidence: "High",
  },
  {
    q: "Coffee with a client—deductible?",
    a: "Meals with a clear business purpose are generally 50% deductible. Keep who/what/why noted on the receipt.",
    confidence: "Medium",
  },
  {
    q: "New laptop for my side hustle?",
    a: "Usually yes. If there’s any personal use, deduct the business-use percentage and keep proof of that split.",
    confidence: "High",
  },
  {
    q: "Streaming subscriptions for content creation?",
    a: "If ordinary and necessary for producing content, the business-use portion can be deductible. Document your use.",
    confidence: "Medium",
  },
];

export default function CyclingQA({
  items = DEFAULT_ITEMS,
  intervalMs = 4000,
  fadeMs = 400,
}: Props) {
  // Defensive: ensure at least 1 item
  const data = items.length ? items : DEFAULT_ITEMS;

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const timerRef = useRef<number | null>(null);
  const hoverRef = useRef(false);

  // Inline styles for timing to keep Tailwind simple
  const fadeStyle = useMemo(
    () => ({
      transition: `opacity ${fadeMs}ms ease`,
      opacity: phase === "in" ? 1 : 0,
    }),
    [fadeMs, phase]
  );

  // Rotation loop with pause-on-hover
  useEffect(() => {
    const tick = () => {
      if (hoverRef.current) return; // paused due to hover
      setPhase("out");
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % data.length);
        setPhase("in");
      }, fadeMs);
    };

    timerRef.current = window.setInterval(tick, intervalMs) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [data.length, intervalMs, fadeMs]);

  const current = data[index];

  return (
    <div
      className="rounded-xl border border-surface-border bg-white overflow-hidden"
      onMouseEnter={() => (hoverRef.current = true)}
      onMouseLeave={() => (hoverRef.current = false)}
    >
      <div className="border-b border-surface-border p-3 text-sm font-semibold text-surface-muted">
        Ask WriteOffs™
      </div>

      <div className="p-3" style={fadeStyle}>
        <p className="text-xs text-surface-muted">Q:</p>
        <p className="text-sm text-surface-ink">{current.q}</p>
      </div>

      <div className="border-t border-surface-border bg-brand-soft p-3" style={fadeStyle}>
        <p className="text-xs text-surface-muted">A:</p>
        <p className="text-sm text-surface-ink">
          {current.a}
        </p>
        {current.confidence && (
          <p className="mt-2 text-xs text-brand-ink">
            Confidence: {current.confidence} · Stored with your audit docs
          </p>
        )}
      </div>
    </div>
  );
}
