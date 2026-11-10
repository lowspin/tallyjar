import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { getImage } from '@/db/repo'

/**
 * Object URL for a stored image. Revoked when the image changes or is removed, and on unmount.
 */
export function useImageUrl(imageId: () => string | null): Readonly<Ref<string | null>> {
  const url = ref<string | null>(null)
  let disposed = false

  function revoke() {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = null
  }

  watch(
    imageId,
    async (id) => {
      revoke()
      if (!id) return
      const image = await getImage(id).catch(() => undefined)
      // Gone, changed while loading, or the component has unmounted.
      if (!image || disposed || imageId() !== id) return
      url.value = URL.createObjectURL(image.blob)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    disposed = true
    revoke()
  })
  return url
}
