/** The current leaf closes a receipt request without claiming the evidence exists.
 * Later attachment/reopening supersedes this state; the old assertion stays in history.
 */
export function receiptUnavailableRecordIds(events:Record<string,unknown>[]) {
  const byId=new Map(events.map(event=>[event.id,event]))
  const superseded=new Set(events.map(event=>event.supersedes_event_id).filter(Boolean))
  return new Set(events.filter(event=>event.event_type==='resolved'&&!superseded.has(event.id)
    &&byId.get(event.supersedes_event_id)?.event_type==='receipt_lost')
    .map(event=>String(event.bookkeeping_record_id)))
}
