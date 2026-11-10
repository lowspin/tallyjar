import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { APP_VERSION } from '@/lib/version'

describe('app version', () => {
  it('comes from package.json', () => {
    expect(APP_VERSION).toBe(pkg.version)
    expect(APP_VERSION).toBe('0.1.0')
  })
})
