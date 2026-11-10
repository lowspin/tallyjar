import type { ImageInput } from '@/db/types'

export const THUMB_SIZE = 256

/** The largest centred square inside a w × h image. */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height)
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Turns a picked photo into a 256 × 256 centre-cropped thumbnail, encoded as WebP (quality 0.8),
 * or JPEG where the browser can't encode WebP (older Safari).
 */
export async function makeThumbnail(file: Blob, size = THUMB_SIZE): Promise<ImageInput> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('That file couldn’t be read as an image.')
  }
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Images aren’t supported in this browser.')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)

    let blob = await toBlob(canvas, 'image/webp', 0.8)
    // Browsers that can't encode WebP silently return PNG instead.
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85)
    if (!blob) throw new Error('The image couldn’t be saved.')
    return { blob, width: size, height: size }
  } finally {
    bitmap.close()
  }
}
