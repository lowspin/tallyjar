import { reactive } from 'vue'

export interface Toast {
  id: number
  message: string
}

export const toasts = reactive<Toast[]>([])
let nextId = 1

/** Shows a short, self-dismissing message. */
export function notify(message: string, durationMs = 3000) {
  const id = nextId++
  toasts.push({ id, message })
  setTimeout(() => dismiss(id), durationMs)
}

export function dismiss(id: number) {
  const index = toasts.findIndex((t) => t.id === id)
  if (index !== -1) toasts.splice(index, 1)
}
