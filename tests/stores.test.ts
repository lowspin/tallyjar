import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/db/db'
import * as repo from '@/db/repo'
import { THEME_STORAGE_KEY } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'
import { useCollectionsStore } from '@/stores/collections'
import { COUNT_WRITE_DELAY_MS, useItemsStore } from '@/stores/items'
import { UNSAVED_COUNTS_KEY, recoverUnsavedCounts } from '@/lib/unsavedCounts'
import { BACKUP_STALE_MS, REMINDER_SNOOZE_MS, useBackupStore } from '@/stores/backup'
import { createBackup, parseBackup, serializeBackup } from '@/db/backup'

const TEAL = '#5EC4C4'

/** Waits for pending IndexedDB work and watchers to settle. */
const settle = () => new Promise((r) => setTimeout(r, 20))

beforeEach(async () => {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('settings store', () => {
  it('creates the settings row on first launch, keeping a previously chosen theme', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const settings = useSettingsStore()
    await settings.init()
    expect(settings.theme).toBe('dark')
    expect((await repo.getSettings())!.theme).toBe('dark')
  })

  it('prefers the database over the localStorage mirror and refreshes the mirror', async () => {
    await repo.updateSettings({ theme: 'light', persistRequested: true })
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const settings = useSettingsStore()
    await settings.init()
    expect(settings.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('requests persistent storage once and records the result', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } })

    await useSettingsStore().init()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(await repo.getSettings()).toMatchObject({ persistRequested: true, persisted: true })

    setActivePinia(createPinia())
    await useSettingsStore().init()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('records null when the storage API is missing', async () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined })
    await useSettingsStore().init()
    expect(await repo.getSettings()).toMatchObject({ persistRequested: true, persisted: null })
  })

  it('persists theme changes', async () => {
    const settings = useSettingsStore()
    await settings.init()
    settings.setTheme('dark')
    await settle()
    expect((await repo.getSettings())!.theme).toBe('dark')
  })

  it('defaults to showing done items and persists the hide-done filter', async () => {
    const settings = useSettingsStore()
    await settings.init()
    expect(settings.hideDone).toBe(false)
    settings.setHideDone(true)
    await settle()
    expect((await repo.getSettings())!.hideDone).toBe(true)
  })
})

describe('collections store', () => {
  it('reopens the last active jar on load', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const b = await repo.createCollection({ name: 'B', color: TEAL })
    await repo.updateSettings({ lastCollectionId: b.id, persistRequested: true })

    await useSettingsStore().init()
    const collections = useCollectionsStore()
    await collections.load()
    expect(collections.activeId).toBe(b.id)
    expect(collections.collections.map((c) => c.id)).toEqual([a.id, b.id])
  })

  it('falls back to the first jar when the remembered one is gone', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    await repo.updateSettings({ lastCollectionId: 'deleted', persistRequested: true })
    await useSettingsStore().init()
    const collections = useCollectionsStore()
    await collections.load()
    expect(collections.activeId).toBe(a.id)
  })

  it('remembers the active jar across reloads', async () => {
    await useSettingsStore().init()
    const collections = useCollectionsStore()
    await collections.load()
    await collections.create({ name: 'A', color: TEAL })
    const b = await collections.create({ name: 'B', color: TEAL })
    expect(collections.activeId).toBe(b.id)
    collections.setActive(collections.collections[0]!.id)
    await settle()

    setActivePinia(createPinia())
    await useSettingsStore().init()
    const reloaded = useCollectionsStore()
    await reloaded.load()
    expect(reloaded.active?.name).toBe('A')
  })

  it('removing the active jar opens its neighbour and deletes its items', async () => {
    await useSettingsStore().init()
    const collections = useCollectionsStore()
    await collections.load()
    const a = await collections.create({ name: 'A', color: TEAL })
    const b = await collections.create({ name: 'B', color: TEAL })
    const c = await collections.create({ name: 'C', color: TEAL })
    await repo.createItem(b.id, { name: 'X', color: TEAL })

    collections.setActive(b.id)
    await collections.remove(b.id)
    expect(collections.activeId).toBe(c.id)
    expect(await repo.countItems(b.id)).toBe(0)

    await collections.remove(c.id)
    expect(collections.activeId).toBe(a.id)
    await collections.remove(a.id)
    expect(collections.activeId).toBeNull()
  })

  it('reorders optimistically and persists', async () => {
    await useSettingsStore().init()
    const collections = useCollectionsStore()
    await collections.load()
    const a = await collections.create({ name: 'A', color: TEAL })
    const b = await collections.create({ name: 'B', color: TEAL })
    const done = collections.reorder([b.id, a.id])
    expect(collections.collections.map((c) => c.name)).toEqual(['B', 'A'])
    await done
    expect((await repo.listCollections()).map((c) => c.name)).toEqual(['B', 'A'])
  })

  it('restores the previous order when a reorder fails', async () => {
    await useSettingsStore().init()
    const collections = useCollectionsStore()
    await collections.load()
    const a = await collections.create({ name: 'A', color: TEAL })
    await collections.create({ name: 'B', color: TEAL })
    await expect(collections.reorder([a.id])).rejects.toThrow()
    expect(collections.collections.map((c) => c.name)).toEqual(['A', 'B'])
  })
})

describe('items store', () => {
  async function setup() {
    await useSettingsStore().init()
    const collections = useCollectionsStore()
    const items = useItemsStore()
    await collections.load()
    const jar = await collections.create({ name: 'Jar', color: TEAL })
    await settle()
    return { collections, items, jar }
  }

  it('follows the active jar', async () => {
    const { collections, items, jar } = await setup()
    await items.create({ name: 'X', color: TEAL })
    const other = await collections.create({ name: 'Other', color: TEAL })
    await settle()
    expect(items.collectionId).toBe(other.id)
    expect(items.items).toEqual([])

    collections.setActive(jar.id)
    await settle()
    expect(items.items.map((i) => i.name)).toEqual(['X'])
  })

  it('writes a single change straight away', async () => {
    const { items } = await setup()
    const item = await items.create({ name: 'X', color: TEAL })
    items.setCount(item.id, 1)
    expect(items.items[0]!.count).toBe(1)
    await settle() // well under COUNT_WRITE_DELAY_MS
    expect((await repo.getItem(item.id))!.count).toBe(1)
  })

  it('batches rapid changes into one trailing write', async () => {
    const { items } = await setup()
    const item = await items.create({ name: 'X', color: TEAL })

    items.setCount(item.id, 1) // leading write
    items.setCount(item.id, 2)
    items.setCount(item.id, 3)
    expect(items.items[0]!.count).toBe(3)
    await settle()
    expect((await repo.getItem(item.id))!.count).toBe(1)

    await new Promise((r) => setTimeout(r, COUNT_WRITE_DELAY_MS + 50))
    expect((await repo.getItem(item.id))!.count).toBe(3)
  })

  it('keeps a synchronous localStorage copy of a count until IndexedDB has it', async () => {
    const { items } = await setup()
    const item = await items.create({ name: 'X', color: TEAL })
    items.setCount(item.id, 7)
    expect(JSON.parse(localStorage.getItem(UNSAVED_COUNTS_KEY)!)).toMatchObject({ [item.id]: 7 })
    await settle()
    expect((await repo.getItem(item.id))!.count).toBe(7)
    expect(localStorage.getItem(UNSAVED_COUNTS_KEY)).toBeNull()
  })

  it('recovers counts left over from a session that closed mid-write', async () => {
    const jar = await repo.createCollection({ name: 'Jar', color: TEAL })
    const item = await repo.createItem(jar.id, { name: 'X', color: TEAL })
    localStorage.setItem(UNSAVED_COUNTS_KEY, JSON.stringify({ [item.id]: 42, gone: 5, bad: -1 }))
    const recovered = await recoverUnsavedCounts(repo.setCount)
    expect(recovered).toBe(1)
    expect((await repo.getItem(item.id))!.count).toBe(42)
    expect(localStorage.getItem(UNSAVED_COUNTS_KEY)).toBeNull()
  })

  it('an explicit count edit clears the unsaved copy', async () => {
    const { items } = await setup()
    const item = await items.create({ name: 'X', color: TEAL })
    items.setCount(item.id, 5)
    await items.update(item.id, { count: 100 })
    await new Promise((r) => setTimeout(r, COUNT_WRITE_DELAY_MS + 50))
    expect(localStorage.getItem(UNSAVED_COUNTS_KEY)).toBeNull()
  })

  it('flushes pending counts when the page is hidden', async () => {
    const { items } = await setup()
    const item = await items.create({ name: 'X', color: TEAL })
    items.setCount(item.id, 9)
    window.dispatchEvent(new Event('pagehide'))
    await settle()
    expect((await repo.getItem(item.id))!.count).toBe(9)
  })

  it('an explicit count edit wins over a pending debounced one', async () => {
    const { items } = await setup()
    const item = await items.create({ name: 'X', color: TEAL })
    items.setCount(item.id, 5)
    await items.update(item.id, { count: 100 })
    await new Promise((r) => setTimeout(r, COUNT_WRITE_DELAY_MS + 50))
    expect((await repo.getItem(item.id))!.count).toBe(100)
  })

  it('duplicates include a pending count, and copies into the open jar appear', async () => {
    const { items } = await setup()
    const item = await items.create({ name: 'X', color: TEAL })
    items.setCount(item.id, 7)
    const copy = await items.duplicate(item.id, item.collectionId)
    expect(copy.count).toBe(7)
    expect(items.items.map((i) => i.name)).toEqual(['X', 'X (copy)'])
  })

  it('reorders and removes', async () => {
    const { items } = await setup()
    const x = await items.create({ name: 'X', color: TEAL })
    const y = await items.create({ name: 'Y', color: TEAL })
    await items.reorder([y.id, x.id])
    expect((await repo.listItems(x.collectionId)).map((i) => i.name)).toEqual(['Y', 'X'])
    await items.remove(y.id)
    expect(items.items.map((i) => i.name)).toEqual(['X'])
  })
})

describe('backup store', () => {
  async function setup(itemCount: number) {
    await useSettingsStore().init()
    const collections = useCollectionsStore()
    const items = useItemsStore()
    const backup = useBackupStore()
    await collections.load()
    await collections.create({ name: 'Jar', color: TEAL })
    await settle()
    for (let i = 0; i < itemCount; i++) await items.create({ name: `Item ${i}`, color: TEAL })
    await settle()
    return { settings: useSettingsStore(), collections, items, backup }
  }

  it('shows the reminder from 10 items when there is no recent export', async () => {
    const { items, backup, settings } = await setup(9)
    expect(backup.showReminder).toBe(false)
    await items.create({ name: 'Tenth', color: TEAL })
    await settle()
    expect(backup.totalItems).toBe(10)
    expect(backup.showReminder).toBe(true)

    await settings.markExported(Date.now() - BACKUP_STALE_MS + 60_000)
    expect(backup.showReminder).toBe(false)
    await settings.markExported(Date.now() - BACKUP_STALE_MS - 60_000)
    expect(backup.showReminder).toBe(true)
  })

  it('dismissing snoozes the reminder for two weeks, persisted', async () => {
    const { backup } = await setup(10)
    await backup.snoozeReminder()
    expect(backup.showReminder).toBe(false)
    const until = (await repo.getSettings())!.backupReminderSnoozedUntil!
    expect(until - Date.now()).toBeGreaterThan(REMINDER_SNOOZE_MS - 60_000)
  })

  it('Replace import reloads the open jar and drops stale unsaved counts', async () => {
    const { items, backup } = await setup(1)
    const item = items.items[0]!
    await items.update(item.id, { count: 5 })
    const text = serializeBackup(await createBackup())

    items.setCount(item.id, 99) // pending, newer than the backup
    await backup.runImport(parseBackup(text), 'replace')
    await new Promise((r) => setTimeout(r, COUNT_WRITE_DELAY_MS + 50))

    expect(items.items.map((i) => [i.id, i.count])).toEqual([[item.id, 5]])
    expect((await repo.getItem(item.id))!.count).toBe(5)
    expect(localStorage.getItem(UNSAVED_COUNTS_KEY)).toBeNull()
  })

  it('accepts a backup held in reactive state (IndexedDB cannot clone proxies)', async () => {
    const { collections, backup } = await setup(1)
    const text = serializeBackup(await createBackup())
    // fake-indexeddb clones proxies happily; browsers throw DataCloneError. Check like a browser.
    for (const table of [db.collections, db.items]) {
      const original = table.bulkAdd.bind(table) as (rows: unknown[]) => Promise<unknown>
      vi.spyOn(table, 'bulkAdd').mockImplementation(((rows: unknown[]) => {
        structuredClone(rows)
        return original(rows)
      }) as never)
    }
    await backup.runImport(reactive(parseBackup(text)), 'replace')
    expect(collections.collections).toHaveLength(1)
  })

  it('Add as new opens the first imported jar', async () => {
    const { collections, items, backup } = await setup(2)
    const text = serializeBackup(await createBackup())
    const result = await backup.runImport(parseBackup(text), 'add')
    expect(collections.collections).toHaveLength(2)
    expect(collections.activeId).toBe(result.collectionIds[0])
    expect(items.items.map((i) => i.name)).toEqual(['Item 0', 'Item 1'])
    expect(backup.totalItems).toBe(4)
  })
})
