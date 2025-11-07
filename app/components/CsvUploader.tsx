// app/components/CsvUploader.tsx
"use client";

import { useState } from "react";

type Mapping = {
  date: string;
  description: string;
  amount: string;
  type?: string;
  category?: string;
  memo?: string;
};

export default function CsvUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    accountId: string;
    dateFormat: "YMD" | "MDY" | "DMY";
    mapping: Mapping;
  }>({
    accountId: "",
    dateFormat: "YMD",
    mapping: {
      date: "date",
      description: "description",
      amount: "amount",
      type: "type",
      category: "category",
      memo: "memo",
    },
  });

  async function onUpload() {
    setError(null);
    setResult(null);
    if (!file) {
      setError("Choose a CSV first.");
      return;
    }
    if (!meta.accountId) {
      setError("Enter an account ID to associate these transactions with.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("meta", JSON.stringify(meta));

      // This expects you to add /app/api/imports/csv/route.ts (Step 6).
      const res = await fetch("/api/imports/csv", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Upload failed.");
      } else {
        setResult(json);
      }
    } catch (e: any) {
      setError(e?.message || "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-neutral-900">Import CSV</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Use this to import transactions older than your bank’s history window.
          Need a sample?{" "}
          <a
            href="/templates/writeoffs_csv_template.csv"
            download
            className="font-semibold underline"
            style={{ color: "#243186" }}
          >
            Download the CSV template
          </a>
          .
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 p-8 text-center"
        >
          <p className="text-sm font-medium">Drag & drop CSV here</p>
          <p className="text-xs text-neutral-500">or select a file</p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-3"
          />
          {file && (
            <p className="mt-2 text-xs text-neutral-700">Selected: {file.name}</p>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-600">
              Account ID
            </span>
            <input
              className="mt-1 w-full rounded-lg border p-2"
              placeholder="acct_123"
              value={meta.accountId}
              onChange={(e) =>
                setMeta({ ...meta, accountId: e.target.value })
              }
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-600">
              Date format
            </span>
            <select
              className="mt-1 w-full rounded-lg border p-2"
              value={meta.dateFormat}
              onChange={(e) =>
                setMeta({
                  ...meta,
                  dateFormat: e.target.value as "YMD" | "MDY" | "DMY",
                })
              }
            >
              <option value="YMD">YYYY-MM-DD</option>
              <option value="MDY">MM/DD/YYYY</option>
              <option value="DMY">DD/MM/YYYY</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-6">
          {Object.keys(meta.mapping).map((k) => (
            <label key={k} className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-600">
                {k}
              </span>
              <input
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                value={(meta.mapping as any)[k]}
                onChange={(e) =>
                  setMeta({
                    ...meta,
                    mapping: { ...meta.mapping, [k]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>

        <button
          onClick={onUpload}
          disabled={busy || !file}
          className="mt-6 rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "#243186" }}
        >
          {busy ? "Importing…" : "Import CSV"}
        </button>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Imported <b>{result.imported}</b> • Duplicates <b>{result.skipped}</b>{" "}
            • Range {result.range?.from} → {result.range?.to}
            {result.errors?.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer">
                  View row errors ({result.errors.length})
                </summary>
                <ul className="ml-5 list-disc">
                  {result.errors.slice(0, 50).map((e: any, i: number) => (
                    <li key={i}>
                      Row {e.row}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        )}

        {!result && !error && (
          <p className="mt-3 text-xs text-neutral-500">
            Note: If you haven’t added the backend route yet, this button will
            show an error. We’ll wire the API in the next step.
          </p>
        )}
      </div>
    </div>
  );
}
