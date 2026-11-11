<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import ItemCard from './ItemCard.vue'
import ActionSheet, { type SheetAction } from './ActionSheet.vue'
import SetCountSheet from './editors/SetCountSheet.vue'
import { useItemsStore } from '@/stores/items'
import { useCollectionsStore } from '@/stores/collections'
import { useSettingsStore } from '@/stores/settings'
import { isReached } from '@/lib/clamp'
import { useSortableList } from '@/composables/useSortableList'
import { confirm } from '@/composables/useConfirm'
import { notify } from '@/composables/useToast'
import { formatCount } from '@/lib/format'
import type { Item } from '@/db/types'

const emit = defineEmits<{ edit: [item: Item] }>()

const store = useItemsStore()
const collections = useCollectionsStore()
const settings = useSettingsStore()
const list = useTemplateRef<HTMLElement>('list')

// ─── Hide done ──────────────────────────────────────────────────────────────
// An item that gets finished while done items are hidden stays a moment so its "done"
// moment plays, then leaves; vanishing at once would feel like a misclick.
const LINGER_MS = 1500

const done = (item: Item) => isReached(item.count, item.target)
const lingering = ref(new Set<string>())
const lingerTimers = new Map<string, ReturnType<typeof setTimeout>>()

function stopLingering() {
  lingerTimers.forEach(clearTimeout)
  lingerTimers.clear()
  lingering.value = new Set()
}

watch(
  () => store.items.filter(done).map((i) => i.id),
  (now, before) => {
    if (!settings.hideDone) return
    const was = new Set(before)
    for (const id of now) {
      if (was.has(id)) continue
      lingering.value = new Set(lingering.value).add(id)
      clearTimeout(lingerTimers.get(id))
      lingerTimers.set(
        id,
        setTimeout(() => {
          lingerTimers.delete(id)
          const next = new Set(lingering.value)
          next.delete(id)
          lingering.value = next
        }, LINGER_MS),
      )
    }
  },
)
watch(() => store.collectionId, stopLingering)
watch(() => settings.hideDone, stopLingering)
onBeforeUnmount(stopLingering)

const visibleItems = computed(() =>
  settings.hideDone
    ? store.items.filter((i) => !done(i) || lingering.value.has(i.id))
    : store.items,
)
const hiddenCount = computed(() => store.items.length - visibleItems.value.length)

// While a drag-and-drop reorder renders, skip the list's move animation: the card is
// already where it was dropped.
const suppressMove = ref(false)

useSortableList(list, {
  handle: '.drag-handle',
  forceFallback: true,
  fallbackTolerance: 3,
  ghostClass: 'card--ghost',
  chosenClass: 'card--chosen',
  // Dragging among a filtered list would have to guess where the hidden items go.
  disabled: () => settings.hideDone,
  onReorder: (ids) => {
    suppressMove.value = true
    store
      .reorder(ids)
      .catch((e) => console.error(e))
      .finally(() => requestAnimationFrame(() => (suppressMove.value = false)))
  },
})

// ─── Set count ──────────────────────────────────────────────────────────────
const countItem = ref<Item | null>(null)
const countOpen = ref(false)

function openCount(item: Item) {
  countItem.value = item
  countOpen.value = true
}

// ─── Card menu ──────────────────────────────────────────────────────────────
const menuItem = ref<Item | null>(null)
const menuOpen = ref(false)
const duplicateOpen = ref(false)

function openMenu(item: Item) {
  menuItem.value = item
  menuOpen.value = true
}

const menuActions = computed<SheetAction[]>(() => {
  const item = menuItem.value
  const index = item ? store.items.findIndex((i) => i.id === item.id) : -1
  return [
    { id: 'edit', label: 'Edit', icon: 'pencil' },
    {
      id: 'reset',
      label: `Reset to ${formatCount(item?.startCount ?? 0)}`,
      icon: 'reset',
      disabled: !item || item.count === item.startCount,
    },
    { id: 'duplicate', label: 'Duplicate to…', icon: 'copy' },
    // Like dragging, moving is off while done items are hidden.
    { id: 'up', label: 'Move up', icon: 'arrow-up', disabled: settings.hideDone || index <= 0 },
    {
      id: 'down',
      label: 'Move down',
      icon: 'arrow-down',
      disabled: settings.hideDone || index === -1 || index >= store.items.length - 1,
    },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ]
})

const duplicateActions = computed<SheetAction[]>(() =>
  collections.collections.map((c) => ({
    id: c.id,
    label: c.id === store.collectionId ? `${c.name} (this jar)` : c.name,
    swatch: c.color,
  })),
)

async function onMenuSelect(action: string) {
  const item = menuItem.value
  if (!item) return
  switch (action) {
    case 'edit':
      emit('edit', item)
      break
    case 'reset': {
      const ok = await confirm({
        title: `Reset “${item.name}”?`,
        message: `The count goes back to its start count, ${formatCount(item.startCount)}.`,
        confirmLabel: 'Reset',
      })
      if (ok) await store.reset(item.id)
      break
    }
    case 'duplicate':
      duplicateOpen.value = true
      break
    case 'up':
    case 'down': {
      const ids = store.items.map((i) => i.id)
      const from = ids.indexOf(item.id)
      const to = action === 'up' ? from - 1 : from + 1
      if (from === -1 || to < 0 || to >= ids.length) return
      ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
      await store.reorder(ids)
      break
    }
    case 'delete': {
      const ok = await confirm({
        title: `Delete “${item.name}”?`,
        message: 'Its count and thumbnail will be removed. This can’t be undone.',
        confirmLabel: 'Delete',
        danger: true,
      })
      if (ok) await store.remove(item.id)
      break
    }
  }
}

async function onDuplicate(collectionId: string) {
  const item = menuItem.value
  if (!item) return
  try {
    await store.duplicate(item.id, collectionId)
    const jar = collections.collections.find((c) => c.id === collectionId)
    notify(collectionId === store.collectionId ? 'Duplicated' : `Copied to ${jar?.name ?? 'jar'}`)
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Could not duplicate')
  }
}
</script>

<template>
  <div ref="list" class="list">
    <TransitionGroup name="card" :move-class="suppressMove ? 'card-no-move' : 'card-move'">
      <ItemCard
        v-for="item in visibleItems"
        :key="item.id"
        :data-id="item.id"
        :item="item"
        :reorderable="!settings.hideDone"
        @open-count="openCount"
        @open-menu="openMenu"
      />
    </TransitionGroup>
  </div>

  <p v-if="hiddenCount > 0" class="hidden-note" role="status">
    <template v-if="!visibleItems.length">All done! </template>
    {{ hiddenCount }} done {{ hiddenCount === 1 ? 'item' : 'items' }} hidden ·
    <button class="hidden-note__show" type="button" @click="settings.setHideDone(false)">
      Show
    </button>
  </p>

  <SetCountSheet v-model="countOpen" :item="countItem" />
  <ActionSheet
    v-model="menuOpen"
    :title="menuItem?.name ?? 'Item'"
    :actions="menuActions"
    @select="onMenuSelect"
  />
  <ActionSheet
    v-model="duplicateOpen"
    :title="`Duplicate “${menuItem?.name ?? ''}” to…`"
    :actions="duplicateActions"
    @select="onDuplicate"
  />
</template>

<style scoped>
.list {
  position: relative;
  display: grid;
  gap: var(--space-2);
}

.hidden-note {
  margin: var(--space-3) 0 0;
  text-align: center;
  color: var(--color-text-muted);
  font-weight: 700;
}

.hidden-note__show {
  min-height: 44px;
  padding: 0 var(--space-2);
  border: 0;
  background: none;
  color: var(--color-primary);
  font: inherit;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Drag states (classes added by Sortable on the card root). */
.list :deep(.card--ghost) {
  opacity: 0.35;
}

.list :deep(.card--chosen) {
  box-shadow: var(--shadow-popover);
}

@media (prefers-reduced-motion: no-preference) {
  .card-move {
    transition: transform var(--duration-base) var(--ease-out);
  }
  .card-enter-active,
  .card-leave-active {
    transition:
      opacity var(--duration-base) var(--ease-out),
      transform var(--duration-base) var(--ease-out);
  }
  .card-enter-from,
  .card-leave-to {
    opacity: 0;
    transform: scale(0.97);
  }
  .card-leave-active {
    position: absolute;
    left: 0;
    right: 0;
  }
}
</style>
