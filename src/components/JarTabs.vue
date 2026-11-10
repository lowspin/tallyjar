<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ActionSheet, { type SheetAction } from './ActionSheet.vue'
import { useCollectionsStore } from '@/stores/collections'
import { useSortableList } from '@/composables/useSortableList'
import { textOn } from '@/lib/palette'
import { JAR_PANEL_ID, jarTabId as tabId } from '@/lib/ids'
import type { Collection } from '@/db/types'

const emit = defineEmits<{ create: []; edit: [jar: Collection] }>()

const store = useCollectionsStore()
const list = useTemplateRef<HTMLElement>('list')

// ─── Drag to reorder ────────────────────────────────────────────────────────
// Touch: long-press (300 ms) then drag. Mouse: click-drag straight away.
const dragging = ref(false)

useSortableList(list, {
  direction: 'horizontal',
  delay: 300,
  delayOnTouchOnly: true,
  touchStartThreshold: 6,
  forceFallback: true,
  fallbackTolerance: 4,
  ghostClass: 'tab--ghost',
  chosenClass: 'tab--chosen',
  dragClass: 'tab--drag',
  onDragStart: () => (dragging.value = true),
  // Clear after the click that follows the drop has been ignored.
  onDragEnd: () => setTimeout(() => (dragging.value = false)),
  onReorder: (ids) => void store.reorder(ids).catch((e) => console.error(e)),
})

// ─── Long-press (touch) / right-click / Shift+F10 opens the tab menu ────────
const LONG_PRESS_MS = 500
let press: { id: string; x: number; y: number; t: number; type: string } | null = null
let suppressClick = false
let lastPointerType = 'mouse'

function onPointerDown(e: PointerEvent, jar: Collection) {
  lastPointerType = e.pointerType
  suppressClick = false // a fresh press; any earlier long-press click has been consumed
  press = { id: jar.id, x: e.clientX, y: e.clientY, t: e.timeStamp, type: e.pointerType }
}

function onPointerUp(e: PointerEvent, jar: Collection) {
  const p = press
  press = null
  // Judge by movement, not by Sortable's drag state: in fallback mode Sortable reports a drag
  // start as soon as the touch delay passes, even if the finger never moves.
  if (!p || p.id !== jar.id || p.type === 'mouse') return
  const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
  if (e.timeStamp - p.t >= LONG_PRESS_MS && moved < 10) {
    suppressClick = true
    openMenu(jar)
  }
}

function onContextMenu(e: MouseEvent, jar: Collection) {
  e.preventDefault()
  // On touch, the long-press handler above decides; elsewhere (right-click, keyboard) open now.
  if (lastPointerType !== 'touch') openMenu(jar)
}

// ─── Selecting ──────────────────────────────────────────────────────────────
function onClick(jar: Collection) {
  if (suppressClick || dragging.value) {
    suppressClick = false
    return
  }
  if (jar.id === store.activeId) emit('edit', jar)
  else store.setActive(jar.id)
}

async function focusTab(index: number) {
  const jar = store.collections[index]
  if (!jar) return
  store.setActive(jar.id)
  await nextTick()
  document.getElementById(tabId(jar.id))?.focus()
}

function onKeydown(e: KeyboardEvent, index: number) {
  lastPointerType = 'keyboard'
  const last = store.collections.length - 1
  const to = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: last }[e.key]
  if (to === undefined) return
  e.preventDefault()
  void focusTab(Math.min(Math.max(to, 0), last))
}

// Keep the active tab visible.
watch(
  () => store.activeId,
  async (id, previous) => {
    if (!id) return
    await nextTick()
    const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(tabId(id))?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: previous === undefined || reduced ? 'auto' : 'smooth',
    })
  },
  { immediate: true },
)

// ─── Tab menu ───────────────────────────────────────────────────────────────
const menuJar = ref<Collection | null>(null)
const menuOpen = ref(false)

function openMenu(jar: Collection) {
  menuJar.value = jar
  menuOpen.value = true
}

const menuActions = computed<SheetAction[]>(() => {
  const index = store.collections.findIndex((c) => c.id === menuJar.value?.id)
  return [
    { id: 'edit', label: 'Edit jar', icon: 'pencil' },
    { id: 'left', label: 'Move left', icon: 'arrow-left', disabled: index <= 0 },
    {
      id: 'right',
      label: 'Move right',
      icon: 'arrow-right',
      disabled: index === -1 || index >= store.collections.length - 1,
    },
  ]
})

function onMenuSelect(action: string) {
  const jar = menuJar.value
  if (!jar) return
  if (action === 'edit') {
    emit('edit', jar)
    return
  }
  const ids = store.collections.map((c) => c.id)
  const from = ids.indexOf(jar.id)
  const to = action === 'left' ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= ids.length) return
  ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
  void store.reorder(ids).catch((e) => console.error(e))
}
</script>

<template>
  <nav class="tabs-row" aria-label="Jars">
    <div ref="list" class="tabs" role="tablist" aria-label="Jars" aria-orientation="horizontal">
      <button
        v-for="(jar, index) in store.collections"
        :id="tabId(jar.id)"
        :key="jar.id"
        class="tab"
        :class="{ 'tab--active': jar.id === store.activeId }"
        type="button"
        role="tab"
        :data-id="jar.id"
        :aria-selected="jar.id === store.activeId"
        :aria-controls="JAR_PANEL_ID"
        :tabindex="jar.id === store.activeId ? 0 : -1"
        :title="jar.id === store.activeId ? 'Tap again to edit' : undefined"
        :style="{ '--jar': jar.color, '--jar-text': textOn(jar.color) }"
        @click="onClick(jar)"
        @keydown="onKeydown($event, index)"
        @pointerdown="onPointerDown($event, jar)"
        @pointerup="onPointerUp($event, jar)"
        @pointercancel="press = null"
        @contextmenu="onContextMenu($event, jar)"
      >
        <span class="tab__dot" aria-hidden="true" />
        <span class="tab__name">{{ jar.name }}</span>
      </button>
    </div>
    <button class="tab tab--new" type="button" aria-label="New jar" @click="emit('create')">
      <AppIcon name="plus" :size="18" />
    </button>
  </nav>

  <ActionSheet
    v-model="menuOpen"
    :title="menuJar?.name ?? 'Jar'"
    :actions="menuActions"
    @select="onMenuSelect"
  />
</template>

<style scoped>
.tabs-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow-x: auto;
  padding: var(--space-1) var(--space-4) var(--space-3);
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.tabs-row::-webkit-scrollbar {
  display: none;
}

.tabs {
  display: flex;
  gap: var(--space-2);
}

.tab {
  --jar: var(--color-primary);
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  height: 44px;
  max-width: 220px;
  padding: 0 var(--space-4);
  border: 1.5px solid color-mix(in srgb, var(--jar) 55%, transparent);
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--jar) var(--tint-card), var(--color-surface));
  font-weight: 700;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
}

.tab__dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--jar);
}

.tab__name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab--active {
  border-color: var(--jar);
  background: var(--jar);
  color: var(--jar-text);
  font-weight: 800;
}

.tab--active .tab__dot {
  display: none;
}

.tab--new {
  justify-content: center;
  width: 44px;
  padding: 0;
  border: 1.5px dashed color-mix(in srgb, var(--color-text) 35%, transparent);
  background: transparent;
  color: var(--color-text-muted);
}

.tab--new:hover {
  color: var(--color-text);
  border-color: var(--color-text);
}

/* Drag states (classes added by Sortable). */
.tab--ghost {
  opacity: 0.35;
}

.tab--chosen {
  box-shadow: var(--shadow-popover);
}

@media (prefers-reduced-motion: no-preference) {
  .tab {
    transition:
      background-color var(--duration-base) var(--ease-out),
      color var(--duration-base) var(--ease-out),
      border-color var(--duration-base) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }
  .tab--chosen {
    transform: scale(1.05);
  }
}
</style>
