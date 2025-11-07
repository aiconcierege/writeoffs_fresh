// /app/components/BlogShell.tsx
import Link from "next/link";

export default function BlogShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      {/* Breadcrumb */}
      <nav className="text-sm text-neutral-500">
        <Link href="/blog" className="hover:underline">Blog</Link>
        <span className="mx-1">/</span>
        <span className="text-neutral-700">Article</span>
      </nav>

      {/* Title */}
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-neutral-700">{subtitle}</p> : null}

      <hr className="my-6 border-neutral-200" />

      {/* Content */}
      <article className="space-y-6 text-[16px] leading-[1.6] text-neutral-800">
        {children}
      </article>

      <hr className="my-8 border-neutral-200" />

      <p className="text-xs text-neutral-500">
        Educational content. Many deductions are fact-specific and rules change. Keep contemporaneous records
        and confirm with current IRS guidance or a qualified professional.
      </p>
    </main>
  );
}
