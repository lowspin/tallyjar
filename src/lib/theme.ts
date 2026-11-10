export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'tallyjar-theme'

/** Matches --color-bg in tokens.css; used for <meta name="theme-color">. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#FDFAF4',
  dark: '#0F171C',
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light'
  return pref
}
