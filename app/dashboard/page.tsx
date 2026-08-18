/* File: app/dashboard/page.tsx
 * Version: v6 (TS fixes for Th/Td)
 * Notes:
 * - Th.children is optional (empty header cell allowed)
 * - Td accepts an optional `title` prop and forwards it to <td>
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../utils/supabase/server'
import type { ReactNode } from 'react'
import { customerQuestionHeadline, listCustomerQuestions } from '../lib/bookkeeping/customer-questions'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

type TxRow = {
  id: string
  date: string
  vendor: string
  description: string | null
  amount: number
  category_key: string | null
  pack: 'general' | 'realtor' | 'driver' | 'creator'
  needs_review: boolean | null
  imported_at: string | null
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const actionableQuestionCount = (await listCustomerQuestions({ supabase })).length

  // ----- Date ranges -----
  const now = new Date()
  const todayISO = now.toISOString().slice(0,10)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const monthStartISO = monthStart.toISOString().slice(0,10)
  const nextMonthISO = nextMonth.toISOString().slice(0,10)

  // ----- Queries (parallel) -----
  const [
    receiptsTodayQ,
    receiptsPendingOcrQ,
    needsReviewQ,
    latestTxQ,
    monthTotalQ,
  ] = await Promise.all([
    // receipts uploaded today
    supabase
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${todayISO}T00:00:00`)
      .lt('created_at', `${todayISO}T23:59:59`)
      .eq('user_id', user.id),

    // pending OCR: unlinked + no ocr_status or error
    supabase
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .is('transaction_id', null)
      .eq('user_id', user.id)
      .or('ocr_status.is.null,ocr_status.eq.error'),

    // transactions needing review
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('needs_review', true),

    // latest 5 transactions
    supabase
      .from('transactions')
      .select('id,date,vendor,description,amount,category_key,pack,needs_review,imported_at')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('imported_at', { ascending: false })
      .limit(5),

    // this month's total via RPC if present
    supabase.rpc('writeoffs_month_total', {
      start_date: monthStartISO,
      end_date: nextMonthISO,
      uid: user.id,
    })
  ])

  // Month total fallback if RPC missing
  let monthTotal = 0
  if (monthTotalQ?.data != null && typeof monthTotalQ.data === 'number') {
    monthTotal = Number(monthTotalQ.data) || 0
  } else {
    const { data: monthRows } = await supabase
      .from('transactions')
      .select('amount,date')
      .eq('user_id', user.id)
      .gte('date', monthStartISO)
      .lt('date', nextMonthISO)
      .limit(5000)
    monthTotal = (monthRows || []).reduce((acc, r: { amount: number }) => {
      const v = Number(r.amount)
      return acc + (Number.isNaN(v) ? 0 : Math.abs(v))
    }, 0)
  }

  const receiptsToday = receiptsTodayQ.count || 0
  const receiptsPendingOcr = receiptsPendingOcrQ.count || 0
  const needsReview = needsReviewQ.count || 0
  const latest = (latestTxQ.data || []) as TxRow[]

  return (
    <main className="min-h-screen bg-muted">
      {/* Hero header with mint accent */}
      <section className="mx-auto max-w-7xl px-6 pt-8">
        <div className="mb-2 inline-block w-12 border-b-4" style={{ borderColor: 'var(--mint-500)' }} />
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            {/* Accent CTA (mint) */}
            <Link href="/receipts" className="btn btn-accent">
              ➕ Add a receipt
            </Link>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">
          Snap receipts, auto-extract details, review, and export your Schedule C-ready data.
        </p>
      </section>

      {actionableQuestionCount > 0 && (
        <section className="mx-auto mt-6 max-w-7xl px-6">
          <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {customerQuestionHeadline(actionableQuestionCount)}
              </h2>
              <p className="mt-1 text-sm text-muted">A few simple answers will help WriteOffs keep your records organized.</p>
            </div>
            <Link href="/questions" className="btn btn-accent shrink-0">Answer questions</Link>
          </div>
        </section>
      )}

      {/* Stat tiles */}
      <section className="mx-auto mt-6 max-w-7xl px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Receipts uploaded today" value={receiptsToday.toLocaleString()} />
          <StatCard label="Pending OCR" value={receiptsPendingOcr.toLocaleString()} hint={receiptsPendingOcr > 0 ? 'Run OCR from Receipts' : undefined} />
          <StatCard label="Needs review" value={needsReview.toLocaleString()} link={{ href: '/review?needs_receipt=1', text: 'Review' }} />
          <StatCard label="This month’s write-offs" value={usd.format(monthTotal)} />
        </div>
      </section>

      {/* Latest transactions (card) */}
      <section className="mx-auto mt-8 max-w-7xl px-6">
        <div className="card">
          <div className="flex items-center justify-between border-b border-surface px-4 py-3">
            <div className="text-base font-semibold">Latest transactions</div>
            <div className="flex items-center gap-2">
              <Link href="/review" className="btn btn-secondary">Review all</Link>
              <Link href="/export" className="btn btn-secondary">Export</Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Date</Th>
                  <Th>Vendor</Th>
                  <Th>Description</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Category</Th>
                  <Th>Pack</Th>
                  <Th>Status</Th>
                  <Th className="w-[1%]"></Th>
                </tr>
              </thead>
              <tbody>
                {latest.length === 0 ? (
                  <tr>
                    <Td colSpan={8}>
                      <div className="py-10 text-center text-neutral-600">
                        No transactions yet. <Link href="/receipts" className="underline">Add a receipt</Link> to get started.
                      </div>
                    </Td>
                  </tr>
                ) : latest.map((t) => (
                  <tr key={t.id} className="odd:bg-white even:bg-slate-50 hover:bg-slate-100 transition-colors">
                    <Td>{t.date}</Td>
                    <Td>{t.vendor}</Td>
                    <Td className="max-w-[40ch] truncate" title={t.description || ''}>{t.description || '—'}</Td>
                    <Td className="text-right font-mono">{usd.format(Number(t.amount) || 0)}</Td>
                    <Td>{t.category_key || <span className="text-neutral-500">—</span>}</Td>
                    <Td>{t.pack}</Td>
                    <Td>
                      {t.needs_review
                        ? <span className="rounded-full bg-amber-100 px-2 py-[2px] text-xs text-amber-800">Needs review</span>
                        : <span className="rounded-full bg-emerald-100 px-2 py-[2px] text-xs text-emerald-800">Posted</span>}
                    </Td>
                    <Td>
                      <Link href={`/review?id=${t.id}`} className="btn btn-secondary text-xs">Review</Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

/* ---------- small components ---------- */

function StatCard({
  label, value, hint, link
}: {
  label: string
  value: string
  hint?: string
  link?: { href: string, text: string }
}) {
  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className="text-xs uppercase tracking-wide text-neutral-600">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-600">{hint}</div>}
      {link && (
        <div className="mt-3">
          <Link href={link.href} className="btn btn-secondary text-sm">{link.text}</Link>
        </div>
      )}
    </div>
  )
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>
}
function Td({
  children, className = '', colSpan, title,
}: {
  children?: ReactNode
  className?: string
  colSpan?: number
  title?: string
}) {
  return <td className={`px-3 py-2 align-top ${className}`} colSpan={colSpan} title={title}>{children}</td>
}
