import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as repo from '@/db/repo'
import type { Collection, CollectionInput } from '@/db/types'
import { useSettingsStore } from './settings'

export const useCollectionsStore = defineStore('collections', () => {
  const settings = useSettingsStore()

  const collections = ref<Collection[]>([])
  const activeId = ref<string | null>(null)
  const loaded = ref(false)

  const active = computed(() => collections.value.find((c) => c.id === activeId.value) ?? null)

  function setActive(id: string | null) {
    activeId.value = id
    settings.setLastCollection(id)
  }

  /** Loads all jars and opens the last active one, or the first if it no longer exists. */
  async function load() {
    collections.value = await repo.listCollections()
    const remembered = collections.value.find((c) => c.id === settings.lastCollectionId)
    setActive(remembered?.id ?? collections.value[0]?.id ?? null)
    loaded.value = true
  }

  async function create(input: CollectionInput) {
    const collection = await repo.createCollection(input)
    collections.value.push(collection)
    setActive(collection.id)
    return collection
  }

  async function update(id: string, patch: Partial<CollectionInput>) {
    const updated = await repo.updateCollection(id, patch)
    const index = collections.value.findIndex((c) => c.id === id)
    if (index !== -1) collections.value[index] = updated
    return updated
  }

  /** Deletes a jar and everything in it. If it was active, opens its neighbour. */
  async function remove(id: string) {
    await repo.deleteCollection(id)
    const index = collections.value.findIndex((c) => c.id === id)
    if (index === -1) return
    collections.value.splice(index, 1)
    if (activeId.value === id) {
      const neighbour = collections.value[index] ?? collections.value[index - 1] ?? null
      setActive(neighbour?.id ?? null)
    }
  }

  /** Reorders optimistically, then persists. Restores the previous order if the write fails. */
  async function reorder(ids: string[]) {
    const byId = new Map(collections.value.map((c) => [c.id, c]))
    const previous = collections.value
    collections.value = ids.flatMap((id, order) => {
      const c = byId.get(id)
      return c ? [{ ...c, order }] : []
    })
    try {
      await repo.reorderCollections(ids)
    } catch (error) {
      collections.value = previous
      throw error
    }
  }

  return { collections, activeId, active, loaded, load, setActive, create, update, remove, reorder }
})
