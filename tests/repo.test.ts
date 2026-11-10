// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import * as repo from '@/db/repo'
import { ValidationError } from '@/db/validate'

const TEAL = '#5EC4C4'
const PINK = '#E198B6'

async function resetDb() {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
}

function pngBlob(bytes: number[] = [1, 2, 3, 4]) {
  return new Blob([new Uint8Array(bytes)], { type: 'image/webp' })
}

async function bytesOf(blob: Blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

beforeEach(resetDb)

describe('collections', () => {
  it('creates with trimmed name, uppercase color and appended order', async () => {
    const a = await repo.createCollection({ name: '  Snacks ', color: '#5ec4c4' })
    const b = await repo.createCollection({ name: 'Books', color: PINK })
    expect(a).toMatchObject({ name: 'Snacks', color: TEAL, order: 0 })
    expect(b.order).toBe(1)
    expect(a.id).not.toBe(b.id)
    expect((await repo.listCollections()).map((c) => c.name)).toEqual(['Snacks', 'Books'])
  })

  it('appends after the highest order even with gaps', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    await repo.createCollection({ name: 'B', color: TEAL })
    await repo.createCollection({ name: 'C', color: TEAL })
    await repo.deleteCollection(a.id)
    const d = await repo.createCollection({ name: 'D', color: TEAL })
    expect(d.order).toBe(3)
  })

  it('rejects invalid names and colors', async () => {
    await expect(repo.createCollection({ name: '   ', color: TEAL })).rejects.toThrow(
      ValidationError,
    )
    await expect(repo.createCollection({ name: 'x'.repeat(41), color: TEAL })).rejects.toThrow(
      /at most 40/,
    )
    await expect(repo.createCollection({ name: 'Ok', color: 'teal' })).rejects.toThrow(
      ValidationError,
    )
    expect(await repo.listCollections()).toEqual([])
  })

  it('counts emoji as single characters for the length limit', async () => {
    const name = '🫙'.repeat(40)
    await expect(repo.createCollection({ name, color: TEAL })).resolves.toMatchObject({ name })
  })

  it('updates name and color and bumps updatedAt', async () => {
    const a = await repo.createCollection({ name: 'Snacks', color: TEAL })
    await new Promise((r) => setTimeout(r, 2))
    const u = await repo.updateCollection(a.id, { name: 'Treats', color: PINK })
    expect(u).toMatchObject({ name: 'Treats', color: PINK, order: 0, createdAt: a.createdAt })
    expect(u.updatedAt).toBeGreaterThan(a.updatedAt)
    expect(await repo.getCollection(a.id)).toEqual(u)
  })

  it('reorders to dense 0..n-1', async () => {
    const [a, b, c] = await Promise.all(
      ['A', 'B', 'C'].map((name) => repo.createCollection({ name, color: TEAL })),
    ).then((cs) => cs.sort((x, y) => x.order - y.order))
    await repo.reorderCollections([c!.id, a!.id, b!.id])
    const list = await repo.listCollections()
    expect(list.map((x) => x.name)).toEqual(['C', 'A', 'B'])
    expect(list.map((x) => x.order)).toEqual([0, 1, 2])
  })

  it('rejects a reorder list that does not match', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    await repo.createCollection({ name: 'B', color: TEAL })
    await expect(repo.reorderCollections([a.id])).rejects.toThrow(ValidationError)
    await expect(repo.reorderCollections([a.id, a.id])).rejects.toThrow(ValidationError)
  })
})

describe('cascade delete', () => {
  it('deleting a collection removes all its items and their images, and nothing else', async () => {
    const snacks = await repo.createCollection({ name: 'Snacks', color: TEAL })
    const books = await repo.createCollection({ name: 'Books', color: PINK })
    const almonds = await repo.createItem(snacks.id, { name: 'Almonds', color: TEAL })
    await repo.createItem(snacks.id, { name: 'Raisins', color: TEAL })
    const novel = await repo.createItem(books.id, { name: 'Novel', color: PINK })
    await repo.setItemImage(almonds.id, { blob: pngBlob(), width: 256, height: 256 })
    await repo.setItemImage(novel.id, { blob: pngBlob([9]), width: 256, height: 256 })

    expect(await repo.countItems(snacks.id)).toBe(2)
    await repo.deleteCollection(snacks.id)

    expect(await repo.getCollection(snacks.id)).toBeUndefined()
    expect(await repo.listItems(snacks.id)).toEqual([])
    expect(await db.items.count()).toBe(1)
    expect(await db.images.count()).toBe(1)
    expect(await repo.listItems(books.id)).toHaveLength(1)
  })

  it('deleting an item removes its image', async () => {
    const jar = await repo.createCollection({ name: 'Jar', color: TEAL })
    const item = await repo.createItem(jar.id, { name: 'Thing', color: TEAL })
    const withImage = await repo.setItemImage(item.id, { blob: pngBlob(), width: 1, height: 1 })
    expect(await repo.getImage(withImage.imageId!)).toBeDefined()

    await repo.deleteItem(item.id)
    expect(await repo.getItem(item.id)).toBeUndefined()
    expect(await db.images.count()).toBe(0)
  })

  it('deleting a missing item is a no-op', async () => {
    await expect(repo.deleteItem('nope')).resolves.toBeUndefined()
  })
})

describe('items', () => {
  it('creates with defaults, count = startCount, appended per collection', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const b = await repo.createCollection({ name: 'B', color: TEAL })
    const first = await repo.createItem(a.id, { name: ' Almonds ', color: TEAL })
    const second = await repo.createItem(a.id, {
      name: 'Pages',
      color: PINK,
      startCount: 10,
      target: 2000,
      onTarget: 'lock',
      step: 200,
    })
    const other = await repo.createItem(b.id, { name: 'Other', color: TEAL })

    expect(first).toMatchObject({
      name: 'Almonds',
      count: 0,
      startCount: 0,
      target: null,
      onTarget: 'continue',
      step: 1,
      imageId: null,
      order: 0,
    })
    expect(second).toMatchObject({ count: 10, startCount: 10, target: 2000, step: 200, order: 1 })
    expect(other.order).toBe(0)
    expect((await repo.listItems(a.id)).map((i) => i.name)).toEqual(['Almonds', 'Pages'])
  })

  it('rejects an unknown collection and invalid fields', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    await expect(repo.createItem('nope', { name: 'X', color: TEAL })).rejects.toThrow(/Jar/)
    const bad = [
      { name: '', color: TEAL },
      { name: 'x'.repeat(61), color: TEAL },
      { name: 'X', color: TEAL, startCount: -1 },
      { name: 'X', color: TEAL, startCount: 1.5 },
      { name: 'X', color: TEAL, target: 0 },
      { name: 'X', color: TEAL, step: 0 },
      { name: 'X', color: TEAL, onTarget: 'stop' as 'lock' },
    ]
    for (const input of bad) {
      await expect(repo.createItem(a.id, input)).rejects.toThrow(ValidationError)
    }
    expect(await db.items.count()).toBe(0)
  })

  it('updates fields; changing startCount does not change count', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const item = await repo.createItem(a.id, { name: 'X', color: TEAL })
    await repo.setCount(item.id, 42)
    const u = await repo.updateItem(item.id, { startCount: 5, target: 100, onTarget: 'lock' })
    expect(u).toMatchObject({ count: 42, startCount: 5, target: 100, onTarget: 'lock' })
    const cleared = await repo.updateItem(item.id, { target: null })
    expect(cleared.target).toBeNull()
  })

  it('setCount accepts 0 and MAX_SAFE_INTEGER, rejects negatives and unsafe values', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const item = await repo.createItem(a.id, { name: 'X', color: TEAL })
    await repo.setCount(item.id, Number.MAX_SAFE_INTEGER)
    expect((await repo.getItem(item.id))!.count).toBe(Number.MAX_SAFE_INTEGER)
    await repo.setCount(item.id, 0)
    expect((await repo.getItem(item.id))!.count).toBe(0)
    await expect(repo.setCount(item.id, -1)).rejects.toThrow(ValidationError)
    await expect(repo.setCount(item.id, Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow(
      ValidationError,
    )
    await expect(repo.setCount('nope', 1)).rejects.toThrow(/not found/)
  })

  it('reorders items within a collection to dense 0..n-1', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const b = await repo.createCollection({ name: 'B', color: TEAL })
    const x = await repo.createItem(a.id, { name: 'X', color: TEAL })
    const y = await repo.createItem(a.id, { name: 'Y', color: TEAL })
    const z = await repo.createItem(a.id, { name: 'Z', color: TEAL })
    const other = await repo.createItem(b.id, { name: 'Other', color: TEAL })
    await repo.deleteItem(y.id)
    await repo.createItem(a.id, { name: 'W', color: TEAL }) // order 3, leaving a gap at 1

    const ids = (await repo.listItems(a.id)).map((i) => i.id).reverse()
    await repo.reorderItems(a.id, ids)
    const list = await repo.listItems(a.id)
    expect(list.map((i) => i.name)).toEqual(['W', 'Z', 'X'])
    expect(list.map((i) => i.order)).toEqual([0, 1, 2])
    expect((await repo.getItem(other.id))!.order).toBe(0)

    await expect(repo.reorderItems(a.id, [x.id, z.id, other.id])).rejects.toThrow(ValidationError)
  })
})

describe('duplicate', () => {
  it('copies into another jar with the same name and its own image copy', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const b = await repo.createCollection({ name: 'B', color: PINK })
    await repo.createItem(b.id, { name: 'Existing', color: TEAL })
    const src = await repo.createItem(a.id, {
      name: 'Almonds',
      color: PINK,
      startCount: 3,
      target: 50,
      onTarget: 'lock',
      step: 5,
    })
    await repo.setCount(src.id, 17)
    const withImage = await repo.setItemImage(src.id, {
      blob: pngBlob([7, 8, 9]),
      width: 256,
      height: 256,
    })

    const copy = await repo.duplicateItem(src.id, b.id)
    expect(copy).toMatchObject({
      collectionId: b.id,
      name: 'Almonds',
      color: PINK,
      count: 17,
      startCount: 3,
      target: 50,
      onTarget: 'lock',
      step: 5,
      order: 1,
    })
    expect(copy.id).not.toBe(src.id)
    expect(copy.imageId).not.toBeNull()
    expect(copy.imageId).not.toBe(withImage.imageId)

    const image = await repo.getImage(copy.imageId!)
    expect(image).toMatchObject({ width: 256, height: 256 })
    expect(image!.blob.type).toBe('image/webp')
    expect(await bytesOf(image!.blob)).toEqual([7, 8, 9])

    // Deleting the original leaves the copy's image intact.
    await repo.deleteItem(src.id)
    expect(await repo.getImage(copy.imageId!)).toBeDefined()
  })

  it('copies within the same jar with a " (copy)" suffix, appended at the end', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const src = await repo.createItem(a.id, { name: 'Almonds', color: TEAL })
    await repo.createItem(a.id, { name: 'Raisins', color: TEAL })
    const copy = await repo.duplicateItem(src.id, a.id)
    expect(copy).toMatchObject({ name: 'Almonds (copy)', imageId: null, order: 2 })
  })

  it('keeps a copied name within the 60-character limit', async () => {
    expect(repo.copyName('x'.repeat(60))).toBe('x'.repeat(53) + ' (copy)')
    expect([...repo.copyName('x'.repeat(60))]).toHaveLength(60)
    expect(repo.copyName('Short')).toBe('Short (copy)')
  })

  it('rejects an unknown source or target', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const src = await repo.createItem(a.id, { name: 'X', color: TEAL })
    await expect(repo.duplicateItem('nope', a.id)).rejects.toThrow(/Item/)
    await expect(repo.duplicateItem(src.id, 'nope')).rejects.toThrow(/Jar/)
    expect(await db.items.count()).toBe(1)
  })
})

describe('images', () => {
  it('replacing an image deletes the old blob; null removes it', async () => {
    const a = await repo.createCollection({ name: 'A', color: TEAL })
    const item = await repo.createItem(a.id, { name: 'X', color: TEAL })
    const first = await repo.setItemImage(item.id, { blob: pngBlob([1]), width: 1, height: 1 })
    const second = await repo.setItemImage(item.id, { blob: pngBlob([2]), width: 1, height: 1 })
    expect(second.imageId).not.toBe(first.imageId)
    expect(await repo.getImage(first.imageId!)).toBeUndefined()
    expect(await db.images.count()).toBe(1)

    const removed = await repo.setItemImage(item.id, null)
    expect(removed.imageId).toBeNull()
    expect(await db.images.count()).toBe(0)
  })
})

describe('settings', () => {
  it('returns null before first write, then merges patches', async () => {
    expect(await repo.getSettings()).toBeNull()
    await repo.updateSettings({ theme: 'dark' })
    const s = await repo.updateSettings({ lastCollectionId: 'abc' })
    expect(s).toEqual({ ...repo.DEFAULT_SETTINGS, theme: 'dark', lastCollectionId: 'abc' })
    expect(await repo.getSettings()).toEqual(s)
  })
})
