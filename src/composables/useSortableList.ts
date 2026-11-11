import { onBeforeUnmount, onMounted, watch } from 'vue'
import Sortable from 'sortablejs'

export interface SortableListOptions extends Omit<
  Sortable.Options,
  'onStart' | 'onEnd' | 'disabled'
> {
  /** Turns dragging off while it returns true (e.g. while the list is filtered). */
  disabled?: () => boolean
  /** Called with the new order of `data-id`s after a drop that changed the order. */
  onReorder: (ids: string[]) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

/**
 * Drag-to-reorder for a list rendered by Vue. Children must carry `data-id`.
 * Sortable moves DOM nodes itself; on drop we put the dragged node back exactly where it was
 * and let Vue re-render from the new order, so the DOM never disagrees with Vue's virtual DOM.
 *
 * The node is restored next to its original sibling *node*, not by re-sorting the elements:
 * Vue keeps invisible anchor nodes around `v-for` and `<TransitionGroup>` children, and
 * moving the cards past those anchors makes Vue's next patch put cards in the wrong place.
 */
export function useSortableList(
  el: { readonly value: HTMLElement | null },
  options: SortableListOptions,
) {
  let sortable: Sortable | null = null
  let before: string[] = []
  let started = false
  let dragged: HTMLElement | null = null
  let nextSibling: Node | null = null

  onMounted(() => {
    if (!el.value) return
    const { onReorder, onDragStart, onDragEnd, disabled, ...rest } = options
    sortable = Sortable.create(el.value, {
      disabled: disabled?.() ?? false,
      animation: 180,
      draggable: '[data-id]',
      dataIdAttr: 'data-id',
      ...rest,
      onStart(evt) {
        started = true
        before = sortable!.toArray()
        dragged = evt.item
        nextSibling = evt.item.nextSibling
        onDragStart?.()
      },
      onEnd(evt) {
        if (!started) return
        started = false
        const after = sortable!.toArray()
        const parent = evt.from
        if (dragged && dragged.parentNode === parent) {
          // Fall back to appending only if the original neighbour is gone.
          parent.insertBefore(
            dragged,
            nextSibling && nextSibling.parentNode === parent ? nextSibling : null,
          )
        }
        dragged = nextSibling = null
        onDragEnd?.()
        if (after.join() !== before.join()) onReorder(after)
      },
    })
  })

  if (options.disabled) {
    watch(options.disabled, (off) => sortable?.option('disabled', off))
  }

  onBeforeUnmount(() => {
    sortable?.destroy()
    sortable = null
  })
}
