<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import CountButton from './CountButton.vue'
import CountSlider from './CountSlider.vue'
import ItemThumb from './ItemThumb.vue'
import { useItemsStore } from '@/stores/items'
import { canDecrement, canIncrement, clampCount, isReached } from '@/lib/clamp'
import { formatCompact, formatCount, formatSigned, percentOf } from '@/lib/format'
import { textOn } from '@/lib/palette'
import type { PressKind } from '@/lib/taps'
import type { Item } from '@/db/types'

const props = withDefaults(
  defineProps<{
    item: Item
    /** False hides the drag handle (reordering is off while the list is filtered). */
    reorderable?: boolean
  }>(),
  { reorderable: true },
)
const emit = defineEmits<{ 'open-count': [item: Item]; 'open-menu': [item: Item] }>()

const store = useItemsStore()

const reached = computed(() => isReached(props.item.count, props.item.target))
const percent = computed(() =>
  props.item.target === null ? 0 : percentOf(props.item.count, props.item.target),
)

/** Signed step for the float label; compact from 1,000 up so it stays short. */
function signedStep(sign: 1 | -1): string {
  const { step } = props.item
  return step >= 1000 ? (sign > 0 ? '+' : '−') + formatCompact(step) : formatSigned(sign * step)
}

const plusLabel = computed(() => {
  const { name, step } = props.item
  return step > 1
    ? `Add 1 to ${name}; hold or Shift to add ${formatCount(step)}`
    : `Add 1 to ${name}`
})
const minusLabel = computed(() => {
  const { name, step } = props.item
  return step > 1
    ? `Subtract 1 from ${name}; hold or Shift to subtract ${formatCount(step)}`
    : `Subtract 1 from ${name}`
})

// ─── Count display: full numbers, shortened only when they don't fit ────────
// The target is shortened first ("1,999 / 2K"): the count stays exact as long as possible,
// since rounding it ("2K / 2K") would make an unfinished item look done.
const countBox = useTemplateRef<HTMLElement>('countBox')
const measureValue = useTemplateRef<HTMLElement>('measureValue')
const measureTarget = useTemplateRef<HTMLElement>('measureTarget')
const measureTargetCompact = useTemplateRef<HTMLElement>('measureTargetCompact')
/** 0: all full, 1: compact target, 2: compact count and target. */
const compactLevel = ref<0 | 1 | 2>(0)
const fullText = computed(() => formatCount(props.item.count))
const shownText = computed(() =>
  compactLevel.value === 2 ? formatCompact(props.item.count) : fullText.value,
)
const shownTarget = computed(() => {
  const { target } = props.item
  if (target === null) return ''
  return compactLevel.value >= 1 ? formatCompact(target) : formatCount(target)
})

const COUNT_GAP_PX = 4 // matches the .count gap
const EDIT_ICON_PX = 14 + COUNT_GAP_PX

function fit() {
  if (!countBox.value || !measureValue.value) return
  const room = countBox.value.clientWidth - EDIT_ICON_PX
  const value = measureValue.value.offsetWidth
  const target = (el: HTMLElement | null) => (el ? COUNT_GAP_PX + el.offsetWidth : 0)
  if (value + target(measureTarget.value) <= room) compactLevel.value = 0
  else if (value + target(measureTargetCompact.value) <= room) compactLevel.value = 1
  else compactLevel.value = 2
}

let observer: ResizeObserver | null = null
onMounted(() => {
  fit()
  if (typeof ResizeObserver !== 'undefined' && countBox.value) {
    observer = new ResizeObserver(fit)
    observer.observe(countBox.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch([fullText, () => props.item.target], () => nextTick(fit))

// ─── Counting ───────────────────────────────────────────────────────────────
const popKey = ref(0)
const floats = ref<{ id: number; text: string; side: 'minus' | 'plus' }[]>([])
let floatId = 0

function onChange(delta: number, kind: PressKind) {
  const next = store.adjust(props.item.id, delta)
  if (next === null) return
  popKey.value++
  // A hold's first ±step gets a floating label, so it's clear a step (not 1) was applied.
  if (kind === 'step' && props.item.step > 1) {
    const sign = delta > 0 ? 1 : -1
    const id = ++floatId
    floats.value.push({ id, text: signedStep(sign), side: sign > 0 ? 'plus' : 'minus' })
    setTimeout(() => (floats.value = floats.value.filter((f) => f.id !== id)), 700)
  }
}

function onSlide(value: number) {
  const next = clampCount(value, props.item)
  if (next === props.item.count) return
  store.setCount(props.item.id, next)
}

// ─── Target reached ─────────────────────────────────────────────────────────
const celebrate = ref(false)
let celebrateTimer: ReturnType<typeof setTimeout> | null = null

watch(reached, (now, before) => {
  if (!now || before) return
  celebrate.value = true
  if (celebrateTimer) clearTimeout(celebrateTimer)
  celebrateTimer = setTimeout(() => (celebrate.value = false), 1200)
  if ('vibrate' in navigator) navigator.vibrate?.(10)
})
onBeforeUnmount(() => celebrateTimer && clearTimeout(celebrateTimer))
</script>

<template>
  <article
    class="card"
    :class="{
      'card--reached': reached,
      'card--celebrate': celebrate,
      'card--has-target': item.target !== null,
    }"
    :style="{ '--item': item.color, '--item-text': textOn(item.color) }"
    :aria-label="item.name"
  >
    <!-- Pointer-only: keyboard and screen-reader users reorder with Move up/down in the menu. -->
    <span
      class="drag-handle"
      :class="{ 'drag-handle--off': !reorderable }"
      aria-hidden="true"
      title="Drag to reorder"
    >
      <AppIcon name="grip" :size="18" />
    </span>

    <!-- Done: the thumbnail becomes a check, so finished items can be spotted down the left edge. -->
    <span v-if="reached" class="card__thumb done-mark" aria-hidden="true">
      <AppIcon name="check" :size="26" />
    </span>
    <ItemThumb
      v-else
      class="card__thumb"
      :name="item.name"
      :color="item.color"
      :image-id="item.imageId"
      :size="40"
    />

    <h3 class="card__name" :title="item.name">{{ item.name }}</h3>

    <div class="card__count-row">
      <button
        ref="countBox"
        class="count"
        type="button"
        :aria-label="`${item.name}: ${fullText}${item.target !== null ? ` of ${formatCount(item.target)}` : ''}. Set count`"
        @click="emit('open-count', item)"
      >
        <span
          :key="popKey"
          class="count__value tabular"
          :class="{ 'count__value--pop': popKey > 0 }"
        >
          {{ shownText }}
        </span>
        <span v-if="item.target !== null" class="count__target tabular"> / {{ shownTarget }} </span>
        <AppIcon class="count__edit" name="pencil" :size="14" />
        <!-- Invisible copy of the row at full length, used to decide whether it fits. -->
        <span class="count__measure" aria-hidden="true">
          <span ref="measureValue" class="count__value tabular">{{ fullText }}</span>
          <template v-if="item.target !== null">
            <span ref="measureTarget" class="count__target tabular">
              / {{ formatCount(item.target) }}
            </span>
            <span ref="measureTargetCompact" class="count__target tabular">
              / {{ formatCompact(item.target) }}
            </span>
          </template>
        </span>
      </button>

      <span v-if="reached" class="done-text">Done</span>
      <span v-else-if="item.target !== null" class="percent tabular" aria-hidden="true">
        {{ percent }}%
      </span>
    </div>
    <span class="visually-hidden" aria-live="polite">{{ item.name }}: {{ fullText }}</span>

    <button
      class="icon-button card__menu"
      type="button"
      :aria-label="`More actions for ${item.name}`"
      aria-haspopup="dialog"
      @click="emit('open-menu', item)"
    >
      <AppIcon name="menu-vertical" :size="20" />
    </button>

    <div class="controls">
      <div class="control control--minus">
        <CountButton
          :direction="-1"
          :step="item.step"
          :disabled="!canDecrement(item.count)"
          :label="minusLabel"
          @change="onChange"
        />
        <TransitionGroup name="float">
          <span
            v-for="f in floats.filter((x) => x.side === 'minus')"
            :key="f.id"
            class="float tabular"
            aria-hidden="true"
            >{{ f.text }}</span
          >
        </TransitionGroup>
      </div>

      <CountSlider
        v-if="item.target !== null"
        class="card__slider"
        :count="item.count"
        :target="item.target"
        :label="item.name"
        :celebrate="celebrate"
        @change="onSlide"
      />

      <div class="control control--plus">
        <CountButton
          :direction="1"
          :step="item.step"
          :disabled="!canIncrement(item.count, item)"
          :label="plusLabel"
          @change="onChange"
        />
        <TransitionGroup name="float">
          <span
            v-for="f in floats.filter((x) => x.side === 'plus')"
            :key="f.id"
            class="float tabular"
            aria-hidden="true"
            >{{ f.text }}</span
          >
        </TransitionGroup>
      </div>
    </div>
  </article>
</template>

<style scoped>
/*
 * The controls get the full width since they are what you touch most:
 * [grip] [thumb] [name (wraps)       ] [⋮]
 * [grip] [thumb] [count / target ✎   62%]
 * [grip] [ − ] [━━━━━━━━●──────────] [ + ]   with a target: slider between − and +
 * [grip] [   −    ] [           +            ]   without a target
 */
.card {
  --pad: 6px;
  position: relative;
  display: grid;
  grid-template-columns: 22px auto minmax(0, 1fr) auto;
  grid-template-areas:
    'grip thumb name menu'
    'grip thumb count count'
    'grip controls controls controls';
  align-items: center;
  column-gap: var(--space-2);
  row-gap: 2px;
  padding: var(--pad) var(--space-2) var(--pad) 0;
  /* The thick left border is the accent bar; it follows the rounded corners. */
  border: 2px solid transparent;
  border-left: 5px solid var(--item);
  border-radius: 14px;
  background: color-mix(in oklch, var(--item) var(--tint-card), var(--color-surface));
  box-shadow: var(--shadow-card);
}

:root[data-theme='dark'] .card {
  border-color: rgb(255 255 255 / 0.06);
  border-left-color: var(--item);
}

/*
 * Reached: the card steps back so the eye goes to unfinished items. Everything but the check
 * and the Done text is dimmed, and comes back to full strength while the card is in use.
 */
.card--reached :is(.card__name, .count, .percent, .controls) {
  opacity: 0.55;
}

.card--reached:is(:hover, :focus-within) :is(.card__name, .count, .percent, .controls) {
  opacity: 1;
}

.drag-handle {
  grid-area: grip;
  align-self: stretch;
  display: grid;
  place-items: center;
  margin-block: calc(-1 * var(--pad));
  cursor: grab;
  touch-action: none;
  color: var(--color-text-muted);
}

.drag-handle--off {
  visibility: hidden;
}

.card__thumb {
  grid-area: thumb;
}

.done-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--item);
  color: var(--item-text);
}

.card__menu {
  grid-area: menu;
  align-self: start;
  width: 36px;
  height: 36px;
  margin: -2px -4px 0 0;
  color: var(--color-text-muted);
}

/* Up to two lines, so similar names stay distinguishable. */
.card__name {
  grid-area: name;
  align-self: end;
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: 0.9375rem;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.card__count-row {
  grid-area: count;
  align-self: start;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.count {
  position: relative;
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: var(--space-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

.count__value {
  display: inline-block;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.count__target {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.count__edit {
  flex: none;
  align-self: center;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.count__measure {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  visibility: hidden;
  pointer-events: none;
}

.percent {
  flex: none;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

/* In place of the %, in the same style; not dimmed, so it reads with the ✓ thumbnail. */
.done-text {
  flex: none;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

/* ─── Controls row ─── */
.controls {
  grid-area: controls;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  align-items: center;
  gap: var(--space-2);
}

.card--has-target .controls {
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  gap: var(--space-1);
}

.control {
  position: relative;
}

.float {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  z-index: 1;
  transform: translateX(-50%);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-text);
  color: var(--color-bg);
  font-size: 0.8125rem;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .count__value--pop {
    animation: pop 200ms var(--ease-out);
  }

  .card {
    transition:
      border-color var(--duration-base) var(--ease-out),
      box-shadow var(--duration-base) var(--ease-out);
  }

  .card :is(.card__name, .count, .percent, .controls) {
    transition: opacity var(--duration-base) var(--ease-out);
  }

  .done-mark {
    animation: badge-in 250ms var(--ease-out);
  }

  .card--celebrate {
    animation: glow 1200ms var(--ease-out) 1;
  }

  .float-enter-active {
    animation: float-up 700ms var(--ease-out) forwards;
  }
}

@media (prefers-reduced-motion: reduce) {
  .float {
    display: none;
  }
}

@keyframes pop {
  0% {
    transform: translateY(2px) scale(1);
  }
  50% {
    transform: translateY(0) scale(1.08);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

@keyframes glow {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--item) 70%, transparent);
  }
  100% {
    box-shadow: 0 0 0 10px color-mix(in srgb, var(--item) 0%, transparent);
  }
}

@keyframes badge-in {
  from {
    transform: scale(0);
  }
}

@keyframes float-up {
  0% {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -16px);
  }
}
</style>
