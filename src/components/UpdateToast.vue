<script setup lang="ts">
import { watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const UPDATE_CHECK_MS = 60 * 60 * 1000

const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    // Installed PWAs can stay open for days; check for a new version hourly.
    if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS)
  },
})

watch(offlineReady, (ready) => {
  if (ready) setTimeout(() => (offlineReady.value = false), 4000)
})
</script>

<template>
  <div class="toast-region" role="status" aria-live="polite">
    <Transition name="toast">
      <div v-if="needRefresh" class="toast">
        <span>Update available</span>
        <button class="button" type="button" @click="updateServiceWorker(true)">Reload</button>
        <button class="button button--quiet" type="button" @click="needRefresh = false">
          Later
        </button>
      </div>
      <div v-else-if="offlineReady" class="toast toast--info">
        <span>Ready to work offline</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
  z-index: 50;
  display: flex;
  justify-content: center;
  padding: 0 var(--space-4);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border: var(--border-card);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: var(--shadow-popover);
  font-weight: 600;
  pointer-events: auto;
}

.toast--info {
  padding: var(--space-3) var(--space-5);
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
    transform: translateY(12px);
  }
}
</style>
