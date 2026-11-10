<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'
import AppIcon, { type IconName } from './AppIcon.vue'

export interface SheetAction {
  id: string
  label: string
  icon?: IconName
  /** Small swatch shown before the label, e.g. a jar color. */
  swatch?: string
  disabled?: boolean
  danger?: boolean
}

defineProps<{ title: string; actions: SheetAction[] }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ select: [id: string] }>()

function choose(action: SheetAction) {
  if (action.disabled) return
  open.value = false
  emit('select', action.id)
}
</script>

<template>
  <BottomSheet v-model="open" :title="title" size="small">
    <ul class="actions" role="list">
      <li v-for="action in actions" :key="action.id">
        <button
          class="action"
          :class="{ 'action--danger': action.danger }"
          type="button"
          :disabled="action.disabled"
          @click="choose(action)"
        >
          <AppIcon v-if="action.icon" :name="action.icon" />
          <span v-else-if="action.swatch" class="swatch" :style="{ background: action.swatch }" />
          <span class="label">{{ action.label }}</span>
        </button>
      </li>
    </ul>
  </BottomSheet>
</template>

<style scoped>
.actions {
  display: grid;
  gap: var(--space-1);
  margin: 0 calc(-1 * var(--space-2));
  padding: 0;
  list-style: none;
}

.action {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  font-weight: 600;
}

.action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.action:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.action--danger {
  color: var(--color-danger);
}

.swatch {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
