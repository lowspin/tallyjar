/**
 * Press rules for the − / + buttons (§5.1). Pure, so the timing is unit-tested.
 *
 * - A tap (press and release before HOLD_DELAY_MS) applies ±1.
 * - Holding applies ±step once at HOLD_DELAY_MS, then, if still held after REPEAT_PAUSE_MS,
 *   repeats ±step, speeding up over time.
 * - Keyboard: Enter/Space = ±1, Shift+Enter/Space (or Shift+click) = ±step.
 *
 * There is deliberately no double-tap: what a press does never depends on an earlier one.
 */

export type PressKind = 'tap' | 'step' | 'repeat'

/** Amount for a tap or a keyboard activation. */
export function pressAmount(step: number, shift: boolean): { amount: number; kind: PressKind } {
  return shift ? { amount: step, kind: 'step' } : { amount: 1, kind: 'tap' }
}

/** Hold time before the first ±step. */
export const HOLD_DELAY_MS = 450
/** Pause after the first ±step before repeating, so a single long press is easy to do. */
export const REPEAT_PAUSE_MS = 600
/** Repeat speed: from about 6/s rising to about 20/s. */
export const REPEAT_START_MS = 160
export const REPEAT_MIN_MS = 50
export const REPEAT_ACCEL = 0.9

export function nextRepeatInterval(current: number): number {
  return Math.max(REPEAT_MIN_MS, current * REPEAT_ACCEL)
}

/**
 * Slider granularity for a target: about 1% of the target, rounded down to a 1-2-5 number,
 * so dragging lands on round values (7,050,900 → steps of 50,000). Minimum 1.
 */
export function sliderStep(target: number): number {
  const raw = target / 100
  if (raw < 1) return 1
  let base = 1
  while (base * 10 <= raw) base *= 10
  const m = raw / base
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * base
}

/** Snaps a slider value to the grid, keeping the exact target reachable at the far end. */
export function snapToSlider(value: number, target: number): number {
  if (value >= target) return target
  if (value <= 0) return 0
  const s = sliderStep(target)
  // The last grid point below the target; past halfway from it, snap to the exact target.
  const lastGrid = Math.floor(target / s) * s
  if (value >= lastGrid + (target - lastGrid) / 2 && lastGrid < target) return target
  return Math.min(target, Math.round(value / s) * s)
}
