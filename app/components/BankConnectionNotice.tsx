import Link from 'next/link'
import { bankConnectionAttention, type BankConnectionAttentionInput } from '../lib/plaid/connection-attention'

type Connection = BankConnectionAttentionInput & { id: string; institution_name: string | null }
export function BankConnectionNotice({ connections }: { connections: Connection[] | null }) {
  const notices = (connections ?? []).flatMap(connection => {
    const attention = bankConnectionAttention(connection)
    return attention ? [{ ...connection, ...attention }] : []
  })
  if (!notices.length) return null
  return <section aria-label="Bank connections" className="my-5 border-y border-[#dce3de] py-4">
    <ul className="space-y-4">{notices.map(notice => <li key={notice.id} className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold text-[#253c33]">{notice.institution_name || 'Your bank'}</p><p className="mt-1 text-sm text-[#59665f]">{notice.message}</p></div>
      <Link className="btn btn-secondary min-h-11" href={`/settings/banking#bank-connection-${notice.id}`}>{notice.action}</Link>
    </li>)}</ul>
  </section>
}
