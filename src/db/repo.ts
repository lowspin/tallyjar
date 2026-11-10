import Dexie from 'dexie'
import { db } from './db'
import type {
  Collection,
  CollectionInput,
  ImageBlob,
  ImageInput,
  Item,
  ItemInput,
  ItemPatch,
  Settings,
} from './types'
import {
  COLLECTION_NAME_MAX,
  ITEM_NAME_MAX,
  ValidationError,
  assertCount,
  assertOnTarget,
  assertStep,
  assertTarget,
  normalizeColor,
  normalizeName,
} from './validate'

const newId = () => crypto.randomUUID()
const COPY_SUFFIX = ' (copy)'

function itemsOf(collectionId: string) {
  return db.items
    .where('[collectionId+order]')
    .between([collectionId, Dexie.minKey], [collectionId, Dexie.maxKey])
}

function assertImage(image: ImageInput): void {
  if (!(image.blob instanceof Blob)) throw new ValidationError('Image must be a Blob')
  if (!Number.isSafeInteger(image.width) || image.width < 1)
    throw new ValidationError('Image width must be a positive integer')
  if (!Number.isSafeInteger(image.height) || image.height < 1)
    throw new ValidationError('Image height must be a positive integer')
}

/** Rewrites `order` to 0..n-1 following `ids`, which must list exactly the given rows. */
function denseOrder<T extends { id: string }>(rows: T[], ids: string[]): Map<string, number> {
  const known = new Set(rows.map((r) => r.id))
  if (
    ids.length !== known.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !known.has(id))
  )
    throw new ValidationError('Reorder list does not match the current items')
  return new Map(ids.map((id, index) => [id, index]))
}

// ─── Collections ────────────────────────────────────────────────────────────

export function listCollections(): Promise<Collection[]> {
  return db.collections.orderBy('order').toArray()
}

export function getCollection(id: string): Promise<Collection | undefined> {
  return db.collections.get(id)
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  const name = normalizeName(input.name, COLLECTION_NAME_MAX)
  const color = normalizeColor(input.color)
  return db.transaction('rw', db.collections, async () => {
    const last = await db.collections.orderBy('order').last()
    const now = Date.now()
    const collection: Collection = {
      id: newId(),
      name,
      color,
      order: last ? last.order + 1 : 0,
      createdAt: now,
      updatedAt: now,
    }
    await db.collections.add(collection)
    return collection
  })
}

export async function updateCollection(
  id: string,
  patch: Partial<CollectionInput>,
): Promise<Collection> {
  const changes: Partial<Collection> = { updatedAt: Date.now() }
  if (patch.name !== undefined) changes.name = normalizeName(patch.name, COLLECTION_NAME_MAX)
  if (patch.color !== undefined) changes.color = normalizeColor(patch.color)
  return db.transaction('rw', db.collections, async () => {
    const existing = await db.collections.get(id)
    if (!existing) throw new ValidationError('Jar not found')
    const updated = { ...existing, ...changes }
    await db.collections.put(updated)
    return updated
  })
}

export function countItems(collectionId: string): Promise<number> {
  return db.items.where('collectionId').equals(collectionId).count()
}

/** Deletes a collection with all of its items and their images, atomically. */
export async function deleteCollection(id: string): Promise<void> {
  await db.transaction('rw', db.collections, db.items, db.images, async () => {
    const items = await db.items.where('collectionId').equals(id).toArray()
    const imageIds = items.flatMap((i) => (i.imageId ? [i.imageId] : []))
    await db.images.bulkDelete(imageIds)
    await db.items.bulkDelete(items.map((i) => i.id))
    await db.collections.delete(id)
  })
}

export async function reorderCollections(ids: string[]): Promise<void> {
  await db.transaction('rw', db.collections, async () => {
    const rows = await db.collections.toArray()
    const order = denseOrder(rows, ids)
    await db.collections.bulkPut(rows.map((c) => ({ ...c, order: order.get(c.id)! })))
  })
}

// ─── Items ──────────────────────────────────────────────────────────────────

export function listItems(collectionId: string): Promise<Item[]> {
  return itemsOf(collectionId).toArray()
}

export function getItem(id: string): Promise<Item | undefined> {
  return db.items.get(id)
}

async function nextItemOrder(collectionId: string): Promise<number> {
  const last = await itemsOf(collectionId).last()
  return last ? last.order + 1 : 0
}

export async function createItem(collectionId: string, input: ItemInput): Promise<Item> {
  const name = normalizeName(input.name, ITEM_NAME_MAX)
  const color = normalizeColor(input.color)
  const startCount = assertCount(input.startCount ?? 0, 'Start count')
  const target = assertTarget(input.target ?? null)
  const onTarget = assertOnTarget(input.onTarget ?? 'continue')
  const step = assertStep(input.step ?? 1)

  return db.transaction('rw', db.collections, db.items, async () => {
    if (!(await db.collections.get(collectionId))) throw new ValidationError('Jar not found')
    const now = Date.now()
    const item: Item = {
      id: newId(),
      collectionId,
      name,
      color,
      imageId: null,
      count: startCount,
      startCount,
      target,
      onTarget,
      step,
      order: await nextItemOrder(collectionId),
      createdAt: now,
      updatedAt: now,
    }
    await db.items.add(item)
    return item
  })
}

export async function updateItem(id: string, patch: ItemPatch): Promise<Item> {
  const changes: Partial<Item> = { updatedAt: Date.now() }
  if (patch.name !== undefined) changes.name = normalizeName(patch.name, ITEM_NAME_MAX)
  if (patch.color !== undefined) changes.color = normalizeColor(patch.color)
  if (patch.count !== undefined) changes.count = assertCount(patch.count)
  if (patch.startCount !== undefined)
    changes.startCount = assertCount(patch.startCount, 'Start count')
  if (patch.target !== undefined) changes.target = assertTarget(patch.target)
  if (patch.onTarget !== undefined) changes.onTarget = assertOnTarget(patch.onTarget)
  if (patch.step !== undefined) changes.step = assertStep(patch.step)

  return db.transaction('rw', db.items, async () => {
    const existing = await db.items.get(id)
    if (!existing) throw new ValidationError('Item not found')
    const updated = { ...existing, ...changes }
    await db.items.put(updated)
    return updated
  })
}

/** Writes a count only. Clamping rules live in lib/clamp.ts and are applied by the caller. */
export async function setCount(id: string, count: number): Promise<void> {
  assertCount(count)
  const changed = await db.items.update(id, { count, updatedAt: Date.now() })
  if (!changed && !(await db.items.get(id))) throw new ValidationError('Item not found')
}

/** Deletes an item and its image, atomically. */
export async function deleteItem(id: string): Promise<void> {
  await db.transaction('rw', db.items, db.images, async () => {
    const item = await db.items.get(id)
    if (!item) return
    if (item.imageId) await db.images.delete(item.imageId)
    await db.items.delete(id)
  })
}

/**
 * Copies an item into a collection (possibly the same one). The copy gets its own image blob,
 * is appended at the end, and is named "<name> (copy)" only when duplicated within its own jar.
 */
export async function duplicateItem(id: string, targetCollectionId: string): Promise<Item> {
  return db.transaction('rw', db.collections, db.items, db.images, async () => {
    const source = await db.items.get(id)
    if (!source) throw new ValidationError('Item not found')
    if (!(await db.collections.get(targetCollectionId))) throw new ValidationError('Jar not found')

    let imageId: string | null = null
    if (source.imageId) {
      const image = await db.images.get(source.imageId)
      if (image) {
        imageId = newId()
        const blob = image.blob.slice(0, image.blob.size, image.blob.type)
        await db.images.add({ id: imageId, blob, width: image.width, height: image.height })
      }
    }

    const now = Date.now()
    const copy: Item = {
      ...source,
      id: newId(),
      collectionId: targetCollectionId,
      name: source.collectionId === targetCollectionId ? copyName(source.name) : source.name,
      imageId,
      order: await nextItemOrder(targetCollectionId),
      createdAt: now,
      updatedAt: now,
    }
    await db.items.add(copy)
    return copy
  })
}

/** Appends " (copy)", trimming the base name if needed to stay within the length limit. */
export function copyName(name: string): string {
  const room = ITEM_NAME_MAX - COPY_SUFFIX.length
  const chars = [...name]
  const base = chars.length > room ? chars.slice(0, room).join('').trimEnd() : name
  return base + COPY_SUFFIX
}

export async function reorderItems(collectionId: string, ids: string[]): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    const rows = await itemsOf(collectionId).toArray()
    const order = denseOrder(rows, ids)
    await db.items.bulkPut(rows.map((i) => ({ ...i, order: order.get(i.id)! })))
  })
}

// ─── Images ─────────────────────────────────────────────────────────────────

export function getImage(id: string): Promise<ImageBlob | undefined> {
  return db.images.get(id)
}

/** Sets, replaces (deleting the old blob) or removes (`null`) an item's thumbnail. */
export async function setItemImage(itemId: string, image: ImageInput | null): Promise<Item> {
  if (image) assertImage(image)
  return db.transaction('rw', db.items, db.images, async () => {
    const item = await db.items.get(itemId)
    if (!item) throw new ValidationError('Item not found')
    if (item.imageId) await db.images.delete(item.imageId)
    let imageId: string | null = null
    if (image) {
      imageId = newId()
      await db.images.add({ id: imageId, ...image })
    }
    const updated = { ...item, imageId, updatedAt: Date.now() }
    await db.items.put(updated)
    return updated
  })
}

// ─── Settings ───────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  lastCollectionId: null,
  theme: 'system',
  lastExportAt: null,
  persistRequested: false,
  persisted: null,
}

/** Returns the settings row, or null on a fresh install where none exists yet. */
export async function getSettings(): Promise<Settings | null> {
  const row = await db.settings.get('app')
  return row ? { ...DEFAULT_SETTINGS, ...row } : null
}

export async function updateSettings(patch: Partial<Omit<Settings, 'key'>>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    const next: Settings = { ...DEFAULT_SETTINGS, ...current, ...patch, key: 'app' }
    await db.settings.put(next)
    return next
  })
}
