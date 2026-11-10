/**
 * A synchronous safety net for count writes. IndexedDB writes are asynchronous and can be
 * aborted if the page unloads (app swiped away, tab closed) before they commit. Each count
 * that hasn't reached IndexedDB yet is also kept here in localStorage, which is synchronous,
 * and anything left over is applied on the next launch.
 */

export const UNSAVED_COUNTS_KEY = 'tallyjar-unsaved-counts'

const unsaved = new Map<string, number>(Object.entries(read()))

function read(): Record<string, number> {
  try {
    const raw =
      typeof localStorage === 'undefined' ? null : localStorage.getItem(UNSAVED_COUNTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          Number.isSafeInteger(entry[1]) && (entry[1] as number) >= 0,
      ),
    )
  } catch {
    return {}
  }
}

function persist() {
  try {
    if (unsaved.size === 0) localStorage.removeItem(UNSAVED_COUNTS_KEY)
    else localStorage.setItem(UNSAVED_COUNTS_KEY, JSON.stringify(Object.fromEntries(unsaved)))
  } catch {
    // Storage unavailable: the IndexedDB write path still applies.
  }
}

/** Records a count that is about to be written. */
export function markUnsaved(id: string, count: number) {
  unsaved.set(id, count)
  persist()
}

/** Records that `count` reached IndexedDB. Ignored if a newer value is still pending. */
export function markSaved(id: string, count: number) {
  if (unsaved.get(id) !== count) return
  unsaved.delete(id)
  persist()
}

/** Drops any unsaved value for an item (e.g. it was deleted or explicitly set). */
export function forgetUnsaved(id: string) {
  if (unsaved.delete(id)) persist()
}

/** Drops every unsaved value, e.g. after a backup replaced all items. */
export function clearUnsaved() {
  unsaved.clear()
  persist()
}

/** Applies counts left over from a previous session, then clears them. */
export async function recoverUnsavedCounts(
  write: (id: string, count: number) => Promise<void>,
): Promise<number> {
  const entries = [...new Map(Object.entries(read()))]
  let recovered = 0
  for (const [id, count] of entries) {
    try {
      await write(id, count)
      recovered++
    } catch {
      // The item no longer exists; nothing to recover.
    }
    unsaved.delete(id)
  }
  persist()
  return recovered
}
