// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DOUBLE_TAP_MS,
  REPEAT_MIN_MS,
  REPEAT_START_MS,
  createTapTracker,
  nextRepeatInterval,
} from '@/lib/taps'

describe('tap tracker', () => {
  it('applies 1 immediately on a single tap', () => {
    const t = createTapTracker()
    expect(t.tap(1000, 200)).toEqual({ amount: 1, kind: 'tap' })
  })

  it('a double tap adds exactly step in total', () => {
    const t = createTapTracker()
    const first = t.tap(1000, 200)
    const second = t.tap(1000 + 250, 200)
    expect(second).toEqual({ amount: 199, kind: 'double' })
    expect(first.amount + second.amount).toBe(200)
  })

  it('treats taps further apart than the window as singles', () => {
    const t = createTapTracker()
    t.tap(1000, 200)
    expect(t.tap(1000 + DOUBLE_TAP_MS + 1, 200).kind).toBe('tap')
  })

  it('accepts a second tap exactly at the window edge', () => {
    const t = createTapTracker()
    t.tap(0, 10)
    expect(t.tap(DOUBLE_TAP_MS, 10)).toEqual({ amount: 9, kind: 'double' })
  })

  it('a third quick tap starts a new pair', () => {
    const t = createTapTracker()
    t.tap(0, 10)
    t.tap(100, 10)
    expect(t.tap(200, 10)).toEqual({ amount: 1, kind: 'tap' })
    expect(t.tap(300, 10)).toEqual({ amount: 9, kind: 'double' })
  })

  it('with step 1, a double tap is two single taps', () => {
    const t = createTapTracker()
    expect(t.tap(0, 1)).toEqual({ amount: 1, kind: 'tap' })
    expect(t.tap(100, 1)).toEqual({ amount: 1, kind: 'tap' })
  })

  it('Shift applies the full step and breaks any pair', () => {
    const t = createTapTracker()
    t.tap(0, 50)
    expect(t.tap(100, 50, true)).toEqual({ amount: 50, kind: 'step' })
    expect(t.tap(150, 50)).toEqual({ amount: 1, kind: 'tap' })
  })

  it('keyboard: plain = 1, Shift = step, never double-tap', () => {
    const t = createTapTracker()
    expect(t.key(200, false)).toEqual({ amount: 1, kind: 'tap' })
    expect(t.key(200, false)).toEqual({ amount: 1, kind: 'tap' })
    expect(t.key(200, true)).toEqual({ amount: 200, kind: 'step' })
  })
})

describe('hold-to-repeat speed', () => {
  it('speeds up from about 8/s to about 25/s', () => {
    expect(1000 / REPEAT_START_MS).toBe(8)
    let interval = REPEAT_START_MS
    for (let i = 0; i < 50; i++) interval = nextRepeatInterval(interval)
    expect(interval).toBe(REPEAT_MIN_MS)
    expect(1000 / REPEAT_MIN_MS).toBe(25)
  })
})
