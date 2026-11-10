<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import CountButton from './CountButton.vue'
import ProgressBar from './ProgressBar.vue'
import ItemThumb from './ItemThumb.vue'
import { useItemsStore } from '@/stores/items'
import { canDecrement, canIncrement, isLocked, isReached } from '@/lib/clamp'
import { formatCompact, formatCount, formatSigned } from '@/lib/format'
import { textOn } from '@/lib/palette'
import type { TapKind } from '@/lib/taps'
import type { Item } from '@/db/types'

const props = defineProps<{ item: Item }>()
const emit = defineEmits<{ 'open-count': [item: Item]; 'open-menu': [item: Item] }>()

const store = useItemsStore()

const reached = computed(() => isReached(props.item.count, props.item.target))
const locked = computed(() => isLocked(props.item))
const done = computed(() => locked.value && !canIncrement(props.item.count, props.item))
/** Shown inside the −/+ buttons when a double tap does more than ±1. */
function stepHint(sign: 1 | -1): string | undefined {
  const { step } = props.item
  if (step <= 1) return undefined
  // Long steps use the compact form so the hint fits inside the button.
  return step >= 10_000 ? (sign > 0 ? '+' : '−') + formatCompact(step) : formatSigned(sign * step)
}

const plusLabel = computed(() => {
  const { name, step } = props.item
  return step > 1
    ? `Add 1 to ${name}; double-tap or Shift to add ${formatCount(step)}`
    : `Add 1 to ${name}`
})
const minusLabel = computed(() => {
  const { name, step } = props.item
  return step > 1
    ? `Subtract 1 from ${name}; double-tap or Shift to subtract ${formatCount(step)}`
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

function fit() {
  if (!countBox.value || !measureValue.value) return
  const room = countBox.value.clientWidth
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

// ─── Feedback: count pop, double-tap label, target reached ──────────────────
const popKey = ref(0)
const floats = ref<{ id: number; text: string; side: 'minus' | 'plus' }[]>([])
let floatId = 0
const celebrate = ref(false)
let celebrateTimer: ReturnType<typeof setTimeout> | null = null

function onChange(delta: number, kind: TapKind | 'repeat') {
  const next = store.adjust(props.item.id, delta)
  if (next === null) return
  popKey.value++
  if (kind === 'double') {
    const sign = delta > 0 ? 1 : -1
    const id = ++floatId
    floats.value.push({
      id,
      text: formatSigned(sign * props.item.step),
      side: sign > 0 ? 'plus' : 'minus',
    })
    setTimeout(() => (floats.value = floats.value.filter((f) => f.id !== id)), 700)
  }
}

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
    :class="{ 'card--reached': reached, 'card--celebrate': celebrate }"
    :style="{ '--item': item.color, '--item-text': textOn(item.color) }"
    :aria-label="item.name"
  >
    <!-- Pointer-only: keyboard and screen-reader users reorder with Move up/down in the menu. -->
    <span class="drag-handle" aria-hidden="true" title="Drag to reorder">
      <AppIcon name="grip" :size="18" />
    </span>

    <ItemThumb :name="item.name" :color="item.color" :image-id="item.imageId" :size="40" />

    <div class="card__info">
      <div class="card__title">
        <h3 class="card__name">{{ item.name }}</h3>
        <span v-if="reached" class="badge" role="img" aria-label="Target reached">
          <AppIcon name="check" :size="12" />
        </span>
      </div>

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
      <span class="visually-hidden" aria-live="polite">{{ item.name }}: {{ fullText }}</span>

      <ProgressBar
        v-if="item.target !== null"
        :count="item.count"
        :target="item.target"
        :label="item.name"
        :celebrate="celebrate"
      />
    </div>

    <div class="controls">
      <div class="control">
        <CountButton
          :direction="-1"
          :step="item.step"
          :disabled="!canDecrement(item.count)"
          :label="minusLabel"
          :hint="stepHint(-1)"
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

      <div class="control">
        <span v-if="done" class="done" role="status">
          <AppIcon name="check" :size="22" />
          <span class="visually-hidden">Done</span>
        </span>
        <CountButton
          v-else
          :direction="1"
          :step="item.step"
          :disabled="!canIncrement(item.count, item)"
          :label="plusLabel"
          :hint="stepHint(1)"
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

    <button
      class="icon-button card__menu"
      type="button"
      :aria-label="`More actions for ${item.name}`"
      aria-haspopup="dialog"
      @click="emit('open-menu', item)"
    >
      <AppIcon name="menu-vertical" :size="20" />
    </button>
  </article>
</template>

<style scoped>
/*
 * One compact row so about eight items fit on a phone screen:
 * [grip] [thumb] [name / count / progress] [− +] [⋮]
 */
.card {
  --pad: var(--space-2);
  position: relative;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  min-height: 64px;
  padding: var(--pad) 0;
  /* The thick left border is the accent bar; it follows the rounded corners. */
  border: 1.5px solid transparent;
  border-left: 5px solid var(--item);
  border-radius: 14px;
  background: color-mix(in oklch, var(--item) var(--tint-card), var(--color-surface));
  box-shadow: var(--shadow-card);
}

:root[data-theme='dark'] .card:not(.card--reached) {
  border-color: rgb(255 255 255 / 0.06);
  border-left-color: var(--item);
}

.card--reached {
  border-color: var(--item);
}

/* Full-height strips at both ends: easy to hit without taking much width. */
.drag-handle,
.card__menu {
  align-self: stretch;
  margin-block: calc(-1 * var(--pad));
}

.drag-handle {
  display: grid;
  place-items: center;
  width: 22px;
  cursor: grab;
  touch-action: none;
  color: var(--color-text-muted);
}

.card__menu {
  width: 36px;
  height: auto;
  border-radius: 0 12px 12px 0;
  color: var(--color-text-muted);
}

.card__info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.card__title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}

.card__name {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 0.9375rem;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--item);
  color: var(--item-text);
}

.count {
  position: relative;
  display: flex;
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
  font-size: 1.3125rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.card--reached .count__value {
  font-weight: 900;
}

.count__target {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-muted);
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

.controls {
  display: flex;
  gap: var(--space-2);
}

/* Small phones: give the name and count a little more room. */
@media (max-width: 380px) {
  .controls {
    gap: 6px;
  }
  .done {
    width: 48px;
  }
}

.control {
  position: relative;
}

.done {
  display: grid;
  place-items: center;
  width: 56px;
  height: 48px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--item);
  color: var(--color-text);
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

  .card--celebrate {
    animation: glow 1200ms var(--ease-out) 1;
  }

  .badge {
    animation: badge-in 250ms var(--ease-out);
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
