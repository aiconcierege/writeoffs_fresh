// app/components/WaitlistForm.tsx
"use client";

import { useState } from "react";

type WaitlistFormProps = {
  source: string;
};

export default function WaitlistForm({ source }: WaitlistFormProps) {
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

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
      className="mx-auto mt-4 flex max-w-md flex-col items-center gap-3 sm:flex-row sm:gap-2"
    >
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-[#243186] focus:outline-none sm:flex-1"
      />
      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-[#243186] focus:outline-none sm:flex-1"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-lg bg-[#243186] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c266e] sm:w-auto"
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
