// components/WaitlistForm.tsx
"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const form = e.currentTarget;
    const input = form.querySelector('input[type="email"]') as HTMLInputElement;
    const email = input.value;

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "You're on the list!");
        input.value = "";
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-surface-border bg-white p-5 shadow-card hover-rise">
      <form className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]" onSubmit={onSubmit}>
        <input
          type="email"
          required
          placeholder="you@business.com"
          className="h-12 rounded-full border border-surface-border px-4 text-sm text-surface-ink placeholder:text-surface-muted focus-visible:ring-2 ring-brand"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-primary h-12 hover-rise disabled:opacity-70"
        >
          {status === "loading" ? "Submitting…" : "Get early access"}
        </button>
      </form>

      {/* simple toast-ish feedback */}
      {status !== "idle" && message && (
        <p
          className={
            "mt-2 text-center text-sm " +
            (status === "success" ? "text-brand-ink" : "text-surface-muted")
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
