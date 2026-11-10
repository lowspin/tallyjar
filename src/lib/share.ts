/**
 * Getting a file off the device. On phones the share sheet is the natural way (save to Files,
 * Drive, email…); on desktops a plain download is what people expect.
 */

/** True on touch-first devices whose browser can share this file. */
export function canShareFile(file: File): boolean {
  try {
    return (
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] }) &&
      matchMedia('(pointer: coarse)').matches
    )
  } catch {
    return false
  }
}

/**
 * Opens the share sheet. Resolves 'shared', or 'cancelled' if the user closed the sheet.
 * Must be called straight from a user gesture. Rejects on other errors.
 */
export async function shareFile(file: File, title: string): Promise<'shared' | 'cancelled'> {
  try {
    await navigator.share({ files: [file], title })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}

/** Saves the file through a temporary download link. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser time to start reading the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
