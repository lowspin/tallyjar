import { defineStore } from 'pinia'
import { computed, ref, watchEffect } from 'vue'
import { usePreferredDark } from '@vueuse/core'
import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ThemePreference,
} from '@/lib/theme'

function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export const useSettingsStore = defineStore('settings', () => {
  // Phase 2 moves this into the Dexie settings row. localStorage stays as a
  // mirror so index.html can apply the theme before first paint.
  const theme = ref<ThemePreference>(readStoredTheme())
  const systemDark = usePreferredDark()
  const resolvedTheme = computed(() => resolveTheme(theme.value, systemDark.value))

  watchEffect(() => {
    const resolved = resolvedTheme.value
    document.documentElement.dataset.theme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[resolved])
  })

  function setTheme(value: ThemePreference) {
    theme.value = value
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      // Storage may be unavailable (private mode); the choice still applies for this session.
    }
  }

  return { theme, resolvedTheme, setTheme }
})
