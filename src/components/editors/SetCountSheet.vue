<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import NumberField from '../NumberField.vue'
import AppIcon from '../AppIcon.vue'
import { useItemsStore } from '@/stores/items'
import { confirm } from '@/composables/useConfirm'
import { applyDelta, clampCount, isLocked, parseCountInput } from '@/lib/clamp'
import { formatCount } from '@/lib/format'
import type { Item } from '@/db/types'

const props = defineProps<{ item: Item | null }>()
const open = defineModel<boolean>({ required: true })

/** Set an exact count, or add/subtract a typed amount (handy for large numbers). */
type Mode = 'set' | 'add' | 'subtract'

const store = useItemsStore()
const formId = useId()
const text = ref('')
const mode = ref<Mode>('set')
const saveError = ref('')

watch(open, (isOpen) => {
  if (!isOpen || !props.item) return
  mode.value = 'set'
  text.value = String(props.item.count)
  saveError.value = ''
})

watch(mode, (m, before) => {
  if (!props.item) return
  // Switching modes swaps between "the count" and "an amount"; don't carry one into the other.
  if (m === 'set') text.value = String(props.item.count)
  else if (before === 'set') text.value = ''
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>(`[id="${formId}"] input.input`)
    input?.focus()
    input?.select()
  })
})

const parsed = computed(() => parseCountInput(text.value))

/** The count that saving would produce, after clamping. */
const result = computed(() => {
  const item = props.item
  if (!item || parsed.value === null) return null
  if (mode.value === 'set') return clampCount(parsed.value, item)
  const sign = mode.value === 'add' ? 1 : -1
  return applyDelta(item.count, sign * parsed.value, item)
})

const error = computed(() => {
  if (mode.value !== 'set' && text.value.trim() === '') return ''
  return parsed.value === null ? 'Enter a whole number of 0 or more, like 1,250' : ''
})

const overLock = computed(() => {
  const item = props.item
  if (!item || !isLocked(item) || parsed.value === null) return false
  if (mode.value === 'set') return parsed.value > item.target!
  return mode.value === 'add' && item.count + parsed.value > item.target!
})

const hint = computed(() => {
  if (overLock.value)
    return 'Locked at target — change the target or switch to “Keep counting” to go higher.'
  if (mode.value !== 'set' && result.value !== null)
    return `New count: ${formatCount(result.value)}`
  if (parsed.value !== null && text.value.trim() !== formatCount(parsed.value))
    return `= ${formatCount(parsed.value)}`
  return ''
})

const fieldLabel = computed(() =>
  mode.value === 'set'
    ? 'New count'
    : mode.value === 'add'
      ? 'Amount to add'
      : 'Amount to subtract',
)

const submitLabel = computed(() => {
  if (mode.value === 'set') return 'Set count'
  const amount = parsed.value === null ? '' : ` ${formatCount(parsed.value)}`
  return mode.value === 'add' ? `Add${amount}` : `Subtract${amount}`
})

const canSubmit = computed(() => result.value !== null && !error.value)

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
  if (canSubmit.value) void apply(result.value!)
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
          <template v-if="item.count < item.target">
            · <strong class="tabular">{{ formatCount(item.target - item.count) }}</strong> to go
          </template>
        </template>
      </p>

      <div class="segmented mode" role="radiogroup" aria-label="Change">
        <label v-for="m in ['set', 'add', 'subtract'] as const" :key="m" class="segment">
          <input v-model="mode" type="radio" :name="`${formId}-mode`" :value="m" />
          <span>{{ m === 'set' ? 'Set to' : m === 'add' ? 'Add' : 'Subtract' }}</span>
        </label>
      </div>

      <NumberField
        v-model="text"
        :label="fieldLabel"
        :error="error"
        :hint="hint"
        :placeholder="mode === 'set' ? undefined : 'e.g. 50,900'"
        autofocus
      />
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
      <button class="button" type="submit" :form="formId" :disabled="!canSubmit">
        {{ submitLabel }}
      </button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.current {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.current strong {
  color: var(--color-text);
}

.mode {
  margin-bottom: var(--space-3);
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
