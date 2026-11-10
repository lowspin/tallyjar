/**
 * 25 colors in OKLCH at L 0.76, C 0.095, hues 14.4° apart starting at the brand teal (195°).
 * Shown as a 5 × 5 grid in this order.
 */
export const PALETTE = [
  '#5EC4C4', '#5FC2D2', '#67BEDE', '#75BAE7', '#85B5EC',
  '#96B0EE', '#A6AAEC', '#B6A5E7', '#C4A0DE', '#D09CD3',
  '#DA9AC5', '#E198B6', '#E698A6', '#E79996', '#E69C86',
  '#E2A079', '#DBA56F', '#D1AA69', '#C5B068', '#B6B66D',
  '#A6BB77', '#94C084', '#82C393', '#72C5A3', '#65C5B4',
] as const // prettier-ignore

export const PALETTE_COLUMNS = 5

export const TEXT_DARK = '#243036'
export const TEXT_LIGHT = '#FFFFFF'

function channel(hex: string, offset: number): number {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/** WCAG contrast ratio between two "#RRGGBB" colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Dark or light text, whichever contrasts more with the fill. */
export function textOn(fill: string): string {
  return contrastRatio(fill, TEXT_DARK) >= contrastRatio(fill, TEXT_LIGHT) ? TEXT_DARK : TEXT_LIGHT
}

export function isPaletteColor(color: string): boolean {
  return (PALETTE as readonly string[]).includes(color.toUpperCase())
}

/**
 * The default color for a new jar or item: the first palette color not yet in use.
 * Once all are used, cycles by picking the least-used one (earliest in the palette on ties).
 */
export function nextPaletteColor(used: readonly string[]): string {
  const counts = new Map<string, number>(PALETTE.map((c) => [c, 0]))
  for (const color of used) {
    const key = color.toUpperCase()
    const n = counts.get(key)
    if (n !== undefined) counts.set(key, n + 1)
  }
  let best: string = PALETTE[0]
  for (const color of PALETTE) if (counts.get(color)! < counts.get(best)!) best = color
  return best
}
