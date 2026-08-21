/* File: app/not-found.tsx
 * Minimal 404 page for App Router builds.
 */
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The page you’re looking for doesn’t exist.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/home" className="inline-block rounded-xl border px-4 py-2 text-sm">Go to Home</Link>
          <Link href="/" className="inline-block rounded-xl border px-4 py-2 text-sm">Public homepage</Link>
        </div>
      </section>
    </main>
  )
}
