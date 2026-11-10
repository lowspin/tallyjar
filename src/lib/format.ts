const full = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Full number with locale grouping, e.g. "1,234,567". */
export function formatCount(n: number): string {
  return full.format(n)
}

/** Short form for tight spaces, e.g. "1.2M". */
export function formatCompact(n: number): string {
  return compact.format(n)
}

/** Whole-percent progress, rounded down so 100% only shows once the target is met. */
export function percentOf(count: number, target: number): number {
  if (target <= 0) return 0
  return Math.floor((count / target) * 100)
}

/** "1 jar", "41 items". */
export function plural(n: number, word: string, plural = word + 's'): string {
  return `${formatCount(n)} ${n === 1 ? word : plural}`
}

/** File sizes like "840 KB" or "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Signed amount for hints and pop labels, e.g. "+200", "−200" (true minus sign). */
export function formatSigned(n: number): string {
  return (n < 0 ? '−' : '+') + formatCount(Math.abs(n))
}
