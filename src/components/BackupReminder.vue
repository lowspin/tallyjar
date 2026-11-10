<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useBackupStore } from '@/stores/backup'

const emit = defineEmits<{ export: [] }>()
const backup = useBackupStore()
</script>

<template>
  <Transition name="reminder">
    <aside v-if="backup.showReminder" class="reminder" aria-label="Backup reminder">
      <AppIcon name="download" :size="20" class="reminder__icon" />
      <p class="reminder__text">Your counts live only on this device. Export a backup?</p>
      <div class="reminder__actions">
        <button class="button reminder__button" type="button" @click="emit('export')">
          Export
        </button>
        <button
          class="icon-button"
          type="button"
          aria-label="Dismiss backup reminder for 2 weeks"
          @click="backup.snoozeReminder()"
        >
          <AppIcon name="x" :size="20" />
        </button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.reminder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  margin: var(--space-2) 0 var(--space-3);
  padding: var(--space-3) var(--space-2) var(--space-3) var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
}

.reminder__icon {
  flex: none;
  color: var(--color-primary);
}

.reminder__text {
  flex: 1 1 12rem;
  margin: 0;
  font-weight: 600;
}

.reminder__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

.reminder__button {
  min-height: 40px;
  padding: 0 var(--space-4);
}

@media (prefers-reduced-motion: no-preference) {
  .reminder-enter-active,
  .reminder-leave-active {
    transition:
      opacity var(--duration-base) var(--ease-out),
      transform var(--duration-base) var(--ease-out);
  }
  .reminder-enter-from,
  .reminder-leave-to {
    opacity: 0;
    transform: translateY(-6px);
  }
}
</style>
