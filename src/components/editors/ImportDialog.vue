<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import AppIcon from '../AppIcon.vue'
import { useBackupStore } from '@/stores/backup'
import { useCollectionsStore } from '@/stores/collections'
import { notify } from '@/composables/useToast'
import { BackupError, parseBackup, type ImportMode, type ParsedBackup } from '@/db/backup'
import { plural } from '@/lib/format'

/** Reads, validates and imports `file`. Nothing is written until the user confirms. */
const props = defineProps<{ file: File | null }>()
const open = defineModel<boolean>({ required: true })

/** Far beyond any real backup; guards against picking a huge unrelated file. */
const MAX_FILE_BYTES = 100 * 1024 * 1024

const backup = useBackupStore()
const collections = useCollectionsStore()
const formId = useId()

// shallowRef: the backup must stay a plain object, since IndexedDB can't store Vue proxies.
const parsed = shallowRef<ParsedBackup | null>(null)
const error = ref('')
const importError = ref('')
const mode = ref<ImportMode>('add')
const busy = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen) return
  parsed.value = null
  error.value = ''
  importError.value = ''
  mode.value = 'add'
  const file = props.file
  if (!file) return
  try {
    if (file.size > MAX_FILE_BYTES) throw new BackupError('This file is too large to be a backup.')
    parsed.value = parseBackup(await file.text())
  } catch (e) {
    error.value =
      e instanceof BackupError ? e.message : 'This file couldn’t be read. Please try again.'
  }
})

/** With nothing on the device yet there is nothing to choose between. */
const hasData = computed(() => collections.collections.length > 0)
const effectiveMode = computed<ImportMode>(() => (hasData.value ? mode.value : 'replace'))
const destructive = computed(() => hasData.value && mode.value === 'replace')

const summaryText = computed(() => {
  const s = parsed.value?.summary
  if (!s) return ''
  return [plural(s.collections, 'jar'), plural(s.items, 'item'), plural(s.images, 'image')].join(
    ', ',
  )
})

const currentText = computed(() =>
  [plural(collections.collections.length, 'jar'), plural(backup.totalItems, 'item')].join(' and '),
)

async function runImport() {
  if (!parsed.value || busy.value) return
  busy.value = true
  importError.value = ''
  try {
    const { summary } = parsed.value
    await backup.runImport(parsed.value, effectiveMode.value)
    open.value = false
    notify(`Imported ${plural(summary.collections, 'jar')} and ${plural(summary.items, 'item')}`)
  } catch (e) {
    console.error('Import failed', e)
    importError.value = 'The import failed and nothing was changed. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BottomSheet v-model="open" title="Import backup" size="small">
    <div v-if="error" class="problem" role="alert">
      <AppIcon name="alert" :size="22" class="problem__icon" />
      <div>
        <p class="problem__title">This file can’t be imported</p>
        <p class="problem__text">{{ error }}</p>
        <p class="problem__text">Nothing was changed.</p>
      </div>
    </div>

    <p v-else-if="!parsed" class="muted" aria-busy="true">Checking the file…</p>

    <form v-else :id="formId" novalidate @submit.prevent="runImport">
      <div class="file">
        <AppIcon name="file" :size="22" class="file__icon" />
        <div>
          <div class="file__name">{{ file?.name }}</div>
          <div class="file__meta tabular">{{ summaryText }}</div>
        </div>
      </div>

      <fieldset v-if="hasData" class="choices">
        <legend class="field__label">How should it be imported?</legend>
        <label class="choice">
          <input v-model="mode" type="radio" :name="`${formId}-mode`" value="add" />
          <span>
            <strong>Add as new</strong>
            <span class="choice__text">
              The backup’s jars are added after yours. Nothing you have now is changed.
            </span>
          </span>
        </label>
        <label class="choice">
          <input v-model="mode" type="radio" :name="`${formId}-mode`" value="replace" />
          <span>
            <strong>Replace everything</strong>
            <span class="choice__text">
              Deletes your current {{ currentText }}, then restores the backup exactly.
            </span>
          </span>
        </label>
      </fieldset>

      <p v-if="destructive" class="warning">
        <AppIcon name="alert" :size="18" /> This can’t be undone. Export a backup first if you might
        want your current jars back.
      </p>
      <p v-if="importError" class="field__error" role="alert">{{ importError }}</p>
    </form>

    <template #footer>
      <!-- Cancel hides on phones only when there's a main action; otherwise it's all there is. -->
      <button
        class="button button--quiet"
        :class="{ 'button--cancel': parsed }"
        type="button"
        @click="open = false"
      >
        {{ parsed ? 'Cancel' : 'Close' }}
      </button>
      <button
        v-if="parsed"
        class="button"
        :class="{ 'button--danger': destructive }"
        type="submit"
        :form="formId"
        :disabled="busy"
      >
        <AppIcon name="upload" :size="18" />
        {{ destructive ? 'Replace everything' : 'Import' }}
      </button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.file {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  border: var(--border-card);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
}

.file__icon {
  flex: none;
  color: var(--color-primary);
}

.file__name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.file__meta {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.muted {
  margin: 0;
  color: var(--color-text-muted);
}

.choices {
  display: grid;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: 0;
  border: 0;
}

.choice {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3) var(--space-4);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-card);
  cursor: pointer;
}

.choice:has(input:checked) {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.choice:has(input[value='replace']:checked) {
  border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 8%, transparent);
}

.choice:has(input:focus-visible) {
  box-shadow: var(--focus-ring);
}

.choice input {
  flex: none;
  width: 20px;
  height: 20px;
  margin: 2px 0 0;
  accent-color: var(--color-primary);
}

.choice input[value='replace'] {
  accent-color: var(--color-danger);
}

.choice > span {
  display: grid;
  gap: 2px;
}

.choice__text {
  font-size: 0.9375rem;
  color: var(--color-text-muted);
}

.warning {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin: 0;
  color: var(--color-danger);
  font-size: 0.9375rem;
  font-weight: 600;
}

.warning :deep(svg) {
  flex: none;
  margin-top: 2px;
}

.problem {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.problem__icon {
  flex: none;
  color: var(--color-danger);
}

.problem__title {
  margin: 0 0 var(--space-1);
  font-weight: 700;
}

.problem__text {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}
</style>
