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
import { requestPersistentStorage } from '@/lib/storage'
import * as repo from '@/db/repo'
import type { Settings } from '@/db/types'

function readThemeMirror(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function writeThemeMirror(value: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value)
  } catch {
    // Storage may be unavailable (private mode); the theme still applies this session.
  }
}

export const useSettingsStore = defineStore('settings', () => {
  // Dexie holds the settings. The theme is mirrored to localStorage only so that
  // index.html can apply it before first paint.
  const theme = ref<ThemePreference>(readThemeMirror())
  const lastCollectionId = ref<string | null>(null)
  const lastExportAt = ref<number | null>(null)
  const persistRequested = ref(false)
  const persisted = ref<boolean | null>(null)
  const backupReminderSnoozedUntil = ref<number | null>(null)
  const loaded = ref(false)

  const systemDark = usePreferredDark()
  const resolvedTheme = computed(() => resolveTheme(theme.value, systemDark.value))

  watchEffect(() => {
    const resolved = resolvedTheme.value
    document.documentElement.dataset.theme = resolved
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[resolved])
  })

  function apply(row: Settings) {
    theme.value = row.theme
    lastCollectionId.value = row.lastCollectionId
    lastExportAt.value = row.lastExportAt
    persistRequested.value = row.persistRequested
    persisted.value = row.persisted
    backupReminderSnoozedUntil.value = row.backupReminderSnoozedUntil
  }

  async function save(patch: Partial<Omit<Settings, 'key'>>) {
    try {
      apply(await repo.updateSettings(patch))
    } catch (error) {
      console.error('Could not save settings', error)
    }
  }

  /** Loads settings from IndexedDB, creating the row on first launch. */
  async function init() {
    const row = await repo.getSettings()
    // On first launch, keep a theme chosen before settings moved into IndexedDB.
    apply(row ?? (await repo.updateSettings({ theme: readThemeMirror() })))
    writeThemeMirror(theme.value)
    loaded.value = true

    if (!persistRequested.value) {
      const result = await requestPersistentStorage()
      await save({ persistRequested: true, persisted: result })
    }
  }

  function setTheme(value: ThemePreference) {
    theme.value = value
    writeThemeMirror(value)
    void save({ theme: value })
  }

  function setLastCollection(id: string | null) {
    if (lastCollectionId.value === id) return
    lastCollectionId.value = id
    void save({ lastCollectionId: id })
  }

  function markExported(at = Date.now()) {
    lastExportAt.value = at
    return save({ lastExportAt: at })
  }

  function snoozeBackupReminder(until: number) {
    backupReminderSnoozedUntil.value = until
    return save({ backupReminderSnoozedUntil: until })
  }

  return {
    theme,
    resolvedTheme,
    lastCollectionId,
    lastExportAt,
    persistRequested,
    persisted,
    backupReminderSnoozedUntil,
    loaded,
    init,
    setTheme,
    setLastCollection,
    markExported,
    snoozeBackupReminder,
  }
})
