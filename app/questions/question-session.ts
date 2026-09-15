import type { CustomerQuestion } from '../lib/bookkeeping/customer-questions'

export const questionVersionKey = (question: Pick<CustomerQuestion, 'id' | 'version'>) => `${question.id}:${question.version}`

/** Keep surviving questions in session order, then append newly discovered work.
 * A changed version is authoritative; a completed immutable version cannot return.
 */
export function reconcileQuestionSession(previous: CustomerQuestion[], incoming: CustomerQuestion[], completed: ReadonlySet<string>, followUpRecordId?:string|null) {
  const current = new Map(incoming.filter(question => !completed.has(questionVersionKey(question))).map(question => [question.id, question]))
  const result: CustomerQuestion[] = []
  for (const old of previous) {
    const next = current.get(old.id)
    if (next) { result.push(next); current.delete(old.id) }
  }
  const discovered=[...current.values()]
  const followUps=followUpRecordId?discovered.filter(question=>question.recordId===followUpRecordId):[]
  return [...followUps,...result,...discovered.filter(question=>!followUps.includes(question))]
}
