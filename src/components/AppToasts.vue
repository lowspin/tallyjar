<script setup lang="ts">
import { toasts } from '@/composables/useToast'
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="toast in toasts" :key="toast.id" class="toast">{{ toast.message }}</div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
  z-index: 40;
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  pointer-events: none;
}

.toast {
  max-width: 100%;
  padding: var(--space-3) var(--space-5);
  border: var(--border-card);
  border-radius: var(--radius-pill);
  background: var(--color-text);
  color: var(--color-bg);
  box-shadow: var(--shadow-popover);
  font-weight: 700;
}

@media (prefers-reduced-motion: no-preference) {
  .toast-enter-active,
  .toast-leave-active {
    transition:
      opacity var(--duration-base) var(--ease-out),
      transform var(--duration-base) var(--ease-out);
  }
  .toast-enter-from,
  .toast-leave-to {
    opacity: 0;
    transform: translateY(8px);
  }
}
</style>
