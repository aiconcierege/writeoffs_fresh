// app/components/WaitlistForm.tsx
"use client";

import { useId, useState } from "react";

type WaitlistFormProps = {
  source: string;
  appearance?: "default" | "landing";
};

export default function WaitlistForm({ source, appearance = "default" }: WaitlistFormProps) {
  const fieldId = useId();
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const landing = appearance === "landing";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, source }),
      });

      const data = await res.json() as { error?: string; duplicate?: boolean };

      if (!res.ok) {
        throw new Error(data.error || "Unable to submit");
      }

      setStatus("success");
      setMessage(data.duplicate
        ? "You’re already on the list. We’ll keep you posted."
        : "You’re on the list! We’ll be in touch soon.");
      setEmail("");
      setName("");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={status === "loading"}
      className={`mx-auto max-w-xl ${landing ? "mt-0" : "mt-4"}`}
    >
      <div className={`grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] ${landing ? "sm:gap-3" : "sm:gap-2"}`}>
        <div>
          <label htmlFor={`${fieldId}-name`} className="sr-only">Your name</label>
          <input
            id={`${fieldId}-name`}
            type="text"
            autoComplete="name"
            maxLength={100}
            placeholder="Your name"
            value={name}
            disabled={status === "loading"}
            onChange={(e) => setName(e.target.value)}
            className={`w-full rounded-lg border bg-white text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus-visible:border-[#243186] focus-visible:ring-2 focus-visible:ring-[#243186]/20 disabled:opacity-70 ${landing ? "border-slate-400 px-4 py-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]" : "border-neutral-300 px-3 py-2 shadow-sm"}`}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-email`} className="sr-only">Email address</label>
          <input
            id={`${fieldId}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            placeholder="Your email"
            value={email}
            disabled={status === "loading"}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={`w-full rounded-lg border bg-white text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus-visible:border-[#243186] focus-visible:ring-2 focus-visible:ring-[#243186]/20 disabled:opacity-70 ${landing ? "border-slate-400 px-4 py-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]" : "border-neutral-300 px-3 py-2 shadow-sm"}`}
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          className={`w-full rounded-lg bg-[#243186] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c266e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#243186] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${landing ? "py-3" : "py-2"}`}
        >
          {status === "loading" ? "Joining…" : "Join Waitlist"}
        </button>
      </div>

      {message && (
        <p
          role={status === "error" ? "alert" : "status"}
          aria-live={status === "error" ? "assertive" : "polite"}
          className={`mt-3 w-full text-center text-sm ${
            status === "error" ? "text-red-600" : "text-green-600"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
