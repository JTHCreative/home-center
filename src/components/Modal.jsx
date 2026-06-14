import { CloseIcon } from './Icons.jsx'

// Centered modal sheet for add/edit forms. Tap the backdrop or X to dismiss.
export default function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="scroll-area max-h-[85vh] w-full max-w-lg rounded-2xl border border-border bg-surface shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
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
        <div className="p-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
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
