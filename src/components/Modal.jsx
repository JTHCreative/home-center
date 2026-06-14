import { CloseIcon } from './Icons.jsx'

// Modal sheet for add/edit forms. Tap the backdrop or X to dismiss.
// Header and footer are pinned; only the body scrolls (with a fat, grabbable
// scrollbar), and the body uses the full space above the on-screen keyboard.
export default function Modal({ open, onClose, title, children, footer, size = 'wide' }) {
  if (!open) return null
  const maxWidth = size === 'narrow' ? 'max-w-lg' : 'max-w-3xl'
  return (
    <div
      // Top-aligned so the on-screen keyboard at the bottom doesn't cover fields.
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6 pt-[3vh]"
      onClick={onClose}
    >
      <div
        // Shrink to the space above the keyboard; the body (not the buttons) scrolls.
        className={`flex w-full ${maxWidth} flex-col rounded-2xl border border-border bg-surface shadow-glow`}
        style={{ maxHeight: 'calc(97vh - var(--kb, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-400 active:scale-95 active:bg-white/5"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="scroll-fat flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="flex flex-shrink-0 justify-end gap-3 border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Shared form control styles reused by the page forms.
export const fieldClass =
  'w-full rounded-xl border border-border bg-bg px-4 py-3 text-base text-white outline-none focus:border-accent focus:shadow-glow'

export function Button({ variant = 'primary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-accent text-bg shadow-glow',
    ghost: 'bg-white/5 text-gray-200',
    danger: 'bg-loss/15 text-loss',
  }
  return (
    <button
      type="button"
      className={[
        'rounded-xl px-5 py-3 text-base font-semibold transition-transform active:scale-[0.97]',
        styles[variant],
        className,
      ].join(' ')}
      {...rest}
    />
  )
}
