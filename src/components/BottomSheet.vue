<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * A modal sheet built on <dialog>: focus trap, Esc and top-layer stacking come from the
 * browser. Slides up from the bottom on phones and sits centred on wider screens.
 */
defineProps<{ title: string; size?: 'auto' | 'small' }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ closed: [] }>()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const closing = ref(false)
const titleId = useId()
const CLOSE_MS = 200

const reducedMotion = () => matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true

let closeTimer: ReturnType<typeof setTimeout> | null = null

function show() {
  if (closeTimer) clearTimeout(closeTimer)
  closing.value = false
  if (!dialog.value?.open) dialog.value?.showModal()
}

function hide() {
  const el = dialog.value
  if (!el?.open) return
  if (reducedMotion()) {
    el.close()
    return
  }
  closing.value = true
  closeTimer = setTimeout(() => {
    closing.value = false
    el.close()
  }, CLOSE_MS)
}

// 'post' so the content (e.g. which field has `autofocus`) is up to date before showModal().
watch(open, (value) => (value ? show() : hide()), { flush: 'post' })
onMounted(() => open.value && show())
onBeforeUnmount(() => closeTimer && clearTimeout(closeTimer))

function onCancel(e: Event) {
  // Esc: animate out instead of closing instantly.
  e.preventDefault()
  open.value = false
}

function onClose() {
  open.value = false
  emit('closed')
}

// The dialog element itself only receives presses outside the panel. Require both the press
// and the click to land there, so the click that ends the gesture which opened the sheet
// (e.g. a long-press) doesn't immediately close it.
let pressedBackdrop = false

function onPointerDown(e: PointerEvent) {
  pressedBackdrop = e.target === dialog.value
}

function onClick(e: MouseEvent) {
  if (pressedBackdrop && e.target === dialog.value) open.value = false
  pressedBackdrop = false
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :class="[{ 'sheet--closing': closing }, `sheet--${size ?? 'auto'}`]"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @close="onClose"
    @pointerdown="onPointerDown"
    @click="onClick"
  >
    <div class="sheet__panel">
      <header class="sheet__header">
        <h2 :id="titleId" class="sheet__title">{{ title }}</h2>
        <button class="icon-button" type="button" aria-label="Close" @click="open = false">
          <AppIcon name="x" />
        </button>
      </header>
      <div class="sheet__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="sheet__footer">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  /* The dialog is a transparent full-screen layer; the panel is the visible sheet. */
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  overflow: hidden;
}

.sheet[open] {
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet::backdrop {
  background: var(--color-backdrop);
}

.sheet__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: calc(100dvh - 48px);
  border: var(--border-card);
  border-bottom: 0;
  border-radius: 20px 20px 0 0;
  background: var(--color-surface);
  box-shadow: var(--shadow-popover);
}

.sheet--small .sheet__panel {
  max-width: 420px;
}

@media (min-width: 640px) {
  .sheet[open] {
    align-items: center;
  }
  .sheet__panel {
    border-bottom: var(--border-card);
    border-radius: 20px;
  }
}

.sheet__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-2) 0 var(--space-5);
}

.sheet__title {
  flex: 1;
  margin: 0;
  font-size: 1.125rem;
  font-weight: 800;
}

.sheet__body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-3) var(--space-5) var(--space-5);
}

.sheet__footer {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: flex-end;
  padding: var(--space-3) var(--space-5) calc(var(--space-4) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
}

@media (prefers-reduced-motion: no-preference) {
  .sheet[open] .sheet__panel {
    animation: sheet-in var(--duration-base) var(--ease-out);
  }
  .sheet[open]::backdrop {
    animation: fade-in var(--duration-base) var(--ease-out);
  }
  .sheet--closing[open] .sheet__panel {
    animation: sheet-out 200ms ease-in forwards;
  }
  .sheet--closing[open]::backdrop {
    animation: fade-out 200ms ease-in forwards;
  }
}

@keyframes sheet-in {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
}

@keyframes sheet-out {
  to {
    transform: translateY(24px);
    opacity: 0;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

@keyframes fade-out {
  to {
    opacity: 0;
  }
}
</style>
