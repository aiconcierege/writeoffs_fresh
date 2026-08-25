export async function runBoundedBatch<T, R>(input: {
  items: readonly T[]
  concurrency: number
  process: (item: T, index: number) => Promise<R>
  onSettled?: (settled: number, total: number) => void
}) {
  const results: Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown } | undefined>
    = new Array(input.items.length)
  let cursor = 0; let settled = 0
  async function worker() {
    while (cursor < input.items.length) {
      const index = cursor++; const item = input.items[index]
      try { results[index] = { status: 'fulfilled', value: await input.process(item, index) } }
      catch (reason) { results[index] = { status: 'rejected', reason } }
      settled += 1; input.onSettled?.(settled, input.items.length)
    }
  }
  const concurrency = Math.max(1, Math.min(Math.trunc(input.concurrency), input.items.length || 1))
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results as Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }>
}
