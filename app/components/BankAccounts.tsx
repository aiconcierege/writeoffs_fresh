"use client";

import { useEffect, useState } from "react";

type Account = {
  id: string;
  name?: string;
  type?: string;
  subtype?: string;
  currency?: string;
  last_four?: string;
};

type Txn = {
  id: string;
  description: string;
  date: string;
  amount: number | string;
  status?: string;
  details?: {
    processing_status?: string;
    category?: string;
    counterparty?: { type?: string; name?: string };
  };
  account_id?: string;
};

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "emerald" | "amber" | "red";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    red: "bg-red-50 text-red-800 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default function BankAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [txns, setTxns] = useState<Record<string, Txn[] | "loading" | "error">>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/teller/accounts", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load accounts");
        setAccounts(json.accounts || []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load accounts");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggle(accountId: string) {
    if (openId === accountId) {
      setOpenId(null);
      return;
    }
    setOpenId(accountId);
    if (txns[accountId]) return;

    setTxns((prev) => ({ ...prev, [accountId]: "loading" }));
    try {
      const res = await fetch(
        `/api/teller/transactions?account_id=${encodeURIComponent(accountId)}&limit=25`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load transactions");
      setTxns((prev) => ({ ...prev, [accountId]: json.transactions || [] }));
    } catch {
      setTxns((prev) => ({ ...prev, [accountId]: "error" }));
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 p-6">
        <div className="h-4 w-36 animate-pulse rounded bg-neutral-200" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-neutral-200" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-200" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Error loading accounts: {err}
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="rounded-2xl border border-neutral-200 p-6 text-sm text-neutral-600">
        No accounts connected yet. Use <span className="font-medium">Connect your bank</span> above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((a) => {
        const subtitle = [a.type, a.subtype].filter(Boolean).join(" · ") || "Account";
        const label = a.name || a.id;
        const tail = [a.currency?.toUpperCase(), a.last_four ? `•••• ${a.last_four}` : ""]
          .filter(Boolean)
          .join(" · ");
        const section = txns[a.id];

        return (
          <div
            key={a.id}
            className="rounded-2xl border border-neutral-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold leading-6">{label}</div>
                <div className="truncate text-xs text-neutral-600">{subtitle}</div>
              </div>
              <div className="flex items-center gap-3">
                {tail ? <div className="text-xs text-neutral-600">{tail}</div> : null}
                <button
                  onClick={() => toggle(a.id)}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  {openId === a.id ? "Hide transactions" : "View transactions"}
                </button>
              </div>
            </div>

            {openId === a.id && (
              <div className="border-t border-neutral-200 p-5">
                {section === "loading" && (
                  <div className="space-y-2">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-200" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
                  </div>
                )}

                {section === "error" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Couldn’t load transactions. Try again in a moment.
                  </div>
                )}

                {Array.isArray(section) && (
                  <>
                    {!section.length ? (
                      <div className="text-sm text-neutral-600">No recent transactions.</div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-neutral-200">
                        <div className="grid grid-cols-12 bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-600">
                          <div className="col-span-5">Description</div>
                          <div className="col-span-3">When</div>
                          <div className="col-span-2">Category</div>
                          <div className="col-span-2 text-right">Amount</div>
                        </div>
                        <ul className="divide-y divide-neutral-200">
                          {section.map((t) => {
                            const amt = typeof t.amount === "string" ? Number(t.amount) : t.amount;
                            const isOut = (amt ?? 0) > 0; // sandbox can be positive for spend
                            const who =
                              t.details?.counterparty?.name ||
                              t.description ||
                              (t.details?.category
                                ? t.details.category[0]?.toUpperCase() + t.details.category.slice(1)
                                : "Transaction");
                            const category = t.details?.category || "general";
                            const meta = [t.date, t.status].filter(Boolean).join(" · ");

                            return (
                              <li key={t.id} className="grid grid-cols-12 items-center px-4 py-3 text-sm">
                                <div className="col-span-5 min-w-0">
                                  <div className="truncate font-medium">{who}</div>
                                  <div className="truncate text-xs text-neutral-600">
                                    {t.details?.processing_status
                                      ? `Processing: ${t.details.processing_status}`
                                      : ""}
                                  </div>
                                </div>
                                <div className="col-span-3 text-xs text-neutral-700">{meta}</div>
                                <div className="col-span-2">
                                  <Pill tone="neutral">{category}</Pill>
                                </div>
                                <div
                                  className={`col-span-2 text-right font-mono ${
                                    isOut ? "text-red-600" : "text-emerald-700"
                                  }`}
                                >
                                  {Number.isFinite(amt)
                                    ? (amt as number).toLocaleString(undefined, {
                                        style: "currency",
                                        currency: "USD",
                                      })
                                    : String(t.amount)}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
