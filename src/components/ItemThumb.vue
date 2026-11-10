<script setup lang="ts">
import { computed } from 'vue'
import { useImageUrl } from '@/composables/useImageUrl'
import { textOn } from '@/lib/palette'

/** A stored thumbnail, a direct `src`, or a rounded square with the item's first letter. */
const props = withDefaults(
  defineProps<{
    name: string
    color: string
    imageId?: string | null
    src?: string | null
    size?: number
  }>(),
  { imageId: null, src: null, size: 48 },
)

const storedUrl = useImageUrl(() => (props.src ? null : props.imageId))
const url = computed(() => props.src ?? storedUrl.value)
const letter = computed(() => ([...props.name.trim()][0] ?? '?').toLocaleUpperCase())
</script>

<template>
  <img
    v-if="url"
    class="thumb"
    :src="url"
    alt=""
    :width="size"
    :height="size"
    loading="lazy"
    decoding="async"
  />
  <span
    v-else
    class="thumb thumb--letter"
    aria-hidden="true"
    :style="{
      background: color,
      color: textOn(color),
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${size * 0.45}px`,
    }"
  >
    {{ letter }}
  </span>
</template>

<style scoped>
.thumb {
  flex: none;
  display: block;
  border-radius: 12px;
  object-fit: cover;
}

.thumb--letter {
  display: grid;
  place-items: center;
  font-weight: 800;
  line-height: 1;
}
</style>
