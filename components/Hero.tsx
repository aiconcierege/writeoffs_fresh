// components/Hero.tsx
import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 py-12 text-center sm:py-20">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
          The easiest way to capture, classify, and claim your Write-Offs.
        </h1>
        <p className="mt-4 text-base text-neutral-700 sm:text-lg">
          Keep more of what’s yours with <strong>WriteOffs.io</strong>. Snap a
          receipt and we’ll walk you through the deduction step-by-step.
        </p>

        <div className="mt-6">
          <Link
            href="/blog/"
            className="inline-flex items-center rounded-xl bg-[#243186] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1c266e]"
          >
            Read the Blog →
          </Link>
        </div>
      </div>

      <div className="mt-10 flex justify-center">
        <Image
          src="/media/three-steps.png"
          alt="3 Steps To A Write-Off — Receipt Capture, Auto Classification, Export for Tax Return"
          width={1000}
          height={560}
          className="rounded-3xl border border-neutral-200 shadow-card"
          priority
        />
      </div>
    </section>
  );
}
