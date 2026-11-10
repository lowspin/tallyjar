<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import ItemCard from './ItemCard.vue'
import ActionSheet, { type SheetAction } from './ActionSheet.vue'
import SetCountSheet from './editors/SetCountSheet.vue'
import { useItemsStore } from '@/stores/items'
import { useCollectionsStore } from '@/stores/collections'
import { useSortableList } from '@/composables/useSortableList'
import { confirm } from '@/composables/useConfirm'
import { notify } from '@/composables/useToast'
import { formatCount } from '@/lib/format'
import type { Item } from '@/db/types'

const emit = defineEmits<{ edit: [item: Item] }>()

const store = useItemsStore()
const collections = useCollectionsStore()
const list = useTemplateRef<HTMLElement>('list')

// While a drag-and-drop reorder renders, skip the list's move animation: the card is
// already where it was dropped.
const suppressMove = ref(false)

useSortableList(list, {
  handle: '.drag-handle',
  forceFallback: true,
  fallbackTolerance: 3,
  ghostClass: 'card--ghost',
  chosenClass: 'card--chosen',
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
    { id: 'up', label: 'Move up', icon: 'arrow-up', disabled: index <= 0 },
    {
      id: 'down',
      label: 'Move down',
      icon: 'arrow-down',
      disabled: index === -1 || index >= store.items.length - 1,
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
        v-for="item in store.items"
        :key="item.id"
        :data-id="item.id"
        :item="item"
        @open-count="openCount"
        @open-menu="openMenu"
      />
    </TransitionGroup>
  </div>

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
