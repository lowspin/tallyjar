/**
 * Asks the browser not to evict our IndexedDB data under storage pressure.
 * Returns the browser's answer, or null when the API isn't available.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
    return await navigator.storage.persist()
  } catch {
    return null
  }
}
