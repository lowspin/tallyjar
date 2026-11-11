<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { formatCount, percentOf } from '@/lib/format'
import { progress } from '@/lib/clamp'
import { sliderStep, snapToSlider } from '@/lib/taps'

/**
 * Progress bar that doubles as a slider from 0 to the target.
 *
 * Dragging is relative: wherever the finger lands, the value moves by how far it travels,
 * so a stray tap on the track never changes the count. `touch-action: pan-y` keeps vertical
 * swipes scrolling the list. Values snap to round numbers (see `sliderStep`).
 */
const props = defineProps<{
  count: number
  target: number
  /** The item name, for the accessible label. */
  label: string
  disabled?: boolean
  /** Plays the one-time shimmer. */
  celebrate?: boolean
}>()

const emit = defineEmits<{ change: [value: number] }>()

const track = useTemplateRef<HTMLElement>('track')
const dragging = ref(false)

const fraction = computed(() => progress(props.count, props.target))
const percent = computed(() => percentOf(props.count, props.target))
const grid = computed(() => sliderStep(props.target))

const DRAG_THRESHOLD_PX = 4

let pointerId: number | null = null
let startX = 0
let startValue = 0
let width = 1
let moved = false

function onPointerDown(e: PointerEvent) {
  if (props.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
  pointerId = e.pointerId
  startX = e.clientX
  startValue = Math.min(props.count, props.target)
  width = track.value?.clientWidth || 1
  moved = false
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  const dx = e.clientX - startX
  if (!moved) {
    if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
    moved = true
    dragging.value = true
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const value = snapToSlider(startValue + (dx / width) * props.target, props.target)
  if (value !== Math.min(props.count, props.target)) emit('change', value)
}

function onPointerEnd(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  pointerId = null
  dragging.value = false
}

function onKeyDown(e: KeyboardEvent) {
  if (props.disabled) return
  const current = Math.min(props.count, props.target)
  const big = grid.value * 10
  let next: number | null = null
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = current + grid.value
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = current - grid.value
      break
    case 'PageUp':
      next = current + big
      break
    case 'PageDown':
      next = current - big
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = props.target
      break
    default:
      return
  }
  e.preventDefault()
  next = snapToSlider(next, props.target)
  if (next !== current) emit('change', next)
}
</script>

<template>
  <div
    class="slider"
    :class="{ 'slider--dragging': dragging, 'slider--disabled': disabled }"
    role="slider"
    :tabindex="disabled ? -1 : 0"
    :aria-label="`${label} count`"
    aria-valuemin="0"
    :aria-valuemax="target"
    :aria-valuenow="Math.min(count, target)"
    :aria-valuetext="`${formatCount(count)} of ${formatCount(target)}, ${percent}%`"
    :aria-disabled="disabled || undefined"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @keydown="onKeyDown"
  >
    <div ref="track" class="slider__track">
      <div
        class="slider__fill"
        :class="{ 'slider__fill--shimmer': celebrate }"
        :style="{ width: `${fraction * 100}%` }"
      />
      <div class="slider__thumb" :style="{ left: `${fraction * 100}%` }" />
    </div>
  </div>
</template>

<style scoped>
/* The whole control height is the touch area; the visible track is thin. */
.slider {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  height: 32px;
  padding: 0 12px; /* room for the thumb at both ends */
  border-radius: var(--radius-pill);
  cursor: grab;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.slider--dragging {
  cursor: grabbing;
}

.slider--disabled {
  cursor: default;
}

.slider__track {
  position: relative;
  flex: 1;
  height: 10px;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--item) 25%, var(--color-surface));
}

.slider__fill {
  position: relative;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  background: var(--item);
}

.slider__thumb {
  position: absolute;
  top: 50%;
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-surface);
  border-radius: 50%;
  background: var(--item);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
  transform: translate(-50%, -50%);
}

.slider--dragging .slider__thumb {
  transform: translate(-50%, -50%) scale(1.2);
}

.slider--disabled .slider__thumb {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  .slider:not(.slider--dragging) .slider__fill {
    transition: width var(--duration-base) var(--ease-out);
  }
  .slider:not(.slider--dragging) .slider__thumb {
    transition:
      left var(--duration-base) var(--ease-out),
      transform 100ms var(--ease-out);
  }
  .slider__fill--shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      transparent 20%,
      rgb(255 255 255 / 0.6) 50%,
      transparent 80%
    );
    transform: translateX(-100%);
    animation: shimmer 900ms var(--ease-out) 1;
  }
}

@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}
</style>
