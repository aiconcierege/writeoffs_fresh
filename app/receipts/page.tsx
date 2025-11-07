/* File: app/receipts/page.tsx
 * Version: v10
 * Date: 2025-10-15
 * Notes:
 * - Wraps the Receipts UI in <Suspense> to satisfy Next 15 CSR bailout rule.
 * - Keeps Actions column (Run OCR + Delete), original_name, auto-annotate on upload, etc.
 */
'use client'

import { Suspense } from 'react'
import ReceiptsInner from './page_inner'

// Outer component provides the Suspense boundary required by Next 15
export default function ReceiptsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white">
          <section className="mx-auto max-w-4xl px-6 py-10">Loading receipts…</section>
        </main>
      }
    >
      <ReceiptsInner />
    </Suspense>
  )
}
