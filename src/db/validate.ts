import type { OnTarget } from './types'

export const COLLECTION_NAME_MAX = 40
export const ITEM_NAME_MAX = 60
export const MAX_COUNT = Number.MAX_SAFE_INTEGER

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** Trims and checks length (counted in characters, not UTF-16 units). */
export function normalizeName(value: unknown, max: number, label = 'Name'): string {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be text`)
  const name = value.trim()
  const length = [...name].length
  if (length === 0) throw new ValidationError(`${label} is required`)
  if (length > max) throw new ValidationError(`${label} must be at most ${max} characters`)
  return name
}

const HEX = /^#[0-9a-f]{6}$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/** Returns the color as uppercase "#RRGGBB". */
export function normalizeColor(value: unknown): string {
  if (!isHexColor(value)) throw new ValidationError('Color must be a hex value like #5EC4C4')
  return value.toUpperCase()
}

export function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export function assertCount(value: unknown, label = 'Count'): number {
  if (!isCount(value)) throw new ValidationError(`${label} must be a whole number of 0 or more`)
  return value
}

export function assertStep(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new ValidationError('Step must be a whole number of 1 or more')
  return value as number
}

export function assertTarget(value: unknown): number | null {
  if (value === null) return null
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new ValidationError('Target must be a whole number of 1 or more')
  return value as number
}

export function assertOnTarget(value: unknown): OnTarget {
  if (value !== 'continue' && value !== 'lock')
    throw new ValidationError("On-target must be 'continue' or 'lock'")
  return value
}
