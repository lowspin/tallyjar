import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import * as repo from '@/db/repo'
import { assertCount } from '@/db/validate'
import type { ImageInput, Item, ItemInput, ItemPatch } from '@/db/types'
import { useCollectionsStore } from './collections'

/** Delay before a count change is written, so hold-to-repeat doesn't hammer IndexedDB. */
export const COUNT_WRITE_DELAY_MS = 300

/** Holds the items of the active jar. */
export const useItemsStore = defineStore('items', () => {
  const collections = useCollectionsStore()

  const collectionId = ref<string | null>(null)
  const items = ref<Item[]>([])
  const loaded = ref(false)

  // ─── Debounced count writes ───────────────────────────────────────────────
  const pendingCounts = new Map<string, number>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  /** Writes all pending count changes now. */
  async function flushCounts() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    const writes = [...pendingCounts]
    pendingCounts.clear()
    await Promise.all(
      writes.map(([id, count]) =>
        repo.setCount(id, count).catch((error) => {
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

  /** Updates the count in the UI immediately and writes it shortly after. */
  function setCount(id: string, count: number) {
    assertCount(count)
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    item.count = count
    item.updatedAt = Date.now()
    pendingCounts.set(id, count)
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => void flushCounts(), COUNT_WRITE_DELAY_MS)
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
    // A pending debounced count must not overwrite an explicit edit.
    if (patch.count !== undefined) pendingCounts.delete(id)
    else await flushCounts()
    const updated = await repo.updateItem(id, patch)
    replace(updated)
    return updated
  }

  async function remove(id: string) {
    pendingCounts.delete(id)
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
    flushCounts,
  }
})
