// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import * as repo from '@/db/repo'
import {
  BackupError,
  backupFileName,
  base64ToBytes,
  bytesToBase64,
  createBackup,
  importBackup,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from '@/db/backup'

const TEAL = '#5EC4C4'
const PINK = '#E198B6'

async function resetDb() {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
}

function imageBlob(bytes: number[], type = 'image/webp') {
  return new Blob([new Uint8Array(bytes)], { type })
}

async function bytesOf(blob: Blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

/** Every table's contents, with images resolved per item, for field-by-field comparison. */
async function snapshot() {
  const collections = await repo.listCollections()
  const items = (await db.items.toArray()).sort((a, b) => a.id.localeCompare(b.id))
  const withImages = await Promise.all(
    items.map(async ({ imageId, ...item }) => {
      const image = imageId ? await repo.getImage(imageId) : undefined
      return {
        ...item,
        image: image
          ? {
              type: image.blob.type,
              width: image.width,
              height: image.height,
              bytes: await bytesOf(image.blob),
            }
          : null,
      }
    }),
  )
  return { collections, items: withImages, imageRows: await db.images.count() }
}

/** A realistic data set: gaps in the jar order, images, targets, locks, unicode names. */
async function seed() {
  const fruit = await repo.createCollection({ name: 'Fruit 🍎', color: TEAL })
  const gone = await repo.createCollection({ name: 'Gone', color: PINK })
  const books = await repo.createCollection({ name: 'Books', color: PINK })
  await repo.deleteCollection(gone.id) // leaves a gap in `order`

  const apple = await repo.createItem(fruit.id, {
    name: 'Apples',
    color: '#F2A65A',
    startCount: 3,
    target: 2000,
    step: 200,
  })
  await repo.setCount(apple.id, 1234)
  await repo.setItemImage(apple.id, {
    blob: imageBlob([0, 1, 2, 250, 251, 252, 253, 254, 255]),
    width: 256,
    height: 256,
  })
  const pear = await repo.createItem(fruit.id, {
    name: 'Pears',
    color: TEAL,
    target: 5,
    onTarget: 'lock',
  })
  await repo.setCount(pear.id, 5)
  const novel = await repo.createItem(books.id, { name: 'Ünïcödé “novel”', color: PINK })
  await repo.setItemImage(novel.id, {
    blob: imageBlob([9, 8, 7], 'image/jpeg'),
    width: 256,
    height: 256,
  })
  await repo.reorderItems(fruit.id, [pear.id, apple.id])
  // Settings are not part of a backup.
  await repo.updateSettings({ theme: 'dark', lastExportAt: 1 })
  return { fruit, books, apple, pear, novel }
}

async function exportText() {
  return serializeBackup(await createBackup(new Date('2026-11-10T16:00:00Z')))
}

beforeEach(resetDb)

describe('base64', () => {
  it('round-trips every byte value, including large buffers', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('rejects text that is not base64', () => {
    expect(base64ToBytes('not base64!')).toBeNull()
    expect(base64ToBytes('abc')).toBeNull()
  })
})

describe('export', () => {
  it('writes the documented format with images inline and no imageId', async () => {
    const { fruit, apple } = await seed()
    const backup = JSON.parse(await exportText()) as BackupFile
    expect(backup).toMatchObject({
      app: 'tallyjar',
      schemaVersion: 1,
      exportedAt: '2026-11-10T16:00:00.000Z',
    })
    expect(backup.collections.map((c) => c.name)).toEqual(['Fruit 🍎', 'Books'])
    expect(Object.keys(backup.collections[0]!).sort()).toEqual(
      ['color', 'createdAt', 'id', 'name', 'order', 'updatedAt'].sort(),
    )
    // Items follow jar order, then item order.
    expect(backup.items.map((i) => i.name)).toEqual(['Pears', 'Apples', 'Ünïcödé “novel”'])
    const exportedApple = backup.items.find((i) => i.id === apple.id)!
    expect(exportedApple).not.toHaveProperty('imageId')
    expect(exportedApple.collectionId).toBe(fruit.id)
    expect(exportedApple.image).toEqual({
      mime: 'image/webp',
      width: 256,
      height: 256,
      data: bytesToBase64(new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])),
    })
    expect(backup.items.find((i) => i.name === 'Pears')!.image).toBeNull()
  })

  it('names the file after the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 30))).toBe('tallyjar-backup-2026-01-05.json')
  })
})

describe('round trip', () => {
  it('export → wipe → import (Replace) reproduces every jar, item and image', async () => {
    await seed()
    const before = await snapshot()
    const text = await exportText()

    await resetDb()
    const parsed = parseBackup(text)
    expect(parsed.summary).toEqual({ collections: 2, items: 3, images: 2 })
    await importBackup(parsed, 'replace')

    const after = await snapshot()
    expect(after).toEqual(before)
    expect(after.imageRows).toBe(2)
  })

  it('Replace discards what was there and leaves settings alone', async () => {
    await seed()
    const text = await exportText()
    const extra = await repo.createCollection({ name: 'Extra', color: TEAL })
    await repo.createItem(extra.id, { name: 'Extra item', color: TEAL })
    const settings = await repo.getSettings()

    await importBackup(parseBackup(text), 'replace')
    expect((await repo.listCollections()).map((c) => c.name)).toEqual(['Fruit 🍎', 'Books'])
    expect(await db.items.count()).toBe(3)
    expect(await db.images.count()).toBe(2)
    expect(await repo.getSettings()).toEqual(settings)
  })

  it('Add as new appends copies with fresh IDs and leaves existing data untouched', async () => {
    const { fruit } = await seed()
    const before = await snapshot()
    const text = await exportText()

    const result = await importBackup(parseBackup(text), 'add')
    const collections = await repo.listCollections()
    expect(collections.map((c) => c.name)).toEqual(['Fruit 🍎', 'Books', 'Fruit 🍎', 'Books'])
    expect(result.collectionIds).toEqual(collections.slice(2).map((c) => c.id))
    expect(new Set(collections.map((c) => c.id)).size).toBe(4)
    // Appended after the existing jars.
    expect(collections[2]!.order).toBeGreaterThan(collections[1]!.order)

    // Copies point at the new jars, in the same order, with their own image rows.
    const copiedFruit = await repo.listItems(result.collectionIds[0]!)
    expect(copiedFruit.map((i) => i.name)).toEqual(['Pears', 'Apples'])
    expect(copiedFruit.every((i) => i.collectionId !== fruit.id)).toBe(true)
    expect(await db.images.count()).toBe(4)
    const copiedApple = copiedFruit[1]!
    expect(copiedApple).toMatchObject({ count: 1234, startCount: 3, target: 2000, step: 200 })
    expect(await bytesOf((await repo.getImage(copiedApple.imageId!))!.blob)).toEqual([
      0, 1, 2, 250, 251, 252, 253, 254, 255,
    ])

    // The originals are exactly as they were.
    const now = await snapshot()
    const originalIds = new Set(before.items.map((i) => i.id))
    expect(now.items.filter((i) => originalIds.has(i.id))).toEqual(before.items)
  })

  it('importing into an empty device keeps the backup as-is', async () => {
    await seed()
    const text = await exportText()
    await resetDb()
    await importBackup(parseBackup(text), 'add')
    const collections = await repo.listCollections()
    expect(collections.map((c) => [c.name, c.order])).toEqual([
      ['Fruit 🍎', 0],
      ['Books', 1],
    ])
  })
})

describe('validation', () => {
  function validBackup(): BackupFile {
    return {
      app: 'tallyjar',
      schemaVersion: 1,
      exportedAt: '2026-11-10T16:00:00.000Z',
      collections: [{ id: 'c1', name: 'Jar', color: TEAL, order: 0, createdAt: 1, updatedAt: 2 }],
      items: [
        {
          id: 'i1',
          collectionId: 'c1',
          name: 'Thing',
          color: PINK,
          count: 4,
          startCount: 0,
          target: 10,
          onTarget: 'continue',
          step: 1,
          order: 0,
          createdAt: 1,
          updatedAt: 2,
          image: null,
        },
      ],
    }
  }

  const withItem = (patch: Record<string, unknown>) => {
    const b = validBackup()
    Object.assign(b.items[0]!, patch)
    return JSON.stringify(b)
  }

  it('accepts a valid file', () => {
    expect(parseBackup(JSON.stringify(validBackup())).summary).toEqual({
      collections: 1,
      items: 1,
      images: 0,
    })
  })

  it.each([
    ['not JSON', '{oops', /valid JSON/],
    ['another app', JSON.stringify({ app: 'other' }), /isn’t a Tallyjar backup/],
    ['an array', '[]', /isn’t a Tallyjar backup/],
    [
      'a newer schema',
      JSON.stringify({ ...validBackup(), schemaVersion: 2 }),
      /newer version of Tallyjar/,
    ],
    ['no schema', JSON.stringify({ ...validBackup(), schemaVersion: '1' }), /schema version/],
    ['missing items', JSON.stringify({ ...validBackup(), items: undefined }), /missing/],
    ['an orphan item', withItem({ collectionId: 'nope' }), /jar that isn’t in the backup/],
    ['a bad color', withItem({ color: 'red' }), /Item “Thing”: color/],
    ['an empty name', withItem({ name: '   ' }), /name is empty/],
    ['a fractional count', withItem({ count: 1.5 }), /count must be a whole number/],
    ['a text count', withItem({ count: '4' }), /count must be a whole number/],
    ['an unknown onTarget', withItem({ onTarget: 'explode' }), /onTarget/],
    [
      'an SVG image',
      withItem({ image: { mime: 'image/svg+xml', width: 1, height: 1, data: 'AAAA' } }),
      /WebP, JPEG or PNG/,
    ],
    [
      'broken image data',
      withItem({ image: { mime: 'image/webp', width: 256, height: 256, data: '!!' } }),
      /base64/,
    ],
    [
      'a zero-size image',
      withItem({ image: { mime: 'image/webp', width: 0, height: 256, data: 'AAAA' } }),
      /width is out of range/,
    ],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseBackup(text)).toThrow(BackupError)
    expect(() => parseBackup(text)).toThrow(message)
  })

  it('rejects duplicate IDs', () => {
    const b = validBackup()
    b.items.push({ ...b.items[0]! })
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/share the ID/)
    const c = validBackup()
    c.collections.push({ ...c.collections[0]! })
    expect(() => parseBackup(JSON.stringify(c))).toThrow(/share the ID/)
  })

  it('clamps out-of-range numbers and fills safe defaults', () => {
    const parsed = parseBackup(
      withItem({
        count: -5,
        startCount: undefined,
        step: 0,
        target: -3,
        onTarget: undefined,
        name: '  ' + 'x'.repeat(80) + '  ',
        color: '#e198b6',
        createdAt: 'yesterday',
      }),
    )
    const item = parsed.items[0]!
    expect(item).toMatchObject({
      count: 0,
      startCount: 0,
      step: 1,
      target: 1,
      onTarget: 'continue',
      color: '#E198B6',
    })
    expect(item.name).toBe('x'.repeat(60))
    expect(item.createdAt).toBeGreaterThan(0)
    expect(parseBackup(withItem({ count: 1e300 })).items[0]!.count).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('a malformed file changes nothing', async () => {
    await seed()
    const before = await snapshot()
    const settings = await repo.getSettings()
    for (const text of ['{oops', withItem({ collectionId: 'nope' }), withItem({ color: 'red' })]) {
      expect(() => parseBackup(text)).toThrow(BackupError)
    }
    expect(await snapshot()).toEqual(before)
    expect(await repo.getSettings()).toEqual(settings)
  })

  it('a failing import rolls back completely, even with Replace', async () => {
    await seed()
    const before = await snapshot()
    const parsed = parseBackup(JSON.stringify(validBackup()))
    // Force a failure midway: an item whose jar mapping is missing breaks the write.
    parsed.items.push({ ...parsed.items[0]!, id: 'i1' })
    await expect(importBackup(parsed, 'replace')).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
})
