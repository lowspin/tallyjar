// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  REPEAT_MIN_MS,
  REPEAT_START_MS,
  nextRepeatInterval,
  pressAmount,
  sliderStep,
  snapToSlider,
} from '@/lib/taps'

describe('press amount', () => {
  it('a plain tap or key press is always 1, whatever the step', () => {
    expect(pressAmount(200, false)).toEqual({ amount: 1, kind: 'tap' })
    expect(pressAmount(200, false)).toEqual({ amount: 1, kind: 'tap' })
    expect(pressAmount(1, false)).toEqual({ amount: 1, kind: 'tap' })
  })

  it('Shift applies the full step', () => {
    expect(pressAmount(200, true)).toEqual({ amount: 200, kind: 'step' })
  })
})

describe('hold-to-repeat speed', () => {
  it('speeds up from about 6/s to 20/s', () => {
    expect(Math.round(1000 / REPEAT_START_MS)).toBe(6)
    let interval = REPEAT_START_MS
    for (let i = 0; i < 50; i++) interval = nextRepeatInterval(interval)
    expect(interval).toBe(REPEAT_MIN_MS)
    expect(1000 / REPEAT_MIN_MS).toBe(20)
  })
})

describe('slider grid', () => {
  it('is about 1% of the target, rounded down to 1-2-5', () => {
    expect(sliderStep(7_050_900)).toBe(50_000)
    expect(sliderStep(2_000)).toBe(20)
    expect(sliderStep(1_000_000)).toBe(10_000)
    expect(sliderStep(300)).toBe(2)
    expect(sliderStep(75)).toBe(1)
    expect(sliderStep(1)).toBe(1)
  })

  it('snaps to the grid and keeps both ends reachable', () => {
    expect(snapToSlider(3_482_113, 7_050_900)).toBe(3_500_000)
    expect(snapToSlider(7_049_000, 7_050_900)).toBe(7_050_000)
    expect(snapToSlider(7_050_500, 7_050_900)).toBe(7_050_900)
    expect(snapToSlider(7_100_000, 7_050_900)).toBe(7_050_900)
    expect(snapToSlider(-5, 7_050_900)).toBe(0)
    expect(snapToSlider(12, 75)).toBe(12)
  })
})
