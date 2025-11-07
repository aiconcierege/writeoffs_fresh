// app/teller/accounts/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type TellerAccount = {
  id: string;                           // e.g., "acc_..."
  subtype: 'checking'|'savings'|'credit_card'|string;
  last_four?: string;
  currency?: string;
  institution?: { name?: string } | null;
  links?: { transactions?: string } | null; // may exist on your proxy
  name?: string;                        // if your API returns a 'name'
};

export default function TellerAccountsPage() {
  const [rows, setRows] = useState<TellerAccount[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/teller/accounts', { cache: 'no-store' });
        const json = await res.json();
        // Support either shape: {accounts:[...]} or [...]
        const list: TellerAccount[] = Array.isArray(json) ? json : (json.accounts || []);
        setRows(list || []);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load accounts');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Teller accounts</h1>
            <p className="mt-1 text-sm text-neutral-600">
              These are the accounts returned by <code>/api/teller/accounts</code>. Use the copy
              buttons when you need an <code>accountId</code>.
            </p>
          </div>
          <Link href="/api/teller/accounts" className="rounded-xl border px-3 py-1.5 text-sm">
            View raw JSON
          </Link>
        </div>

        {loading && <div className="text-sm text-neutral-600">Loading…</div>}

        {err && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            {err}
          </div>
        )}

        {!loading && !err && rows.length === 0 && (
          <div className="rounded-xl border p-4 text-sm text-neutral-700">
            No accounts found.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((a) => (
            <div key={a.id} className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold">
                  {a.name || a.institution?.name || 'Account'}
                </div>
                <span className="rounded-full border px-2 py-0.5 text-xs uppercase">
                  {a.subtype || '—'}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-neutral-600">Last 4</div>
                <div className="font-mono">{a.last_four || '—'}</div>

                <div className="text-neutral-600">Currency</div>
                <div>{a.currency || 'USD'}</div>

                <div className="text-neutral-600">Institution</div>
                <div>{a.institution?.name || '—'}</div>

                <div className="text-neutral-600">Account ID</div>
                <div className="font-mono break-all">{a.id}</div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copy(a.id)}
                  className="rounded-xl border px-3 py-1.5 text-sm"
                >
                  {copiedId === a.id ? 'Copied!' : 'Copy accountId'}
                </button>

                {/* You can wire this once you have a Connect access token handy */}
                <button
                  disabled
                  title="Needs Teller access token integration"
                  className="rounded-xl border px-3 py-1.5 text-sm opacity-50"
                >
                  Import last 90 days (coming soon)
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-sm text-neutral-600">
          Tip: once you have a Teller Connect <code>accessToken</code>, we’ll enable a one-click
          import here that calls <code>/api/teller/import</code>.
        </div>
      </section>
    </main>
  );
}
