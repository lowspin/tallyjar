// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  PALETTE,
  TEXT_DARK,
  TEXT_LIGHT,
  contrastRatio,
  isPaletteColor,
  nextPaletteColor,
  textOn,
} from '@/lib/palette'

describe('palette', () => {
  it('has 25 distinct uppercase hex colors', () => {
    expect(PALETTE).toHaveLength(25)
    expect(new Set(PALETTE).size).toBe(25)
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('every default color takes dark text with at least 4.5:1 contrast', () => {
    for (const c of PALETTE) {
      expect(textOn(c)).toBe(TEXT_DARK)
      expect(contrastRatio(c, TEXT_DARK)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('picks light text on dark custom colors', () => {
    expect(textOn('#1A1A40')).toBe(TEXT_LIGHT)
    expect(textOn('#FFFF00')).toBe(TEXT_DARK)
  })

  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })

  it('recognises palette colors case-insensitively', () => {
    expect(isPaletteColor('#5ec4c4')).toBe(true)
    expect(isPaletteColor('#123456')).toBe(false)
  })
})

describe('nextPaletteColor', () => {
  it('starts with the first color', () => {
    expect(nextPaletteColor([])).toBe(PALETTE[0])
  })

  it('returns the first unused color, ignoring custom colors and case', () => {
    expect(nextPaletteColor([PALETTE[0].toLowerCase(), '#123456'])).toBe(PALETTE[1])
    expect(nextPaletteColor([PALETTE[1], PALETTE[0]])).toBe(PALETTE[2])
    expect(nextPaletteColor([PALETTE[0], PALETTE[2]])).toBe(PALETTE[1])
  })

  it('cycles once every color is used', () => {
    const all = [...PALETTE]
    expect(nextPaletteColor(all)).toBe(PALETTE[0])
    expect(nextPaletteColor([...all, PALETTE[0]])).toBe(PALETTE[1])
  })
})
