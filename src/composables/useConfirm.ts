import { reactive } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'OK',
  cancelLabel: 'Cancel',
  danger: false,
})

let resolver: ((value: boolean) => void) | null = null

/** Opens the app-wide confirmation sheet and resolves with the user's answer. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  resolver?.(false)
  Object.assign(confirmState, {
    message: '',
    confirmLabel: 'OK',
    cancelLabel: 'Cancel',
    danger: false,
    ...options,
    open: true,
  })
  return new Promise((resolve) => (resolver = resolve))
}

/** Called by ConfirmDialog when the user answers or dismisses it. */
export function settleConfirm(value: boolean) {
  confirmState.open = false
  resolver?.(value)
  resolver = null
}
