<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import ColorPicker from '../ColorPicker.vue'
import AppIcon from '../AppIcon.vue'
import { useCollectionsStore } from '@/stores/collections'
import { confirm } from '@/composables/useConfirm'
import { countItems } from '@/db/repo'
import { COLLECTION_NAME_MAX } from '@/db/validate'
import { nextPaletteColor } from '@/lib/palette'
import type { Collection } from '@/db/types'

/** Edits `jar`, or creates a new jar when it is null. */
const props = defineProps<{ jar: Collection | null }>()
const open = defineModel<boolean>({ required: true })

const store = useCollectionsStore()
const formId = useId()
const nameId = useId()
const errorId = useId()

const name = ref('')
const color = ref('')
const touched = ref(false)
const saving = ref(false)
const saveError = ref('')

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    name.value = props.jar?.name ?? ''
    color.value = props.jar?.color ?? nextPaletteColor(store.collections.map((c) => c.color))
    touched.value = false
    saveError.value = ''
  },
  { immediate: true },
)

const length = computed(() => [...name.value.trim()].length)
const nameError = computed(() => {
  if (length.value === 0) return 'Give your jar a name'
  if (length.value > COLLECTION_NAME_MAX)
    return `Keep it to ${COLLECTION_NAME_MAX} characters or fewer`
  return ''
})
const showNameError = computed(() => !!nameError.value && (touched.value || length.value > 0))

async function save() {
  touched.value = true
  if (nameError.value || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    if (props.jar) await store.update(props.jar.id, { name: name.value, color: color.value })
    else await store.create({ name: name.value, color: color.value })
    open.value = false
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'Could not save the jar'
  } finally {
    saving.value = false
  }
}

async function remove() {
  const jar = props.jar
  if (!jar) return
  const n = await countItems(jar.id)
  const ok = await confirm({
    title: `Delete “${jar.name}”?`,
    message:
      n === 0
        ? 'This jar is empty. This can’t be undone.'
        : `This also deletes ${n === 1 ? 'its 1 item' : `all ${n} of its items`}. This can’t be undone.`,
    confirmLabel: 'Delete jar',
    danger: true,
  })
  if (!ok) return
  try {
    await store.remove(jar.id)
    open.value = false
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : 'Could not delete the jar'
  }
}
</script>

<template>
  <BottomSheet v-model="open" :title="jar ? 'Edit jar' : 'New jar'">
    <form :id="formId" novalidate @submit.prevent="save">
      <div class="field">
        <label class="field__label" :for="nameId">
          Name
          <span class="field__meta tabular" aria-hidden="true">
            {{ length }}/{{ COLLECTION_NAME_MAX }}
          </span>
        </label>
        <input
          :id="nameId"
          v-model="name"
          class="input"
          type="text"
          autocomplete="off"
          enterkeyhint="done"
          placeholder="e.g. Snacks"
          required
          :autofocus="!jar"
          :aria-invalid="showNameError"
          :aria-describedby="showNameError ? errorId : undefined"
          @blur="touched = true"
        />
        <p v-if="showNameError" :id="errorId" class="field__error">{{ nameError }}</p>
      </div>

      <ColorPicker v-model="color" label="Color" />

      <p v-if="saveError" class="field__error save-error" role="alert">{{ saveError }}</p>
    </form>

    <template #footer>
      <button v-if="jar" class="button button--text-danger delete" type="button" @click="remove">
        <AppIcon name="trash" :size="18" /> Delete jar
      </button>
      <button class="button button--quiet button--cancel" type="button" @click="open = false">
        Cancel
      </button>
      <button class="button" type="submit" :form="formId" :disabled="!!nameError || saving">
        {{ jar ? 'Save' : 'Create jar' }}
      </button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.delete {
  margin-right: auto;
}

.save-error {
  margin-top: var(--space-4);
}
</style>
