import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NoteIcon } from './Icons.jsx'

const HOLD_MS = 400

// Wraps an element so `tip` (when set) shows in a floating popup over the page.
// Mouse: hover to show. Touch: press and hold to show; it stays up until the
// next tap anywhere, and the hold doesn't count as a tap on the wrapped
// element. `blockClick` keeps every click from reaching the wrapped element or
// the row around it (for icons nested inside a tappable title).
export function HoverTip({ tip, children, label, className = '', blockClick = false }) {
  const ref = useRef(null)
  const popRef = useRef(null)
  const timer = useRef(null)
  const heldOpen = useRef(false)
  const [pos, setPos] = useState(null) // { center, top, below } when open

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || !tip) return
    // Prefer above the anchor; flip below when there's no room near the top.
    const below = r.top < 160
    setPos({ center: r.left + r.width / 2, top: below ? r.bottom + 8 : r.top - 8, below })
  }
  const hide = () => setPos(null)
  const clearHold = () => {
    clearTimeout(timer.current)
    timer.current = null
  }

  // Keep the popup on screen: center it on the anchor, clamped to the edges.
  useLayoutEffect(() => {
    const el = popRef.current
    if (!pos || !el) return
    const w = el.offsetWidth
    el.style.left = `${Math.max(12, Math.min(pos.center - w / 2, window.innerWidth - w - 12))}px`
  }, [pos])

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
  useEffect(() => {
    if (!tip) setPos(null)
  }, [tip])

  return (
    <>
      <span
        ref={ref}
        aria-label={label}
        className={`inline-flex select-none items-center ${className}`}
        style={{ WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
        onPointerDown={(e) => {
          if (blockClick) e.stopPropagation()
          heldOpen.current = false
          if (!tip || e.pointerType === 'mouse') return
          clearHold()
          timer.current = setTimeout(() => {
            heldOpen.current = true
            show()
          }, HOLD_MS)
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onClickCapture={(e) => {
          if (blockClick || heldOpen.current) {
            e.stopPropagation()
            e.preventDefault()
          }
          heldOpen.current = false
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </span>
      {pos &&
        tip &&
        createPortal(
          <div
            ref={popRef}
            role="tooltip"
            className="pointer-events-none fixed z-[60] whitespace-pre-wrap break-words rounded-xl border border-border bg-surface px-4 py-3 text-sm text-gray-200 shadow-glow"
            style={{
              left: pos.center,
              top: pos.top,
              width: 'max-content',
              maxWidth: 'min(320px, calc(100vw - 24px))',
              transform: pos.below ? undefined : 'translateY(-100%)',
              maxHeight: '60vh',
              overflow: 'hidden',
            }}
          >
            {tip}
          </div>,
          document.body,
        )}
    </>
  )
}

// Small note icon that reveals a goal's note in a popup (hover, or press and
// hold on touch). Safe to nest inside a tappable title: clicks never reach it.
export default function NoteHint({ note, className = '' }) {
  if (!note) return null
  return (
    <HoverTip
      tip={note}
      label={`Note: ${note}`}
      blockClick
      className={`-my-1 p-1 align-middle text-gray-400 ${className}`}
    >
      <NoteIcon className="h-3.5 w-3.5" />
    </HoverTip>
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
