import { onBeforeUnmount, onMounted } from 'vue'
import Sortable from 'sortablejs'

export interface SortableListOptions extends Omit<Sortable.Options, 'onStart' | 'onEnd'> {
  /** Called with the new order of `data-id`s after a drop that changed the order. */
  onReorder: (ids: string[]) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

/**
 * Drag-to-reorder for a list rendered by Vue. Children must carry `data-id`.
 * Sortable moves DOM nodes itself; on drop we put them back and let Vue re-render from the
 * new order, so the DOM never disagrees with Vue's virtual DOM.
 */
export function useSortableList(
  el: { readonly value: HTMLElement | null },
  options: SortableListOptions,
) {
  let sortable: Sortable | null = null
  let before: string[] = []
  let started = false

  onMounted(() => {
    if (!el.value) return
    const { onReorder, onDragStart, onDragEnd, ...rest } = options
    sortable = Sortable.create(el.value, {
      animation: 180,
      draggable: '[data-id]',
      dataIdAttr: 'data-id',
      ...rest,
      onStart() {
        started = true
        before = sortable!.toArray()
        onDragStart?.()
      },
      onEnd() {
        if (!started) return
        started = false
        const after = sortable!.toArray()
        sortable!.sort(before, false)
        onDragEnd?.()
        if (after.join() !== before.join()) onReorder(after)
      },
    })
  })

  onBeforeUnmount(() => {
    sortable?.destroy()
    sortable = null
  })
}
