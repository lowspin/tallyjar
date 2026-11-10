<script setup lang="ts">
import { computed } from 'vue'
import { formatCount, percentOf } from '@/lib/format'
import { progress } from '@/lib/clamp'

const props = defineProps<{
  count: number
  target: number
  label: string
  /** Plays the one-time shimmer. */
  celebrate?: boolean
}>()

const fraction = computed(() => progress(props.count, props.target))
const percent = computed(() => percentOf(props.count, props.target))
</script>

<template>
  <div class="progress">
    <div
      class="progress__track"
      role="progressbar"
      :aria-label="`${label} progress`"
      aria-valuemin="0"
      :aria-valuemax="target"
      :aria-valuenow="Math.min(count, target)"
      :aria-valuetext="`${formatCount(count)} of ${formatCount(target)}, ${percent}%`"
    >
      <div
        class="progress__fill"
        :class="{ 'progress__fill--shimmer': celebrate }"
        :style="{ width: `${fraction * 100}%` }"
      />
    </div>
    <span class="progress__percent tabular" aria-hidden="true">{{ percent }}%</span>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.progress__track {
  flex: 1;
  height: 10px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--item) 28%, var(--color-surface));
}

.progress__fill {
  position: relative;
  height: 100%;
  border-radius: inherit;
  background: var(--item);
  overflow: hidden;
}

.progress__percent {
  min-width: 4ch;
  text-align: right;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: no-preference) {
  .progress__fill {
    transition: width var(--duration-base) var(--ease-out);
  }
  .progress__fill--shimmer::after {
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
