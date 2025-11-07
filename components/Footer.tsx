import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t mt-10">
      <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-zinc-600 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-center sm:text-left">
          © {new Date().getFullYear()} AI Concierge Inc. d/b/a WriteOffs.io
        </div>
        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/blog" className="hover:underline">Blog</Link>
          <Link href="/waitlist" className="hover:underline">Waitlist</Link>
          <span className="text-zinc-400">•</span>
          <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
          <Link href="/legal/terms" className="hover:underline">Terms</Link>
          <Link href="/legal/tax-disclaimer" className="hover:underline">Tax Disclaimer</Link>
        </nav>
      </div>
    </footer>
  );
}
