import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Small "are you sure?" popup for destructive actions. Red Confirm / grey
// Cancel; on a keyboard, Enter confirms and Esc cancels. Sits above any open
// modal (e.g. the goal editor), and its keys never reach the page beneath.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  // Latest handlers, so the key listener doesn't re-subscribe every render.
  const handlers = useRef({ onConfirm, onCancel })
  handlers.current = { onConfirm, onCancel }

  useEffect(() => {
    if (!open) return
    // Drop focus from the field/button that opened us so Enter isn't typed
    // into it or used to re-press it.
    document.activeElement?.blur?.()
    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Enter') handlers.current.onConfirm()
      else handlers.current.onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {message && <p className="mt-2 text-sm text-gray-400">{message}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-white/10 px-5 py-3 text-base font-semibold text-gray-200 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-loss px-5 py-3 text-base font-semibold text-white active:scale-[0.97]"
          >
            {confirmLabel}
          </button>
        </div>
        <p className="mt-4 text-right text-xs text-gray-600">Enter to confirm · Esc to cancel</p>
      </div>
    </div>,
    document.body,
  )
}
