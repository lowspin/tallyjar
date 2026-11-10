/**
 * Tap → amount rules for the − / + buttons (§5.1). Pure, so the timing logic is unit-tested.
 *
 * - A tap applies 1 immediately (never waits to see if a second tap follows).
 * - A second tap within DOUBLE_TAP_MS applies the remainder (step − 1), so the pair adds
 *   exactly `step`. A third quick tap starts over at 1.
 * - With step 1 a double tap is simply two single taps.
 * - Shift (or the keyboard) never uses double-tap timing: Shift = step, plain = 1.
 */

export const DOUBLE_TAP_MS = 300

export type TapKind = 'tap' | 'double' | 'step'

export interface TapResult {
  amount: number
  kind: TapKind
}

export function createTapTracker(windowMs = DOUBLE_TAP_MS) {
  let lastTapAt = Number.NEGATIVE_INFINITY

  return {
    /** A pointer tap at time `now` (ms). */
    tap(now: number, step: number, shift = false): TapResult {
      if (shift) {
        lastTapAt = Number.NEGATIVE_INFINITY
        return { amount: step, kind: 'step' }
      }
      if (step > 1 && now - lastTapAt <= windowMs) {
        lastTapAt = Number.NEGATIVE_INFINITY
        return { amount: step - 1, kind: 'double' }
      }
      lastTapAt = now
      return { amount: 1, kind: 'tap' }
    },
    /** A keyboard activation: no double-tap timing. */
    key(step: number, shift: boolean): TapResult {
      lastTapAt = Number.NEGATIVE_INFINITY
      return shift ? { amount: step, kind: 'step' } : { amount: 1, kind: 'tap' }
    },
    reset() {
      lastTapAt = Number.NEGATIVE_INFINITY
    },
  }
}

/** Hold-to-repeat: first repeat after HOLD_DELAY_MS, then faster, from ~8/s to ~25/s. */
export const HOLD_DELAY_MS = 400
export const REPEAT_START_MS = 125
export const REPEAT_MIN_MS = 40
export const REPEAT_ACCEL = 0.9

export function nextRepeatInterval(current: number): number {
  return Math.max(REPEAT_MIN_MS, current * REPEAT_ACCEL)
}
