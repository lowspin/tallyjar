<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import AppIcon from '../AppIcon.vue'
import { useBackupStore, type PreparedExport } from '@/stores/backup'
import { useSettingsStore } from '@/stores/settings'
import { notify } from '@/composables/useToast'
import { canShareFile, downloadFile, shareFile } from '@/lib/share'
import { formatBytes, plural } from '@/lib/format'

const open = defineModel<boolean>({ required: true })

const backup = useBackupStore()
const settings = useSettingsStore()

const prepared = shallowRef<PreparedExport | null>(null)
const error = ref('')
const busy = ref(false)

// The file is built when the sheet opens, so the Share/Download press is a fresh user
// gesture: iOS refuses navigator.share() after slow async work.
watch(open, async (isOpen) => {
  if (!isOpen) return
  prepared.value = null
  error.value = ''
  try {
    prepared.value = await backup.prepareExport()
  } catch (e) {
    console.error('Could not create backup', e)
    error.value = 'The backup couldn’t be created. Please try again.'
  }
})

const empty = computed(() => prepared.value?.summary.collections === 0)
const canExport = computed(() => !!prepared.value && !empty.value)
const shareable = computed(() => !!prepared.value && canShareFile(prepared.value.file))

const summaryText = computed(() => {
  const s = prepared.value?.summary
  if (!s) return ''
  return [plural(s.collections, 'jar'), plural(s.items, 'item'), plural(s.images, 'image')].join(
    ', ',
  )
})

const lastBackup = computed(() =>
  settings.lastExportAt === null
    ? 'You haven’t made a backup yet.'
    : `Last backup: ${new Date(settings.lastExportAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}.`,
)

async function finish(message: string) {
  await backup.markExported()
  open.value = false
  notify(message)
}

function download() {
  if (!prepared.value) return
  downloadFile(prepared.value.file)
  void finish('Backup downloaded')
}

async function share() {
  if (!prepared.value || busy.value) return
  busy.value = true
  try {
    const outcome = await shareFile(prepared.value.file, 'Tallyjar backup')
    if (outcome === 'shared') await finish('Backup shared')
  } catch (e) {
    console.warn('Share failed, downloading instead', e)
    download()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BottomSheet v-model="open" title="Export backup" size="small">
    <p v-if="error" class="field__error" role="alert">{{ error }}</p>
    <p v-else-if="!prepared" class="muted" aria-busy="true">Preparing your backup…</p>
    <p v-else-if="empty" class="muted">There’s nothing to back up yet. Create a jar first.</p>
    <template v-else>
      <div class="file">
        <AppIcon name="file" :size="22" class="file__icon" />
        <div>
          <div class="file__name">{{ prepared.file.name }}</div>
          <div class="file__meta tabular">
            {{ summaryText }} · {{ formatBytes(prepared.file.size) }}
          </div>
        </div>
      </div>
      <p class="muted">
        Your jars live only on this device. Keep this file somewhere safe, like cloud storage or an
        email to yourself, and use <strong>Import backup</strong> to restore it.
      </p>
      <p class="muted small">{{ lastBackup }}</p>
    </template>

    <template #footer>
      <!-- Cancel hides on phones only when there's a main action; otherwise it's all there is. -->
      <button
        class="button button--quiet"
        :class="{ 'button--cancel': canExport }"
        type="button"
        @click="open = false"
      >
        {{ canExport ? 'Cancel' : 'Close' }}
      </button>
      <template v-if="canExport">
        <template v-if="shareable">
          <button class="button button--quiet" type="button" @click="download">Download</button>
          <button class="button" type="button" :disabled="busy" @click="share">
            <AppIcon name="share" :size="18" /> Share
          </button>
        </template>
        <button v-else class="button" type="button" @click="download">
          <AppIcon name="download" :size="18" /> Download backup
        </button>
      </template>
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
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
}

.muted strong {
  color: var(--color-text);
}

.small {
  font-size: 0.875rem;
}
</style>
