import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import * as repo from '@/db/repo'
import { assertCount } from '@/db/validate'
import { applyDelta } from '@/lib/clamp'
import { forgetUnsaved, markSaved, markUnsaved } from '@/lib/unsavedCounts'
import type { ImageInput, Item, ItemInput, ItemPatch } from '@/db/types'
import { useCollectionsStore } from './collections'

/** At most one count write per this window, so hold-to-repeat doesn't hammer IndexedDB. */
export const COUNT_WRITE_DELAY_MS = 300

/** Holds the items of the active jar. */
export const useItemsStore = defineStore('items', () => {
  const collections = useCollectionsStore()

  const collectionId = ref<string | null>(null)
  const items = ref<Item[]>([])
  const loaded = ref(false)

  // ─── Throttled count writes ───────────────────────────────────────────────
  // The first change is written at once, so a single tap is saved even if the page closes
  // right after. Changes that follow within COUNT_WRITE_DELAY_MS (taps in quick succession,
  // hold-to-repeat) are batched into one trailing write per window.
  const pendingCounts = new Map<string, number>()
  let throttleTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleWrite() {
    if (throttleTimer) return // the trailing write will include this change
    void flushCounts()
    throttleTimer = setTimeout(() => {
      throttleTimer = null
      if (pendingCounts.size) scheduleWrite()
    }, COUNT_WRITE_DELAY_MS)
  }

  /** Writes all pending count changes now. */
  async function flushCounts() {
    const writes = [...pendingCounts]
    pendingCounts.clear()
    await Promise.all(
      writes.map(([id, count]) =>
        repo
          .setCount(id, count)
          .then(() => markSaved(id, count))
          .catch((error) => {
            console.error('Could not save count', error)
          }),
      ),
    )
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushCounts()
    })
    window.addEventListener('pagehide', () => void flushCounts())
  }

  /** Updates the count in the UI immediately and writes it (throttled) to the database. */
  function setCount(id: string, count: number) {
    assertCount(count)
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    item.count = count
    item.updatedAt = Date.now()
    pendingCounts.set(id, count)
    markUnsaved(id, count) // synchronous backup in case the page unloads mid-write
    scheduleWrite()
  }

  /**
   * Adds `delta` (negative to subtract) following the clamping rules.
   * Returns the new count, or null if nothing changed (at a limit).
   */
  function adjust(id: string, delta: number): number | null {
    const item = items.value.find((i) => i.id === id)
    if (!item) return null
    const next = applyDelta(item.count, delta, item)
    if (next === item.count) return null
    setCount(id, next)
    return next
  }

  /** Sets the count back to the item's start count. */
  function reset(id: string) {
    const item = items.value.find((i) => i.id === id)
    if (!item) return Promise.resolve(null)
    return update(id, { count: item.startCount })
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  let loadToken = 0

  async function load(id: string | null) {
    const token = ++loadToken
    await flushCounts()
    const rows = id ? await repo.listItems(id) : []
    if (token !== loadToken) return // a newer load started meanwhile
    collectionId.value = id
    items.value = rows
    loaded.value = true
  }

  watch(
    () => collections.activeId,
    (id) => void load(id),
    { immediate: true },
  )

  function replace(updated: Item) {
    const index = items.value.findIndex((i) => i.id === updated.id)
    if (index !== -1) items.value[index] = updated
  }

  // ─── Mutations ────────────────────────────────────────────────────────────
  async function create(input: ItemInput) {
    if (!collectionId.value) throw new Error('No jar is open')
    const item = await repo.createItem(collectionId.value, input)
    if (item.collectionId === collectionId.value) items.value.push(item)
    return item
  }

  async function update(id: string, patch: ItemPatch) {
    // A pending throttled count must not overwrite an explicit edit.
    if (patch.count !== undefined) pendingCounts.delete(id)
    else await flushCounts()
    const updated = await repo.updateItem(id, patch)
    if (patch.count !== undefined) forgetUnsaved(id)
    replace(updated)
    return updated
  }

  async function remove(id: string) {
    pendingCounts.delete(id)
    forgetUnsaved(id)
    await repo.deleteItem(id)
    items.value = items.value.filter((i) => i.id !== id)
  }

  async function duplicate(id: string, targetCollectionId: string) {
    await flushCounts()
    const copy = await repo.duplicateItem(id, targetCollectionId)
    if (copy.collectionId === collectionId.value) items.value.push(copy)
    return copy
  }

  async function setImage(id: string, image: ImageInput | null) {
    const updated = await repo.setItemImage(id, image)
    replace(updated)
    return updated
  }

  /** Reorders optimistically, then persists. Restores the previous order if the write fails. */
  async function reorder(ids: string[]) {
    if (!collectionId.value) return
    const byId = new Map(items.value.map((i) => [i.id, i]))
    const previous = items.value
    items.value = ids.flatMap((id, order) => {
      const item = byId.get(id)
      return item ? [{ ...item, order }] : []
    })
    try {
      await repo.reorderItems(collectionId.value, ids)
    } catch (error) {
      items.value = previous
      throw error
    }
  }

  return {
    collectionId,
    items,
    loaded,
    load,
    create,
    update,
    remove,
    duplicate,
    setImage,
    reorder,
    setCount,
    adjust,
    reset,
    flushCounts,
  }
})
