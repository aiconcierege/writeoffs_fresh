// app/mileage/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Trip = {
  id: string;
  date: string;           // YYYY-MM-DD
  purpose: string;
  start_label: string;
  end_label: string;
  miles: number;          // 6,1
  client?: string | null;
  notes?: string | null;
  created_at?: string;
};

function currentYear() { return new Date().getFullYear(); }

export default function MileagePage() {
  const cy = useMemo(() => currentYear(), []);
  const [year, setYear] = useState<string>(String(cy));
  const [rows, setRows] = useState<Trip[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);

  // IRS standard mileage rate (can adjust here). 2024: $0.67. Keep as string input for quick edits.
  const [rate, setRate] = useState<string>('0.67');

  // form state
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [purpose, setPurpose] = useState<string>('');
  const [startLabel, setStartLabel] = useState<string>('');
  const [endLabel, setEndLabel] = useState<string>('');
  const [miles, setMiles] = useState<string>('0.0');
  const [client, setClient] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const yearOptions = useMemo(() => {
    const y = cy;
    return [String(y), String(y - 1), String(y - 2), 'all'];
  }, [cy]);

  const totalMiles = useMemo(() => {
    if (!rows) return 0;
    return rows.reduce((sum, r) => sum + (Number(r.miles) || 0), 0);
  }, [rows]);

  const deduction = useMemo(() => {
    const r = Number(rate);
    if (Number.isNaN(r)) return 0;
    return totalMiles * r;
  }, [totalMiles, rate]);

  async function load(y: string) {
    setLoading(true);
    setErr(null); setDetails(null);
    try {
      const res = await fetch(`/api/mileage/list?year=${encodeURIComponent(y)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.error || 'Unable to load mileage.');
        setDetails(json.details ?? null);
        setRows(null);
      } else {
        setRows(json.rows || []);
      }
    } catch (e: any) {
      setErr(e?.message || 'Network error.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setDetails(null);
    try {
      const payload = {
        date,
        purpose: purpose.trim(),
        start_label: startLabel.trim(),
        end_label: endLabel.trim(),
        miles: Number(miles),
        client: client.trim() || null,
        notes: notes.trim() || null,
      };
      const res = await fetch('/api/mileage/create', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        const d = json?.details ? ` — ${String(json.details).slice(0,300)}` : '';
        throw new Error((json?.error || `Create failed`) + d);
      }
      setStartLabel(''); setEndLabel(''); setMiles('0.0'); setClient(''); setNotes('');
      await load(year);
    } catch (e:any) {
      setErr(e?.message || 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  const txExportUrl = useMemo(
    () => `/api/transactions/export?year=${encodeURIComponent(year)}`,
    [year]
  );
  const mileageExportUrl = useMemo(
    () => `/api/mileage/export?year=${encodeURIComponent(year)}`,
    [year]
  );

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Mileage</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Log business trips and keep IRS-compliant records. Export your year’s mileage or transactions CSV.
            </p>
          </div>

        <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-neutral-700">
              Year:{' '}
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="rounded-lg border px-2 py-1 text-sm"
                aria-label="Filter by year"
              >
                {yearOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'all' ? 'All years' : opt}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-neutral-700">
              IRS rate:{' '}
              <input
                value={rate}
                onChange={(e)=>setRate(e.target.value)}
                inputMode="decimal"
                className="w-20 rounded-lg border px-2 py-1 text-sm"
                aria-label="IRS mileage rate"
              />
            </label>

            <a href={mileageExportUrl} className="rounded-xl border px-3 py-1.5 text-sm">
              Export Mileage CSV
            </a>
            <a href={txExportUrl} className="rounded-xl border px-3 py-1.5 text-sm">
              Export Transactions CSV
            </a>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onAdd} className="rounded-2xl border p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Date</div>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full rounded-lg border px-3 py-2"/>
            </label>
            <label className="text-sm md:col-span-2">
              <div className="mb-1 text-neutral-700">Purpose</div>
              <input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="Client visit" className="w-full rounded-lg border px-3 py-2"/>
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-700">From</div>
              <input value={startLabel} onChange={e=>setStartLabel(e.target.value)} placeholder="Home" className="w-full rounded-lg border px-3 py-2"/>
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-700">To</div>
              <input value={endLabel} onChange={e=>setEndLabel(e.target.value)} placeholder="Client Office" className="w-full rounded-lg border px-3 py-2"/>
            </label>
            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Miles</div>
              <input value={miles} onChange={e=>setMiles(e.target.value)} inputMode="decimal" className="w-full rounded-lg border px-3 py-2"/>
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Client/Project (optional)</div>
              <input value={client} onChange={e=>setClient(e.target.value)} className="w-full rounded-lg border px-3 py-2"/>
            </label>
            <label className="text-sm md:col-span-2">
              <div className="mb-1 text-neutral-700">Notes (optional)</div>
              <input value={notes} onChange={e=>setNotes(e.target.value)} className="w-full rounded-lg border px-3 py-2"/>
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-xl btn btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60"

          >
            {busy ? 'Saving…' : 'Add trip'}
          </button>

          {err && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
              {err}
              {details && (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-amber-100 p-2 text-xs">{details}</pre>
              )}
            </div>
          )}
        </form>

        {/* Table */}
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">From → To</th>
                <th className="px-3 py-2 font-medium">Miles</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((t) => (
                <tr key={t.id} className="odd:bg-white even:bg-neutral-50">
                  <td className="px-3 py-2 tabular-nums">{t.date}</td>
                  <td className="px-3 py-2">{t.purpose}</td>
                  <td className="px-3 py-2">{t.start_label} → {t.end_label}</td>
                  <td className="px-3 py-2 tabular-nums">{Number(t.miles).toFixed(1)}</td>
                  <td className="px-3 py-2">{t.client || ''}</td>
                  <td className="px-3 py-2">{t.notes || ''}</td>
                </tr>
              ))}
            </tbody>
            {rows && rows.length > 0 && (
              <tfoot className="bg-neutral-50">
                <tr>
                  <td className="px-3 py-2 font-medium" colSpan={3}>Total</td>
                  <td className="px-3 py-2 font-medium tabular-nums">{totalMiles.toFixed(1)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Totals */}
        <div className="mt-4 rounded-xl border p-4 text-sm">
          <div>Total miles: <span className="font-semibold">{totalMiles.toFixed(1)}</span></div>
          <div>Deduction (@ {Number(rate).toFixed(2)}): <span className="font-semibold">${deduction.toFixed(2)}</span></div>
        </div>

        {!loading && rows && rows.length === 0 && !err && (
          <div className="mt-4 rounded-xl border p-4 text-sm text-neutral-700">
            No trips yet. Add your first trip above.
          </div>
        )}
      </section>
    </main>
  );
}
