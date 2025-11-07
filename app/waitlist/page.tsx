// app/waitlist/page.tsx
import WaitlistForm from "../components/WaitlistForm"; // ⬅️ changed from "@/app/components/WaitlistForm"
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the WriteOffs.io Waitlist",
  description:
    "Be among the first to use WriteOffs.io — the easiest way to capture, classify, and claim your tax write-offs automatically.",
};

export default function WaitlistPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          Join the WriteOffs.io Waitlist
        </h1>

        <p className="mt-4 text-base text-neutral-700 sm:text-lg">
          Drop your email below and be the first to access our private beta.
          You’ll get early access, exclusive updates, and founder perks.
        </p>

        <div className="mt-6">
          <WaitlistForm source="waitlist-page" />
        </div>

        <p className="mt-8 text-sm text-neutral-500">
          We respect your privacy — no spam, ever.{" "}
          <a
            href="/legal/privacy"
            className="text-[#243186] underline hover:text-[#1c266e]"
          >
            View our privacy policy.
          </a>
        </p>
      </div>
    </main>
  );
}
