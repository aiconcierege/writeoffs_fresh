// app/components/WaitlistForm.tsx
"use client";

import { useState } from "react";

type WaitlistFormProps = {
  source: string;
  appearance?: "default" | "landing";
};

export default function WaitlistForm({ source, appearance = "default" }: WaitlistFormProps) {
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to submit");
      }

      setStatus("success");
      setMessage("You're on the list! We'll be in touch soon.");
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
      className={`mx-auto flex max-w-xl flex-col items-center gap-3 sm:flex-row ${landing ? "mt-0 sm:gap-3" : "mt-4 sm:gap-2"}`}
    >
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`w-full rounded-lg border bg-white text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-[#243186] focus:ring-2 focus:ring-[#243186]/15 sm:flex-1 ${landing ? "border-slate-400 px-4 py-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]" : "border-neutral-300 px-3 py-2 shadow-sm"}`}
      />
      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className={`w-full rounded-lg border bg-white text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-[#243186] focus:ring-2 focus:ring-[#243186]/15 sm:flex-1 ${landing ? "border-slate-400 px-4 py-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]" : "border-neutral-300 px-3 py-2 shadow-sm"}`}
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className={`w-full rounded-lg bg-[#243186] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c266e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${landing ? "py-3" : "py-2"}`}
      >
        {status === "loading" ? "Submitting..." : "Join Waitlist"}
      </button>

      {message && (
        <div
          className={`mt-2 w-full text-center text-sm ${
            status === "error" ? "text-red-600" : "text-green-600"
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}
