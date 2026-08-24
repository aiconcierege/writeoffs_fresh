/* File: app/not-found.tsx
 * Minimal 404 page for App Router builds.
 */
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="app-page">
      <section className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="eyebrow">404</p><h1 className="page-title">Page not found</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The page you’re looking for doesn’t exist.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/home" className="btn btn-primary">Go to Home</Link>
          <Link href="/" className="btn btn-secondary">Public homepage</Link>
        </div>
      </section>
    </main>
  )
}
