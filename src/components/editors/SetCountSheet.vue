<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import NumberField from '../NumberField.vue'
import AppIcon from '../AppIcon.vue'
import { useItemsStore } from '@/stores/items'
import { confirm } from '@/composables/useConfirm'
import { clampCount, isLocked, parseCountInput } from '@/lib/clamp'
import { formatCount } from '@/lib/format'
import type { Item } from '@/db/types'

const props = defineProps<{ item: Item | null }>()
const open = defineModel<boolean>({ required: true })

const store = useItemsStore()
const formId = useId()
const text = ref('')
const saveError = ref('')

watch(open, (isOpen) => {
  if (!isOpen || !props.item) return
  text.value = String(props.item.count)
  saveError.value = ''
})

const parsed = computed(() => parseCountInput(text.value))
const error = computed(() =>
  parsed.value === null ? 'Enter a whole number of 0 or more, like 1,250' : '',
)
const overLock = computed(
  () =>
    !!props.item &&
    isLocked(props.item) &&
    parsed.value !== null &&
    parsed.value > props.item.target!,
)
const hint = computed(() => {
  if (overLock.value)
    return 'Locked at target — change the target or switch to “Keep counting” to go higher.'
  if (parsed.value !== null && text.value.trim() !== formatCount(parsed.value))
    return `= ${formatCount(parsed.value)}`
  return ''
})

async function apply(count: number) {
  if (!props.item) return
  try {
    await store.update(props.item.id, { count: clampCount(count, props.item) })
    open.value = false
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Could not save the count'
  }
}

function save() {
  if (parsed.value !== null) void apply(parsed.value)
}

async function resetToStart() {
  const item = props.item
  if (!item) return
  const ok = await confirm({
    title: `Reset “${item.name}”?`,
    message: `The count goes back to its start count, ${formatCount(item.startCount)}.`,
    confirmLabel: 'Reset',
  })
  if (ok) await apply(item.startCount)
}
</script>

<template>
  <BottomSheet v-model="open" :title="item ? `Set count · ${item.name}` : 'Set count'" size="small">
    <form v-if="item" :id="formId" novalidate @submit.prevent="save">
      <p class="current">
        Current count <strong class="tabular">{{ formatCount(item.count) }}</strong>
        <template v-if="item.target !== null">
          of <strong class="tabular">{{ formatCount(item.target) }}</strong>
        </template>
      </p>
      <NumberField v-model="text" label="New count" :error="error" :hint="hint" autofocus />
      <div class="quick">
        <button class="button button--quiet" type="button" @click="resetToStart">
          <AppIcon name="reset" :size="18" /> Reset to start ({{ formatCount(item.startCount) }})
        </button>
        <button
          v-if="item.target !== null"
          class="button button--quiet"
          type="button"
          @click="apply(item.target)"
        >
          <AppIcon name="target" :size="18" /> Set to target ({{ formatCount(item.target) }})
        </button>
      </div>
      <p v-if="saveError" class="field__error" role="alert">{{ saveError }}</p>
    </form>
    <template #footer>
      <button class="button button--quiet button--cancel" type="button" @click="open = false">
        Cancel
      </button>
      <button class="button" type="submit" :form="formId" :disabled="!!error">Set count</button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.current {
  margin: 0 0 var(--space-4);
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.current strong {
  color: var(--color-text);
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: calc(-1 * var(--space-2));
}

.quick .button {
  padding: 0 var(--space-4);
  font-weight: 700;
}
</style>
