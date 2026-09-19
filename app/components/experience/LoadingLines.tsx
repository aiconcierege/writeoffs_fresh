/** Layout placeholders only: never render invented amounts, progress or facts. */
export function LoadingLines({ rows = 3 }: { rows?: number }) {
  return <div className="wo-loading-lines" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <span key={i}/>)}</div>
}
