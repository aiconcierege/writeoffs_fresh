import type { CustomerQuestion } from '../../lib/bookkeeping/customer-questions'

/** Help explains the requested fact; it does not select a tax treatment. */
export function QuestionHelp({ question }: { question: CustomerQuestion }) {
  if (question.kind !== 'percentage') return null
  const recurring = ['phone_business_use_percentage', 'internet_business_use_percentage'].includes(question.deductionFact?.type ?? '')
  return <details className="my-4 rounded-xl border border-slate-200 bg-white px-4 py-1">
    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-[#243186]">How do I estimate this?</summary>
    <p className="pb-4 text-sm leading-6 text-slate-600">Think about how much you use it for business compared with personal use. Check your bill or usage records if you have them. For example, about seven out of ten uses is 70%. Use an estimate you can explain; don’t include personal use.{recurring ? ' If your use changes, update the saved percentage in your deduction details.' : ''}</p>
  </details>
}
