<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from 'vue'
import { useObjectUrl } from '@vueuse/core'
import AppIcon from './AppIcon.vue'
import ItemThumb from './ItemThumb.vue'
import { makeThumbnail } from '@/lib/image'
import type { ImageInput } from '@/db/types'

/** What the editor should do with the item's image on save. */
export type ImageChange = { kind: 'keep' } | { kind: 'set'; image: ImageInput } | { kind: 'remove' }

const props = defineProps<{ currentImageId: string | null; name: string; color: string }>()
const change = defineModel<ImageChange>({ required: true })

const fileInput = useTemplateRef<HTMLInputElement>('file')
const labelId = useId()
const busy = ref(false)
const error = ref('')

const pendingBlob = computed(() => (change.value.kind === 'set' ? change.value.image.blob : null))
const pendingUrl = useObjectUrl(pendingBlob) // revoked automatically when replaced or unmounted

const hasImage = computed(
  () =>
    change.value.kind === 'set' || (change.value.kind === 'keep' && props.currentImageId !== null),
)
const shownImageId = computed(() => (change.value.kind === 'keep' ? props.currentImageId : null))

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow picking the same file again
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    change.value = { kind: 'set', image: await makeThumbnail(file) }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'That image couldn’t be used.'
  } finally {
    busy.value = false
  }
}

function remove() {
  change.value = { kind: 'remove' }
}
</script>

<template>
  <div class="field" role="group" :aria-labelledby="labelId">
    <div :id="labelId" class="field__label">Thumbnail</div>
    <div class="row">
      <ItemThumb
        :name="name || '?'"
        :color="color"
        :image-id="shownImageId"
        :src="pendingUrl ?? null"
        :size="64"
      />
      <div class="actions">
        <button
          class="button button--quiet"
          type="button"
          :disabled="busy"
          @click="fileInput?.click()"
        >
          <AppIcon name="image-plus" :size="18" />
          {{ busy ? 'Processing…' : hasImage ? 'Replace' : 'Add photo' }}
        </button>
        <button
          v-if="hasImage"
          class="button button--text-danger"
          type="button"
          :disabled="busy"
          @click="remove"
        >
          Remove
        </button>
      </div>
      <input
        ref="file"
        class="visually-hidden"
        type="file"
        accept="image/*"
        tabindex="-1"
        @change="onFile"
      />
    </div>
    <p v-if="error" class="field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.actions .button {
  padding: 0 var(--space-4);
}
</style>
