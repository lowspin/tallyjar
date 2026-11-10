import { db } from './db'
import type { Collection, ImageInput, Item, OnTarget } from './types'
import { COLLECTION_NAME_MAX, ITEM_NAME_MAX, MAX_COUNT, isHexColor } from './validate'

/**
 * Backup files: export, parsing/validation and import (REQUIREMENTS §7).
 * Parsing never touches the database, so a bad file changes nothing. Import runs in one
 * Dexie transaction.
 */

export const BACKUP_APP = 'tallyjar'
export const BACKUP_SCHEMA_VERSION = 1
export const BACKUP_MIME = 'application/json'
/** Generous: a 256 px WebP thumbnail is usually 5–30 KB. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const IMAGE_MIMES = new Set(['image/webp', 'image/jpeg', 'image/png'])

export interface BackupImage {
  mime: string
  width: number
  height: number
  data: string // base64
}

export type BackupCollection = Collection

export interface BackupItem extends Omit<Item, 'imageId'> {
  image: BackupImage | null
}

export interface BackupFile {
  app: typeof BACKUP_APP
  schemaVersion: number
  exportedAt: string
  collections: BackupCollection[]
  items: BackupItem[]
}

export interface BackupSummary {
  collections: number
  items: number
  images: number
}

/** A validated backup, ready to import. Images are already decoded to Blobs. */
export interface ParsedBackup {
  collections: Collection[]
  items: (Omit<Item, 'imageId'> & { image: ImageInput | null })[]
  summary: BackupSummary
}

export type ImportMode = 'replace' | 'add'

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

// ─── Base64 ─────────────────────────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** Decodes base64, or returns null if it isn't valid base64. */
export function base64ToBytes(data: string): Uint8Array | null {
  const clean = data.replace(/\s+/g, '')
  if (!BASE64.test(clean)) return null
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ─── Export ─────────────────────────────────────────────────────────────────

/** Reads everything into a backup object. Thumbnails are always included. */
export async function createBackup(now = new Date()): Promise<BackupFile> {
  const [collections, items, images] = await db.transaction(
    'r',
    db.collections,
    db.items,
    db.images,
    () => Promise.all([db.collections.toArray(), db.items.toArray(), db.images.toArray()]),
  )
  const imageById = new Map(images.map((i) => [i.id, i]))
  const sortedCollections = [...collections].sort((a, b) => a.order - b.order)
  const collectionIndex = new Map(sortedCollections.map((c, index) => [c.id, index]))
  const sortedItems = [...items].sort(
    (a, b) =>
      (collectionIndex.get(a.collectionId) ?? 0) - (collectionIndex.get(b.collectionId) ?? 0) ||
      a.order - b.order,
  )

  // Blob reads happen outside the transaction: awaiting non-IndexedDB work inside one
  // would let it auto-commit.
  const backupItems = await Promise.all(
    sortedItems.map(async ({ imageId, ...item }): Promise<BackupItem> => {
      const stored = imageId ? imageById.get(imageId) : undefined
      const image = stored
        ? {
            mime: stored.blob.type || 'image/webp',
            width: stored.width,
            height: stored.height,
            data: bytesToBase64(new Uint8Array(await stored.blob.arrayBuffer())),
          }
        : null
      return { ...item, image }
    }),
  )

  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    collections: sortedCollections.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      order: c.order,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    items: backupItems,
  }
}

export function summarize(backup: Pick<BackupFile, 'collections' | 'items'>): BackupSummary {
  return {
    collections: backup.collections.length,
    items: backup.items.length,
    images: backup.items.filter((i) => i.image).length,
  }
}

/** `tallyjar-backup-YYYY-MM-DD.json`, using the local date. */
export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `tallyjar-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

// ─── Parsing and validation ─────────────────────────────────────────────────

type Obj = Record<string, unknown>

const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Reads JSON text and validates it. Throws BackupError with a readable message. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError('This file isn’t valid JSON, so it can’t be a Tallyjar backup.')
  }
  if (!isObject(data) || data.app !== BACKUP_APP)
    throw new BackupError('This file isn’t a Tallyjar backup.')

  const version = data.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    throw new BackupError('This backup has no valid schema version.')
  if (version > BACKUP_SCHEMA_VERSION)
    throw new BackupError(
      'This backup was made by a newer version of Tallyjar. Reload the app to update it, then try again.',
    )

  if (!Array.isArray(data.collections) || !Array.isArray(data.items))
    throw new BackupError('This backup is missing its jars or items.')

  const collections = data.collections.map((raw, index) => parseCollection(raw, index))
  const collectionIds = new Set<string>()
  for (const c of collections) {
    if (collectionIds.has(c.id)) throw new BackupError(`Two jars share the ID “${c.id}”.`)
    collectionIds.add(c.id)
  }

  const items = data.items.map((raw, index) => parseItem(raw, index))
  const itemIds = new Set<string>()
  for (const item of items) {
    if (itemIds.has(item.id)) throw new BackupError(`Two items share the ID “${item.id}”.`)
    itemIds.add(item.id)
    if (!collectionIds.has(item.collectionId))
      throw new BackupError(`Item “${item.name}” belongs to a jar that isn’t in the backup.`)
  }

  return {
    collections,
    items,
    summary: {
      collections: collections.length,
      items: items.length,
      images: items.filter((i) => i.image).length,
    },
  }
}

/** Builds field readers that prefix errors with which record failed. */
function reader(raw: unknown, label: string) {
  if (!isObject(raw)) throw new BackupError(`${label} isn’t a valid record.`)
  const fail = (message: string): never => {
    throw new BackupError(`${label}: ${message}`)
  }
  return {
    fail,
    id(key: string) {
      const value = raw[key]
      if (typeof value !== 'string' || !value.trim() || value.length > 200)
        fail(`${key} must be a non-empty ID.`)
      return value as string
    },
    /** Trims; too-long names are shortened rather than rejected. */
    name(max: number) {
      const value = raw.name
      if (typeof value !== 'string') fail('name must be text.')
      const chars = [...(value as string).trim()]
      if (!chars.length) fail('name is empty.')
      return chars.slice(0, max).join('').trimEnd()
    },
    color() {
      const value = raw.color
      if (!isHexColor(value)) fail('color must be a hex value like #5EC4C4.')
      return (value as string).toUpperCase()
    },
    /** Any integer; clamped into [min, max]. */
    int(key: string, min: number, fallback?: number) {
      const value = raw[key]
      if (value === undefined && fallback !== undefined) return fallback
      if (typeof value !== 'number' || !Number.isInteger(value))
        fail(`${key} must be a whole number.`)
      return clamp(value as number, min, MAX_COUNT)
    },
    /** Order keys only need to be sortable. */
    order(fallback: number) {
      const value = raw.order
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    },
    /** Timestamps: kept if valid, otherwise replaced with now. */
    time(key: string) {
      const value = raw[key]
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now()
    },
    raw,
  }
}

function parseCollection(raw: unknown, index: number): Collection {
  const label =
    isObject(raw) && typeof raw.name === 'string' ? `Jar “${raw.name}”` : `Jar ${index + 1}`
  const r = reader(raw, label)
  return {
    id: r.id('id'),
    name: r.name(COLLECTION_NAME_MAX),
    color: r.color(),
    order: r.order(index),
    createdAt: r.time('createdAt'),
    updatedAt: r.time('updatedAt'),
  }
}

function parseItem(raw: unknown, index: number): ParsedBackup['items'][number] {
  const label =
    isObject(raw) && typeof raw.name === 'string' ? `Item “${raw.name}”` : `Item ${index + 1}`
  const r = reader(raw, label)

  const startCount = r.int('startCount', 0, 0)
  const count = r.int('count', 0)
  const step = r.int('step', 1, 1)

  let target: number | null = null
  if (r.raw.target !== null && r.raw.target !== undefined) target = r.int('target', 1)

  let onTarget: OnTarget = 'continue'
  if (r.raw.onTarget !== undefined) {
    if (r.raw.onTarget !== 'continue' && r.raw.onTarget !== 'lock')
      r.fail('onTarget must be “continue” or “lock”.')
    onTarget = r.raw.onTarget as OnTarget
  }

  return {
    id: r.id('id'),
    collectionId: r.id('collectionId'),
    name: r.name(ITEM_NAME_MAX),
    color: r.color(),
    count,
    startCount,
    target,
    onTarget,
    step,
    order: r.order(index),
    createdAt: r.time('createdAt'),
    updatedAt: r.time('updatedAt'),
    image: parseImage(r.raw.image, r.fail),
  }
}

function parseImage(raw: unknown, fail: (message: string) => never): ImageInput | null {
  if (raw === null || raw === undefined) return null
  if (!isObject(raw)) fail('image isn’t valid.')
  const image = raw as Obj
  if (typeof image.mime !== 'string' || !IMAGE_MIMES.has(image.mime))
    fail('image must be WebP, JPEG or PNG.')
  for (const key of ['width', 'height'] as const) {
    const value = image[key]
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 4096)
      fail(`image ${key} is out of range.`)
  }
  if (typeof image.data !== 'string') fail('image data is missing.')
  const bytes = base64ToBytes(image.data as string)
  if (!bytes || bytes.length === 0) fail('image data isn’t valid base64.')
  if (bytes!.length > MAX_IMAGE_BYTES) fail('image is too large.')
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: image.mime as string }),
    width: image.width as number,
    height: image.height as number,
  }
}

// ─── Import ─────────────────────────────────────────────────────────────────

export interface ImportResult {
  /** IDs of the imported jars, in their new display order. */
  collectionIds: string[]
}

/**
 * Writes a parsed backup in a single transaction.
 * - replace: wipes jars, items and images (settings are kept) and restores the backup's IDs.
 * - add: gives everything fresh IDs and appends the jars after the existing ones.
 */
export async function importBackup(backup: ParsedBackup, mode: ImportMode): Promise<ImportResult> {
  const newId = () => crypto.randomUUID()
  const sorted = [...backup.collections].sort((a, b) => a.order - b.order)

  return db.transaction('rw', db.collections, db.items, db.images, async () => {
    let collectionIdMap: Map<string, string>
    let collections: Collection[]

    if (mode === 'replace') {
      await Promise.all([db.collections.clear(), db.items.clear(), db.images.clear()])
      collectionIdMap = new Map(sorted.map((c) => [c.id, c.id]))
      collections = sorted
    } else {
      const last = await db.collections.orderBy('order').last()
      const base = last ? last.order + 1 : 0
      collectionIdMap = new Map(sorted.map((c) => [c.id, newId()]))
      collections = sorted.map((c, index) => ({
        ...c,
        id: collectionIdMap.get(c.id)!,
        order: base + index,
      }))
    }

    const images: { id: string; blob: Blob; width: number; height: number }[] = []
    const items: Item[] = backup.items.map(({ image, ...item }) => {
      let imageId: string | null = null
      if (image) {
        imageId = newId()
        images.push({ id: imageId, ...image })
      }
      return {
        ...item,
        id: mode === 'replace' ? item.id : newId(),
        collectionId: collectionIdMap.get(item.collectionId)!,
        imageId,
      }
    })

    await db.collections.bulkAdd(collections)
    await db.images.bulkAdd(images)
    await db.items.bulkAdd(items)
    return { collectionIds: collections.map((c) => c.id) }
  })
}
