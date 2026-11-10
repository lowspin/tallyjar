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
const stepHint = computed(() => props.item.step > 1)

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

// ─── Count display: full number, or compact when it doesn't fit ─────────────
const countBox = useTemplateRef<HTMLElement>('countBox')
const measure = useTemplateRef<HTMLElement>('measure')
const compact = ref(false)
const fullText = computed(() => formatCount(props.item.count))
const shownText = computed(() => (compact.value ? formatCompact(props.item.count) : fullText.value))

function fit() {
  if (!countBox.value || !measure.value) return
  compact.value = measure.value.offsetWidth > countBox.value.clientWidth
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
watch(fullText, () => nextTick(fit))

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
    <header class="card__head">
      <ItemThumb :name="item.name" :color="item.color" :image-id="item.imageId" />
      <h3 class="card__name">{{ item.name }}</h3>
      <span v-if="reached" class="badge" role="img" aria-label="Target reached">
        <AppIcon name="check" :size="16" />
      </span>
      <!-- Pointer-only: keyboard and screen-reader users reorder with Move up/down in the menu. -->
      <span class="icon-button drag-handle" aria-hidden="true" title="Drag to reorder">
        <AppIcon name="grip" />
      </span>
      <button
        class="icon-button"
        type="button"
        :aria-label="`More actions for ${item.name}`"
        aria-haspopup="dialog"
        @click="emit('open-menu', item)"
      >
        <AppIcon name="menu-vertical" />
      </button>
    </header>

    <button
      ref="countBox"
      class="count"
      type="button"
      :aria-label="`${item.name}: ${fullText}${item.target !== null ? ` of ${formatCount(item.target)}` : ''}. Set count`"
      @click="emit('open-count', item)"
    >
      <span :key="popKey" class="count__value tabular" :class="{ 'count__value--pop': popKey > 0 }">
        {{ shownText }}
      </span>
      <span v-if="item.target !== null" class="count__target tabular">
        / {{ formatCount(item.target) }}
      </span>
      <!-- Invisible copy of the row at full length, used to decide whether it fits. -->
      <span ref="measure" class="count__measure" aria-hidden="true">
        <span class="count__value tabular">{{ fullText }}</span>
        <span v-if="item.target !== null" class="count__target tabular">
          / {{ formatCount(item.target) }}
        </span>
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

    <div class="controls">
      <div class="control">
        <CountButton
          :direction="-1"
          :step="item.step"
          :disabled="!canDecrement(item.count)"
          :label="minusLabel"
          @change="onChange"
        />
        <span v-if="stepHint" class="hint tabular" aria-hidden="true">
          {{ formatSigned(-item.step) }}
        </span>
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
        <span v-if="done" class="done" role="status">Done <AppIcon name="check" :size="20" /></span>
        <CountButton
          v-else
          :direction="1"
          :step="item.step"
          :disabled="!canIncrement(item.count, item)"
          :label="plusLabel"
          @change="onChange"
        />
        <span v-if="stepHint && !done" class="hint tabular" aria-hidden="true">
          {{ formatSigned(item.step) }}
        </span>
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
.card {
  position: relative;
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-4) calc(var(--space-4) + 6px);
  overflow: hidden;
  border: 1.5px solid transparent;
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--item) var(--tint-card), var(--color-surface));
  box-shadow: var(--shadow-card);
}

:root[data-theme='dark'] .card:not(.card--reached) {
  border-color: rgb(255 255 255 / 0.06);
}

/* Accent bar */
.card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  background: var(--item);
}

.card--reached {
  border-color: var(--item);
}

.card__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  margin-right: calc(-1 * var(--space-2));
}

.card__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 1.0625rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--item);
  color: var(--item-text);
}

.drag-handle {
  cursor: grab;
  touch-action: none;
  color: var(--color-text-muted);
}

.count {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
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
  font-size: 2.25rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.card--reached .count__value {
  font-weight: 900;
}

.count__target {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.count__measure {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  visibility: hidden;
  pointer-events: none;
}

.controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  margin-top: var(--space-1);
}

.control {
  position: relative;
  display: grid;
  justify-items: center;
  gap: var(--space-1);
}

.hint {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.done {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  height: 56px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--item);
  color: var(--color-text);
  font-weight: 800;
}

.float {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-text);
  color: var(--color-bg);
  font-size: 0.875rem;
  font-weight: 800;
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
    transform: translateY(3px) scale(1);
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
    box-shadow: 0 0 0 14px color-mix(in srgb, var(--item) 0%, transparent);
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
    transform: translate(-50%, -28px);
  }
}
</style>
