<script setup lang="ts">
import { computed, nextTick, useId, useTemplateRef } from 'vue'
import AppIcon from './AppIcon.vue'
import { PALETTE, PALETTE_COLUMNS, isPaletteColor, textOn } from '@/lib/palette'

defineProps<{ label: string }>()
const value = defineModel<string>({ required: true })

const labelId = useId()
const grid = useTemplateRef<HTMLElement>('grid')

const current = computed(() => value.value.toUpperCase())
const custom = computed(() => (isPaletteColor(current.value) ? null : current.value))
/** The 25 palette colors, plus the chosen custom color as a 26th swatch. */
const options = computed<string[]>(() => (custom.value ? [...PALETTE, custom.value] : [...PALETTE]))

function select(color: string) {
  value.value = color.toUpperCase()
}

async function focusIndex(index: number) {
  const color = options.value[index]
  if (!color) return
  select(color)
  await nextTick()
  grid.value?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus()
}

function onKeydown(e: KeyboardEvent, index: number) {
  const last = options.value.length - 1
  const moves: Record<string, number> = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    ArrowDown: index + PALETTE_COLUMNS,
    ArrowUp: index - PALETTE_COLUMNS,
    Home: 0,
    End: last,
  }
  const to = moves[e.key]
  if (to === undefined) return
  e.preventDefault()
  void focusIndex(Math.min(Math.max(to, 0), last))
}

function onCustomInput(e: Event) {
  select((e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="color-picker">
    <div :id="labelId" class="field__label">{{ label }}</div>
    <div ref="grid" class="grid" role="radiogroup" :aria-labelledby="labelId">
      <button
        v-for="(color, index) in options"
        :key="color"
        class="swatch"
        :class="{ 'swatch--custom': color === custom }"
        type="button"
        role="radio"
        :data-index="index"
        :aria-checked="color === current"
        :aria-label="color === custom ? `Custom color ${color}` : `Color ${index + 1}, ${color}`"
        :tabindex="color === current ? 0 : -1"
        :style="{ background: color, color: textOn(color) }"
        @click="select(color)"
        @keydown="onKeydown($event, index)"
      >
        <AppIcon v-if="color === current" name="check" :size="18" />
      </button>
    </div>
    <div class="custom">
      <AppIcon name="pipette" :size="18" />
      <span>Custom color…</span>
      <!-- Transparent overlay so a tap anywhere opens the native picker, including on mobile. -->
      <input
        class="custom__input"
        type="color"
        :value="current.toLowerCase()"
        aria-label="Choose a custom color"
        @input="onCustomInput"
      />
    </div>
  </div>
</template>

<style scoped>
.color-picker {
  display: grid;
  gap: var(--space-2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 48px));
  gap: var(--space-2);
}

.swatch {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
}

.swatch[aria-checked='true'] {
  box-shadow:
    0 0 0 3px var(--color-surface),
    0 0 0 5px var(--color-text);
}

.swatch:focus-visible {
  box-shadow:
    0 0 0 3px var(--color-surface),
    0 0 0 5px var(--color-primary),
    var(--focus-ring);
}

@media (prefers-reduced-motion: no-preference) {
  .swatch {
    transition: transform var(--duration-fast) var(--ease-out);
  }
  .swatch:active {
    transform: scale(0.92);
  }
}

.custom {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  justify-self: start;
  min-height: 44px;
  margin-top: var(--space-1);
  padding: 0 var(--space-4);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
  font-size: 0.9375rem;
  font-weight: 600;
}

.custom:has(:focus-visible) {
  box-shadow: var(--focus-ring);
}

.custom__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
