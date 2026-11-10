<script setup lang="ts">
import { computed } from 'vue'
import BottomSheet from './BottomSheet.vue'
import { confirmState, settleConfirm } from '@/composables/useConfirm'

// Closing by Esc, backdrop or the close button counts as "cancel".
const open = computed({
  get: () => confirmState.open,
  set: (value) => !value && settleConfirm(false),
})
</script>

<template>
  <BottomSheet v-model="open" :title="confirmState.title" size="small">
    <p v-if="confirmState.message" class="message">{{ confirmState.message }}</p>
    <template #footer>
      <button class="button button--quiet" type="button" @click="settleConfirm(false)">
        {{ confirmState.cancelLabel }}
      </button>
      <button
        class="button"
        :class="{ 'button--danger': confirmState.danger }"
        type="button"
        autofocus
        @click="settleConfirm(true)"
      >
        {{ confirmState.confirmLabel }}
      </button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.message {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
