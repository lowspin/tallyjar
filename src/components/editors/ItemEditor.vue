<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import BottomSheet from '../BottomSheet.vue'
import ColorPicker from '../ColorPicker.vue'
import NumberField from '../NumberField.vue'
import ImageInputField, { type ImageChange } from '../ImageInput.vue'
import AppIcon from '../AppIcon.vue'
import { useItemsStore } from '@/stores/items'
import { confirm } from '@/composables/useConfirm'
import { ITEM_NAME_MAX } from '@/db/validate'
import { clampCount, parseCountInput } from '@/lib/clamp'
import { formatCount } from '@/lib/format'
import { nextPaletteColor } from '@/lib/palette'
import { suggestStep } from '@/lib/suggestStep'
import type { Item, OnTarget } from '@/db/types'

/** Edits `item`, or creates a new item in the open jar when it is null. */
const props = defineProps<{ item: Item | null }>()
const open = defineModel<boolean>({ required: true })

const store = useItemsStore()
const formId = useId()
const nameId = useId()
const nameErrorId = useId()

const STEP_CHIPS = [1, 5, 10, 100, 1000]

// ─── Form state ─────────────────────────────────────────────────────────────
const name = ref('')
const color = ref('')
const image = ref<ImageChange>({ kind: 'keep' })
const startText = ref('0')
const countText = ref('')
const stepText = ref('1')
const hasTarget = ref(false)
const targetText = ref('')
const onTarget = ref<OnTarget>('continue')

const nameTouched = ref(false)
const stepTouched = ref(false)
const suggested = ref(false)
const saving = ref(false)
const saveError = ref('')

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const it = props.item
    name.value = it?.name ?? ''
    color.value = it?.color ?? nextPaletteColor(store.items.map((i) => i.color))
    image.value = { kind: 'keep' }
    startText.value = String(it?.startCount ?? 0)
    countText.value = it ? String(it.count) : ''
    stepText.value = String(it?.step ?? 1)
    hasTarget.value = it ? it.target !== null : false
    targetText.value = it?.target !== null && it?.target !== undefined ? String(it.target) : ''
    onTarget.value = it?.onTarget ?? 'continue'
    nameTouched.value = false
    stepTouched.value = false
    suggested.value = false
    saveError.value = ''
  },
  { immediate: true },
)

// ─── Parsing and validation ─────────────────────────────────────────────────
const nameLength = computed(() => [...name.value.trim()].length)
const nameError = computed(() => {
  if (nameLength.value === 0) return 'Give it a name'
  if (nameLength.value > ITEM_NAME_MAX) return `Keep it to ${ITEM_NAME_MAX} characters or fewer`
  return ''
})
const showNameError = computed(
  () => !!nameError.value && (nameTouched.value || nameLength.value > 0),
)

const start = computed(() => parseCountInput(startText.value))
const count = computed(() => parseCountInput(countText.value))
const step = computed(() => parseCountInput(stepText.value))
const target = computed(() => parseCountInput(targetText.value))

const WHOLE = 'Enter a whole number, like 1,250'
const startError = computed(() => (start.value === null ? WHOLE : ''))
const countError = computed(() => (props.item && count.value === null ? WHOLE : ''))
const stepError = computed(() =>
  step.value === null || step.value < 1 ? 'Enter a whole number of 1 or more' : '',
)
const targetError = computed(() =>
  hasTarget.value && (target.value === null || target.value < 1)
    ? 'Enter a target of 1 or more'
    : '',
)

const rules = computed(() => ({
  target: hasTarget.value ? target.value : null,
  onTarget: onTarget.value,
}))

const countHint = computed(() => {
  if (!props.item || count.value === null) return ''
  const r = rules.value
  if (r.target !== null && r.onTarget === 'lock' && count.value > r.target)
    return 'Locked at target — change the target or switch to “Keep counting” to go higher.'
  return ''
})

const invalid = computed(
  () =>
    !!(nameError.value || startError.value || countError.value || stepError.value) ||
    !!targetError.value,
)

// ─── Suggested step (§6.5) ──────────────────────────────────────────────────
// Only for an item that had no target before, and only until the user edits the step.
const originalStep = computed(() => props.item?.step ?? 1)
const suggestionAllowed = computed(
  () => (props.item === null || props.item.target === null) && !stepTouched.value,
)

watch([hasTarget, target, start], () => {
  if (!open.value || !suggestionAllowed.value) return
  if (hasTarget.value && target.value !== null && target.value >= 1) {
    stepText.value = String(suggestStep(start.value ?? 0, target.value))
    suggested.value = true
  } else if (suggested.value) {
    stepText.value = String(originalStep.value)
    suggested.value = false
  }
})

function touchStep() {
  stepTouched.value = true
  suggested.value = false
}

function pickStep(value: number) {
  stepText.value = String(value)
  touchStep()
}

const stepHint = computed(() =>
  suggested.value && !stepTouched.value ? 'Suggested from your target. Change it anytime.' : '',
)

// ─── Save / delete ──────────────────────────────────────────────────────────
async function save() {
  nameTouched.value = true
  if (invalid.value || saving.value) return
  saving.value = true
  saveError.value = ''
  const fields = {
    name: name.value,
    color: color.value,
    startCount: start.value!,
    step: step.value!,
    target: rules.value.target,
    onTarget: onTarget.value,
  }
  try {
    let saved: Item
    if (props.item) {
      const countChanged = countText.value.trim() !== String(props.item.count)
      saved = await store.update(props.item.id, {
        ...fields,
        ...(countChanged ? { count: clampCount(count.value!, rules.value) } : {}),
      })
    } else {
      saved = await store.create(fields)
    }
    if (image.value.kind === 'set') await store.setImage(saved.id, image.value.image)
    else if (image.value.kind === 'remove') await store.setImage(saved.id, null)
    open.value = false
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Could not save the item'
  } finally {
    saving.value = false
  }
}

async function remove() {
  const item = props.item
  if (!item) return
  const ok = await confirm({
    title: `Delete “${item.name}”?`,
    message: 'Its count and thumbnail will be removed. This can’t be undone.',
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  await store.remove(item.id)
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" :title="item ? 'Edit item' : 'New item'">
    <form :id="formId" novalidate @submit.prevent="save">
      <div class="field">
        <label class="field__label" :for="nameId">
          Name
          <span class="field__meta tabular" aria-hidden="true">
            {{ nameLength }}/{{ ITEM_NAME_MAX }}
          </span>
        </label>
        <input
          :id="nameId"
          v-model="name"
          class="input"
          type="text"
          autocomplete="off"
          enterkeyhint="next"
          placeholder="e.g. Almonds"
          required
          :autofocus="!item"
          :aria-invalid="showNameError"
          :aria-describedby="showNameError ? nameErrorId : undefined"
          @blur="nameTouched = true"
        />
        <p v-if="showNameError" :id="nameErrorId" class="field__error">{{ nameError }}</p>
      </div>

      <ColorPicker v-model="color" label="Color" class="field" />

      <ImageInputField
        v-model="image"
        :current-image-id="item?.imageId ?? null"
        :name="name"
        :color="color"
      />

      <div class="pair">
        <NumberField v-model="startText" label="Start count" :error="startError" />
        <NumberField
          v-if="item"
          v-model="countText"
          label="Current count"
          :error="countError"
          :hint="countHint"
        />
      </div>

      <!-- Target -->
      <div class="field">
        <label class="switch">
          <input v-model="hasTarget" type="checkbox" role="switch" />
          <span class="switch__track" aria-hidden="true"><span class="switch__thumb" /></span>
          <span class="field__label">Has target</span>
        </label>
      </div>

      <template v-if="hasTarget">
        <NumberField
          v-model="targetText"
          label="Target"
          :error="targetError"
          placeholder="e.g. 2,000"
        />
        <div class="field" role="radiogroup" aria-label="When the target is reached">
          <div class="field__label">When the target is reached</div>
          <div class="segmented">
            <label class="segment">
              <input
                v-model="onTarget"
                type="radio"
                :name="`${formId}-on-target`"
                value="continue"
              />
              <span>Keep counting</span>
            </label>
            <label class="segment">
              <input v-model="onTarget" type="radio" :name="`${formId}-on-target`" value="lock" />
              <span>Stop at target</span>
            </label>
          </div>
        </div>
      </template>

      <NumberField
        v-model="stepText"
        label="Double-tap step"
        :error="stepError"
        :hint="stepHint"
        @input="touchStep"
      >
        <div class="chips" role="group" aria-label="Common steps">
          <button
            v-for="chip in STEP_CHIPS"
            :key="chip"
            class="chip tabular"
            type="button"
            :aria-pressed="step === chip"
            @click="pickStep(chip)"
          >
            {{ formatCount(chip) }}
          </button>
        </div>
      </NumberField>

      <p v-if="saveError" class="field__error" role="alert">{{ saveError }}</p>
    </form>

    <template #footer>
      <button v-if="item" class="button button--text-danger delete" type="button" @click="remove">
        <AppIcon name="trash" :size="18" /> Delete
      </button>
      <button class="button button--quiet button--cancel" type="button" @click="open = false">
        Cancel
      </button>
      <button class="button" type="submit" :form="formId" :disabled="invalid || saving">
        {{ item ? 'Save' : 'Add item' }}
      </button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  column-gap: var(--space-4);
}

.delete {
  margin-right: auto;
}

/* Switch */
.switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  cursor: pointer;
}

.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.switch__track {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-text) 25%, transparent);
}

.switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
}

.switch input:checked + .switch__track {
  background: var(--color-primary);
}

.switch input:checked + .switch__track .switch__thumb {
  transform: translateX(20px);
}

.switch input:focus-visible + .switch__track {
  box-shadow: var(--focus-ring);
}

/* Segmented control */
.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
}

.segment {
  position: relative;
  cursor: pointer;
}

.segment input {
  position: absolute;
  opacity: 0;
}

.segment span {
  display: grid;
  place-items: center;
  min-height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  font-weight: 700;
  text-align: center;
}

.segment input:checked + span {
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.segment input:focus-visible + span {
  box-shadow: var(--focus-ring);
}

/* Step chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip {
  min-width: 48px;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1.5px solid color-mix(in srgb, var(--color-text) 20%, transparent);
  border-radius: var(--radius-pill);
  background: transparent;
  font-weight: 700;
}

.chip[aria-pressed='true'] {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

@media (prefers-reduced-motion: no-preference) {
  .switch__thumb,
  .switch__track {
    transition:
      transform var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
  }
}
</style>
