import type { OnTarget } from '@/db/types'

/** Counting rules from §5.2. Pure functions so they can be unit-tested. */

export const MAX_COUNT = Number.MAX_SAFE_INTEGER

export interface CountRules {
  target: number | null
  onTarget: OnTarget
}

/** True when the target is a hard ceiling. */
export function isLocked(rules: CountRules): boolean {
  return rules.target !== null && rules.onTarget === 'lock'
}

/** Highest value the count may take. */
export function upperLimit(rules: CountRules): number {
  return isLocked(rules) ? rules.target! : MAX_COUNT
}

/** Clamps any number to a valid count: an integer in [0, upperLimit]. NaN becomes 0. */
export function clampCount(value: number, rules: CountRules): number {
  if (Number.isNaN(value) || value <= 0) return 0
  const max = upperLimit(rules)
  if (value >= max) return max
  return Math.trunc(value)
}

/**
 * Applies a change to a count, clamping at 0 and at the upper limit. Written so that large
 * values near MAX_SAFE_INTEGER never lose precision.
 */
export function applyDelta(count: number, delta: number, rules: CountRules): number {
  const max = upperLimit(rules)
  if (count > max) {
    // Already past a lock (e.g. the target was lowered): allow decreasing only.
    return delta < 0 ? Math.max(0, count + delta) : count
  }
  if (delta > 0 && count > max - delta) return max
  if (delta < 0 && count + delta < 0) return 0
  return count + delta
}

export function canDecrement(count: number): boolean {
  return count > 0
}

export function canIncrement(count: number, rules: CountRules): boolean {
  return count < upperLimit(rules)
}

/** The target has been met (in either mode). */
export function isReached(count: number, target: number | null): boolean {
  return target !== null && count >= target
}

/** Progress toward the target in [0, 1]; stays at 1 past the target. */
export function progress(count: number, target: number | null): number {
  if (target === null || target <= 0) return 0
  return Math.min(1, count / target)
}

/**
 * Parses typed text into a whole number, or null if it isn't one.
 * Accepts plain digits, or digits grouped in threes by commas, dots, spaces, apostrophes or
 * underscores ("1,234,567", "1.234.567", "1 234 567"). Rejects decimals and anything else.
 * Values beyond MAX_SAFE_INTEGER come back as MAX_SAFE_INTEGER.
 */
export function parseCountInput(text: string): number | null {
  const s = text.trim().replace(/[   ]/g, ' ')
  if (/^\d+$/.test(s)) return toSafe(s)
  if (/^\d{1,3}(?:([,.' _’])\d{3})(?:\1\d{3})*$/.test(s)) return toSafe(s.replace(/\D/g, ''))
  return null
}

function toSafe(digits: string): number {
  const trimmed = digits.replace(/^0+(?=\d)/, '')
  if (trimmed.length > 16) return MAX_COUNT
  const n = Number(trimmed)
  return n > MAX_COUNT ? MAX_COUNT : n
}
