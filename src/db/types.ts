import type { ThemePreference } from '@/lib/theme'

export interface Collection {
  id: string
  name: string // 1–40 chars, trimmed
  color: string // "#RRGGBB"
  order: number
  createdAt: number
  updatedAt: number
}

export type OnTarget = 'continue' | 'lock'

export interface Item {
  id: string
  collectionId: string
  name: string // 1–60 chars, trimmed
  color: string // "#RRGGBB"
  imageId: string | null
  count: number // integer ≥ 0
  startCount: number // integer ≥ 0
  target: number | null // integer ≥ 1, or null
  onTarget: OnTarget
  step: number // integer ≥ 1
  order: number
  createdAt: number
  updatedAt: number
}

export interface ImageBlob {
  id: string
  blob: Blob
  width: number
  height: number
}

export interface Settings {
  key: 'app'
  lastCollectionId: string | null
  theme: ThemePreference
  lastExportAt: number | null
  persistRequested: boolean
  /** Result of navigator.storage.persist(); null until requested or when unsupported. */
  persisted: boolean | null
  /** The backup reminder stays hidden until this time after being dismissed. */
  backupReminderSnoozedUntil: number | null
  /** Show only items that haven't reached their target. */
  hideDone: boolean
}

/** Fields a user can set when creating a collection. */
export interface CollectionInput {
  name: string
  color: string
}

/** Fields a user can set when creating an item. `count` starts at `startCount`. */
export interface ItemInput {
  name: string
  color: string
  startCount?: number
  target?: number | null
  onTarget?: OnTarget
  step?: number
}

/** Fields that can be changed on an existing item (images go through setItemImage). */
export type ItemPatch = Partial<
  Pick<Item, 'name' | 'color' | 'count' | 'startCount' | 'target' | 'onTarget' | 'step'>
>

export interface ImageInput {
  blob: Blob
  width: number
  height: number
}
