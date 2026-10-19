import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NoteIcon } from './Icons.jsx'

const HOLD_MS = 400

// Small note icon that reveals a goal's note in a floating popup over the page.
// Mouse: hover to show. Touch: press and hold to show; it stays up until the
// next tap anywhere. Clicks on the icon never reach the surrounding row (which
// opens the editor), so it's safe to nest inside a tappable title.
export default function NoteHint({ note, className = '' }) {
  const ref = useRef(null)
  const timer = useRef(null)
  const [pos, setPos] = useState(null) // { left, top, below } when open

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(320, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12))
    // Prefer above the icon; flip below when there's no room near the top.
    const below = r.top < 160
    setPos({ left, width, top: below ? r.bottom + 8 : r.top - 8, below })
  }
  const hide = () => setPos(null)
  const clearHold = () => {
    clearTimeout(timer.current)
    timer.current = null
  }

  // A touch-opened popup closes on the next tap anywhere (or on scroll).
  useEffect(() => {
    if (!pos) return
    const close = () => hide()
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', close)
      window.addEventListener('scroll', close, true)
    })
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [pos])
  useEffect(() => clearHold, [])

  if (!note) return null
  const stop = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }

  return (
    <>
      <span
        ref={ref}
        role="img"
        aria-label={`Note: ${note}`}
        className={`-my-1 inline-flex select-none items-center p-1 align-middle text-gray-400 ${className}`}
        style={{ WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (e.pointerType === 'mouse') return
          clearHold()
          timer.current = setTimeout(show, HOLD_MS)
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onClick={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <NoteIcon className="h-3.5 w-3.5" />
      </span>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[60] whitespace-pre-wrap break-words rounded-xl border border-border bg-surface px-4 py-3 text-sm text-gray-200 shadow-glow"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              transform: pos.below ? undefined : 'translateY(-100%)',
              maxHeight: '60vh',
              overflow: 'hidden',
            }}
          >
            {note}
          </div>,
          document.body,
        )}
    </>
  )
}

// Multi-line text box with a grip in the lower-right corner: drag it to make
// the box taller or shorter (works with mouse and touch, unlike the native
// resize handle).
export function ResizableTextarea({ className = '', minHeight = 56, ...props }) {
  const [height, setHeight] = useState(96)
  const drag = useRef(null)

  const onPointerDown = (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, h: height }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const max = window.innerHeight * 0.6
    setHeight(Math.max(minHeight, Math.min(max, drag.current.h + e.clientY - drag.current.y)))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <div className="relative">
      <textarea {...props} className={`${className} block resize-none pr-8`} style={{ height }} />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
        className="absolute bottom-0 right-0 flex h-8 w-8 cursor-ns-resize items-end justify-end p-1.5 text-gray-500 active:text-gray-200"
      >
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M11 3L3 11M11 7L7 11" />
        </svg>
      </div>
    </div>
  )
}
