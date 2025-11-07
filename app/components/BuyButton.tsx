// app/components/BuyButton.tsx
'use client';

import { useState } from 'react';

export default function BuyButton({
  priceId,
  children,
  className = '',
  emailHint,
}: {
  priceId?: string | null;
  children: React.ReactNode;
  className?: string;
  emailHint?: string;
}) {
  const [busy, setBusy] = useState(false);

  const disabled = busy || !priceId;

  async function onClick() {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, email: emailHint || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || 'Checkout failed');
      }
      window.location.href = json.url;
    } catch (e) {
      console.error(e);
      alert('Unable to start checkout. Check your Stripe keys & price IDs, then try again.');
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      className={
        [
          // Default styling
          'w-full rounded-xl px-4 py-2 font-semibold text-white',
          'bg-[#243186] hover:bg-[#1f2a74] active:bg-[#1b2568]',
          'shadow-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          className, // allow extra classes from caller
        ].join(' ')
      }
    >
      {busy ? 'Redirecting…' : children}
    </button>
  );
}
