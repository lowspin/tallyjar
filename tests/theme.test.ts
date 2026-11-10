import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { THEME_STORAGE_KEY, isThemePreference, resolveTheme } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'

describe('resolveTheme', () => {
  it('follows the system when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('uses an explicit override regardless of the system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('isThemePreference', () => {
  it('accepts only known values', () => {
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('blue')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })
})

describe('settings store theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.head.innerHTML = '<meta name="theme-color" content="">'
    setActivePinia(createPinia())
  })

  it('defaults to system', () => {
    expect(useSettingsStore().theme).toBe('system')
  })

  it('applies data-theme and theme-color, and remembers the choice', async () => {
    const store = useSettingsStore()
    store.setTheme('dark')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0F171C',
    )
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    store.setTheme('light')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('ignores a corrupt stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    expect(useSettingsStore().theme).toBe('system')
  })
})
