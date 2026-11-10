import Dexie, { type EntityTable } from 'dexie'
import type { Collection, ImageBlob, Item, Settings } from './types'

export const DB_NAME = 'tallyjar'

export class TallyjarDB extends Dexie {
  collections!: EntityTable<Collection, 'id'>
  items!: EntityTable<Item, 'id'>
  images!: EntityTable<ImageBlob, 'id'>
  settings!: EntityTable<Settings, 'key'>

  constructor(name = DB_NAME) {
    super(name)
    // v1 is frozen once released. Schema changes go in a new db.version(n) with an upgrade.
    this.version(1).stores({
      collections: 'id, order',
      items: 'id, collectionId, [collectionId+order]',
      images: 'id',
      settings: 'key',
    })
  }
}

export const db = new TallyjarDB()
