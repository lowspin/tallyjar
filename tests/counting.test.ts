// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  MAX_COUNT,
  applyDelta,
  canDecrement,
  canIncrement,
  clampCount,
  isReached,
  parseCountInput,
  progress,
  upperLimit,
  type CountRules,
} from '@/lib/clamp'
import { suggestStep } from '@/lib/suggestStep'
import { formatSigned, percentOf } from '@/lib/format'
import { squareCrop } from '@/lib/image'

const free: CountRules = { target: null, onTarget: 'continue' }
const keepGoing: CountRules = { target: 100, onTarget: 'continue' }
const locked: CountRules = { target: 100, onTarget: 'lock' }

describe('zero floor', () => {
  it('never goes below zero', () => {
    expect(applyDelta(0, -1, free)).toBe(0)
    expect(applyDelta(3, -5, free)).toBe(0)
    expect(applyDelta(5, -5, free)).toBe(0)
    expect(applyDelta(6, -5, free)).toBe(1)
  })

  it('disables − at zero only', () => {
    expect(canDecrement(0)).toBe(false)
    expect(canDecrement(1)).toBe(true)
  })

  it('clamps typed values to zero', () => {
    expect(clampCount(-7, free)).toBe(0)
    expect(clampCount(Number.NaN, free)).toBe(0)
  })
})

describe('lock at target', () => {
  it('clamps an overshooting + to the target', () => {
    expect(applyDelta(95, 10, locked)).toBe(100)
    expect(applyDelta(99, 1, locked)).toBe(100)
    expect(applyDelta(90, 10, locked)).toBe(100)
    expect(applyDelta(89, 10, locked)).toBe(99)
  })

  it('ignores + once at the target, and disables it', () => {
    expect(applyDelta(100, 1, locked)).toBe(100)
    expect(canIncrement(100, locked)).toBe(false)
    expect(canIncrement(99, locked)).toBe(true)
    expect(upperLimit(locked)).toBe(100)
  })

  it('applies a double tap in two parts, ignoring the second at the lock', () => {
    // First part (+1) reaches the target; the remainder (+199) is then ignored.
    const afterFirst = applyDelta(99, 1, { target: 100, onTarget: 'lock' })
    expect(afterFirst).toBe(100)
    expect(applyDelta(afterFirst, 199, locked)).toBe(100)
  })

  it('clamps typed values to the target', () => {
    expect(clampCount(250, locked)).toBe(100)
    expect(clampCount(100, locked)).toBe(100)
  })

  it('allows − when already past a lowered target, without jumping to it', () => {
    expect(applyDelta(150, 1, locked)).toBe(150)
    expect(applyDelta(150, -1, locked)).toBe(149)
    expect(canIncrement(150, locked)).toBe(false)
  })
})

describe('keep counting past target', () => {
  it('continues past the target', () => {
    expect(applyDelta(99, 10, keepGoing)).toBe(109)
    expect(canIncrement(1000, keepGoing)).toBe(true)
    expect(clampCount(250, keepGoing)).toBe(250)
  })

  it('reports reached and keeps progress full', () => {
    expect(isReached(99, 100)).toBe(false)
    expect(isReached(100, 100)).toBe(true)
    expect(isReached(150, 100)).toBe(true)
    expect(isReached(5, null)).toBe(false)
    expect(progress(50, 100)).toBe(0.5)
    expect(progress(150, 100)).toBe(1)
    expect(progress(10, null)).toBe(0)
  })
})

describe('MAX_SAFE_INTEGER', () => {
  it('clamps at the maximum without losing precision', () => {
    expect(applyDelta(MAX_COUNT - 1, 1, free)).toBe(MAX_COUNT)
    expect(applyDelta(MAX_COUNT - 1, 1000, free)).toBe(MAX_COUNT)
    expect(applyDelta(MAX_COUNT, 1, free)).toBe(MAX_COUNT)
    expect(applyDelta(MAX_COUNT, -1, free)).toBe(MAX_COUNT - 1)
    expect(canIncrement(MAX_COUNT, free)).toBe(false)
    expect(clampCount(MAX_COUNT * 2, free)).toBe(MAX_COUNT)
  })

  it('handles billions exactly', () => {
    expect(applyDelta(4_999_999_999, 1, free)).toBe(5_000_000_000)
  })
})

describe('parseCountInput', () => {
  it('accepts plain digits and grouped digits', () => {
    expect(parseCountInput('0')).toBe(0)
    expect(parseCountInput(' 1234 ')).toBe(1234)
    expect(parseCountInput('007')).toBe(7)
    expect(parseCountInput('1,234,567')).toBe(1234567)
    expect(parseCountInput('1.234.567')).toBe(1234567)
    expect(parseCountInput('1 234 567')).toBe(1234567)
    expect(parseCountInput('1 234')).toBe(1234)
    expect(parseCountInput("1'234")).toBe(1234)
  })

  it('rejects non-integers and junk', () => {
    for (const bad of ['', ' ', '-5', '1.5', '12,34', '1,234.5', 'abc', '1e6', '1,234.567', '+3'])
      expect(parseCountInput(bad), bad).toBeNull()
  })

  it('caps huge values at MAX_SAFE_INTEGER', () => {
    expect(parseCountInput('99999999999999999999')).toBe(MAX_COUNT)
    expect(parseCountInput(String(MAX_COUNT))).toBe(MAX_COUNT)
  })
})

describe('suggestStep', () => {
  it('matches the examples in the spec', () => {
    expect(suggestStep(0, 2000)).toBe(200)
    expect(suggestStep(0, 75)).toBe(5)
    expect(suggestStep(0, 1_000_000)).toBe(100_000)
    expect(suggestStep(0, 8)).toBe(1)
  })

  it('rounds down within the 1-2-5 series', () => {
    expect(suggestStep(0, 100)).toBe(10)
    expect(suggestStep(0, 190)).toBe(10)
    expect(suggestStep(0, 200)).toBe(20)
    expect(suggestStep(0, 499)).toBe(20)
    expect(suggestStep(0, 500)).toBe(50)
    expect(suggestStep(0, 999)).toBe(50)
    expect(suggestStep(0, 1000)).toBe(100)
  })

  it('uses the range from the start count, with a minimum of 1', () => {
    expect(suggestStep(1000, 3000)).toBe(200)
    expect(suggestStep(500, 100)).toBe(1)
    expect(suggestStep(0, 1)).toBe(1)
  })

  it('stays a safe integer for huge targets', () => {
    const s = suggestStep(0, MAX_COUNT)
    expect(Number.isSafeInteger(s)).toBe(true)
    expect(s).toBe(500_000_000_000_000)
  })
})

describe('format helpers', () => {
  it('percent rounds down', () => {
    expect(percentOf(62, 100)).toBe(62)
    expect(percentOf(1999, 2000)).toBe(99)
    expect(percentOf(2000, 2000)).toBe(100)
  })

  it('signed amounts use a true minus sign', () => {
    expect(formatSigned(200)).toBe('+200')
    expect(formatSigned(-200)).toBe('−200')
  })
})

describe('squareCrop', () => {
  it('centres the largest square', () => {
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 })
    expect(squareCrop(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 })
    expect(squareCrop(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 })
  })
})
