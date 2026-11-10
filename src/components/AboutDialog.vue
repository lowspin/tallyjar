<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { LOGO_URL } from '@/lib/assets'

const open = defineModel<boolean>({ required: true })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(open, (value) => {
  if (value) dialog.value?.showModal()
  else dialog.value?.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="about"
    aria-labelledby="about-title"
    @close="open = false"
    @click.self="open = false"
  >
    <div class="about__body">
      <button
        class="icon-button about__close"
        type="button"
        aria-label="Close"
        @click="open = false"
      >
        <AppIcon name="x" />
      </button>
      <img :src="LOGO_URL" alt="" width="72" height="72" />
      <h2 id="about-title">Tallyjar</h2>
      <p>A calm, friendly way to count things.</p>
      <p class="muted">
        Everything you count stays on this device. There's no account and nothing is sent anywhere.
        Export a backup now and then to keep it safe.
      </p>
    </div>
  </dialog>
</template>

<style scoped>
.about {
  width: min(360px, calc(100vw - 32px));
  padding: 0;
  border: var(--border-card);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-popover);
}

.about::backdrop {
  background: var(--color-backdrop);
}

.about__body {
  position: relative;
  padding: var(--space-6) var(--space-5) var(--space-5);
  text-align: center;
}

.about__close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}

h2 {
  margin: var(--space-2) 0 var(--space-1);
  font-size: 1.375rem;
}

p {
  margin: 0 0 var(--space-3);
}

.muted {
  color: var(--color-text-muted);
  font-size: 0.9375rem;
}
</style>
