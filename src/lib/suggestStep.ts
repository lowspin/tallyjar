/**
 * Suggests a hold step for a target (§6.5): 10% of the range, rounded down to the
 * nearest 1-2-5 number (1, 2, 5, 10, 20, 50, …), minimum 1.
 */
export function suggestStep(startCount: number, target: number): number {
  const range = Math.max(target - startCount, 1)
  const raw = range / 10
  if (raw < 1) return 1
  let base = 1
  while (base * 10 <= raw) base *= 10
  const m = raw / base
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * base
}
