<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import AppIcon from './AppIcon.vue'
import {
  HOLD_DELAY_MS,
  REPEAT_PAUSE_MS,
  REPEAT_START_MS,
  nextRepeatInterval,
  pressAmount,
  type PressKind,
} from '@/lib/taps'

/**
 * A − or + button: tap = ±1, hold = ±step (then repeats while held).
 * Emits signed amounts; the parent applies them with the clamping rules and passes
 * `disabled` back when a limit is reached.
 */
const props = defineProps<{
  direction: 1 | -1
  step: number
  disabled: boolean
  label: string
}>()

const emit = defineEmits<{ change: [delta: number, kind: PressKind] }>()

let pressing = false
let held = false
let holdTimer: ReturnType<typeof setTimeout> | null = null
let repeatTimer: ReturnType<typeof setTimeout> | null = null
let interval = REPEAT_START_MS

function send(amount: number, kind: PressKind) {
  if (!props.disabled) emit('change', props.direction * amount, kind)
}

function stop() {
  pressing = false
  held = false
  if (holdTimer) clearTimeout(holdTimer)
  if (repeatTimer) clearTimeout(repeatTimer)
  holdTimer = repeatTimer = null
}

function repeat() {
  if (!pressing || props.disabled) return stop()
  send(props.step, 'repeat')
  interval = nextRepeatInterval(interval)
  repeatTimer = setTimeout(repeat, interval)
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || props.disabled) return
  stop()
  pressing = true
  holdTimer = setTimeout(() => {
    held = true
    if ('vibrate' in navigator) navigator.vibrate?.(8)
    send(props.step, 'step')
    interval = REPEAT_START_MS
    repeatTimer = setTimeout(repeat, REPEAT_PAUSE_MS)
  }, HOLD_DELAY_MS)
}

function onPointerUp(e: PointerEvent) {
  if (!pressing) return
  const wasHeld = held
  stop()
  if (wasHeld || props.disabled) return
  const { amount, kind } = pressAmount(props.step, e.shiftKey)
  send(amount, kind)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault() // we handle activation; no click follows
  if (props.disabled) return
  const { amount, kind } = pressAmount(props.step, e.shiftKey)
  send(amount, kind)
}

function onClick(e: MouseEvent) {
  // Pointer and keyboard presses are handled above. A click with detail 0 comes from
  // assistive technology activating the button directly.
  if (e.detail !== 0 || props.disabled) return
  const { amount, kind } = pressAmount(props.step, e.shiftKey)
  send(amount, kind)
}

onBeforeUnmount(stop)
</script>

<template>
  <button
    class="count-button"
    :class="direction > 0 ? 'count-button--plus' : 'count-button--minus'"
    type="button"
    :aria-label="label"
    :title="label"
    :aria-disabled="disabled"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointerleave="stop"
    @pointercancel="stop"
    @keydown="onKeyDown"
    @keyup.space.prevent
    @click="onClick"
    @contextmenu.prevent
  >
    <AppIcon :name="direction > 0 ? 'plus' : 'minus'" :size="18" />
  </button>
</template>

<style scoped>
.count-button {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Low but wide: the buttons span the card, so they stay easy to hit (REQUIREMENTS §5.1). */
  width: 100%;
  min-width: 40px;
  height: 32px;
  padding: 0 var(--space-1);
  border: 0;
  border-radius: var(--radius-pill);
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.count-button--plus {
  background: var(--item);
  color: var(--item-text);
}

.count-button--minus {
  background: color-mix(in oklch, var(--item) 22%, var(--color-surface));
  color: var(--color-text);
}

.count-button[aria-disabled='true'] {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: no-preference) {
  .count-button {
    transition: transform 100ms var(--ease-out);
  }
  .count-button:active:not([aria-disabled='true']) {
    transform: scale(0.96);
  }
}
</style>
