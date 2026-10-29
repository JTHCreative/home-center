import { useRef, useState } from 'react'
import { CloseIcon } from './Icons.jsx'

// Saved sizes for resizable modals, per `resizeKey` (this device only).
const loadSize = (key) => {
  try {
    return JSON.parse(localStorage.getItem(`home-center:modal-size:${key}`)) || null
  } catch {
    return null
  }
}
const saveSize = (key, size) => {
  try {
    localStorage.setItem(`home-center:modal-size:${key}`, JSON.stringify(size))
  } catch {
    // Storage unavailable — the size just won't be remembered.
  }
}

// Modal sheet for add/edit forms. Tap the backdrop or X to dismiss.
// Header and footer are pinned; only the body scrolls (with a fat, grabbable
// scrollbar), and the body uses the full space above the on-screen keyboard.
// With `resizeKey`, a grip in the lower-right corner drags the sheet larger
// (never smaller than its normal size); the size is remembered under that key.
export default function Modal({ open, ...props }) {
  if (!open) return null
  return <ModalSheet {...props} />
}

function ModalSheet({ onClose, title, children, footer, headerExtra, size = 'wide', resizeKey }) {
  const sheet = useRef(null)
  const drag = useRef(null)
  const [dims, setDims] = useState(() => (resizeKey ? loadSize(resizeKey) : null)) // { w, h } | null

  // Corner drag. The normal (un-resized) size is the minimum. The sheet is
  // centered, so it widens on both sides: width moves at twice the pointer.
  const onGripDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const el = sheet.current
    const prev = el.style.cssText
    // Measure the normal size by briefly dropping any custom size.
    el.style.width = ''
    el.style.height = ''
    el.style.maxWidth = ''
    const min = { w: el.offsetWidth, h: el.offsetHeight }
    el.style.cssText = prev
    drag.current = { x: e.clientX, y: e.clientY, w: el.offsetWidth, h: el.offsetHeight, min }
  }
  const onGripMove = (e) => {
    const d = drag.current
    if (!d) return
    const maxW = window.innerWidth - 32
    const maxH = sheet.current.parentElement.clientHeight - 16
    setDims({
      w: Math.round(Math.max(d.min.w, Math.min(maxW, d.w + (e.clientX - d.x) * 2))),
      h: Math.round(Math.max(d.min.h, Math.min(maxH, d.h + e.clientY - d.y))),
    })
  }
  const onGripUp = () => {
    if (drag.current && dims) saveSize(resizeKey, dims)
    drag.current = null
  }

  // 'full' fills (nearly) the whole screen — used for the Goals list view.
  const maxWidth = size === 'narrow' ? 'max-w-lg' : size === 'full' ? 'max-w-none' : 'max-w-3xl'
  return (
    <div
      // Top-aligned so the on-screen keyboard at the bottom doesn't cover fields.
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-6 pt-[3vh]"
      onClick={onClose}
    >
      <div
        ref={sheet}
        // Shrink to the space above the keyboard; the body (not the buttons) scrolls.
        className={`relative flex w-full ${maxWidth} ${size === 'full' ? 'h-full' : ''} flex-col rounded-2xl border border-border bg-surface shadow-glow`}
        style={{
          maxHeight: 'calc(97vh - var(--kb, 0px))',
          ...(dims ? { width: `min(${dims.w}px, 100%)`, maxWidth: 'none', height: dims.h } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <div className="flex items-center gap-1">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 text-gray-400 active:scale-95 active:bg-white/5"
            >
              <CloseIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
        <div className="scroll-fat flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="flex flex-shrink-0 justify-end gap-3 border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
        {resizeKey && (
          <div
            role="separator"
            aria-label="Resize window"
            title="Drag to resize"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            onDoubleClick={() => {
              setDims(null)
              saveSize(resizeKey, null)
            }}
            style={{ touchAction: 'none' }}
            className="absolute bottom-0 right-0 hidden h-7 w-7 cursor-nwse-resize items-end justify-end rounded-br-2xl p-1.5 text-gray-500 hover:text-gray-200 active:text-white md:flex"
          >
            <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M11 3L3 11M11 7L7 11" />
            </svg>
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
