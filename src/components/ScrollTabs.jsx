import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, PlusIcon } from './Icons.jsx'

// Fixed-width, swipeable tab bar. Shows `visible` tabs at a time; the rest
// scroll. Drag with finger (native) or mouse (manual), or tap the large arrows.
// Gradient masks at each edge fade tabs in/out toward the arrows. Empty slots
// (when there are fewer than `visible` tabs) show a "+" that calls `onAdd`.
const TAB_W = 150 // px per tab

export default function ScrollTabs({ tabs, active, onChange, onAdd, visible = 7 }) {
  const viewportRef = useRef(null)
  const drag = useRef(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const barWidth = visible * TAB_W // fixed width, always sized for `visible` tabs

  const updateEdges = () => {
    const el = viewportRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    updateEdges()
    el.addEventListener('scroll', updateEdges, { passive: true })
    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateEdges)
      ro.disconnect()
    }
  }, [tabs.length])

  // Keep the active tab in view.
  useEffect(() => {
    const id = setTimeout(() => {
      viewportRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }, 0)
    return () => clearTimeout(id)
  }, [active])

  const page = (dir) => {
    const el = viewportRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' })
  }

  // Mouse drag-to-scroll (touch uses native scrolling). No pointer capture —
  // capturing the pointer would steal the click from the tab buttons.
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return
    drag.current = { x: e.clientX, scroll: viewportRef.current.scrollLeft, moved: false }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    if (Math.abs(dx) > 4) drag.current.moved = true
    viewportRef.current.scrollLeft = drag.current.scroll - dx
  }
  const endDrag = () => {
    // If a real drag happened, defer clearing so the trailing click is ignored.
    if (drag.current?.moved) setTimeout(() => (drag.current = null), 0)
    else drag.current = null
  }

  const Arrow = ({ dir, disabled, children, label }) => (
    <button
      type="button"
      onClick={() => page(dir)}
      disabled={disabled}
      aria-label={label}
      className={[
        'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/5 text-gray-200 transition-opacity active:scale-95',
        disabled ? 'opacity-25' : '',
      ].join(' ')}
    >
      {children}
    </button>
  )

  return (
    <div className="flex items-center gap-2">
      <Arrow dir={-1} disabled={atStart} label="Scroll left">
        <ChevronLeft className="h-7 w-7" />
      </Arrow>

      <div className="relative flex-shrink-0" style={{ width: barWidth }}>
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="no-scrollbar flex cursor-grab overflow-x-auto active:cursor-grabbing"
        >
          {tabs.map((t) => {
            const isActive = t.id === active
            return (
              <div key={t.id} className="flex-none p-0.5" style={{ width: TAB_W }}>
                <button
                  type="button"
                  data-active={isActive}
                  onClick={() => {
                    if (drag.current?.moved) return // ignore click that ends a drag
                    onChange(t.id)
                  }}
                  className={[
                    'w-full truncate rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors active:scale-[0.97]',
                    isActive ? 'bg-accent/15 text-accent shadow-glow' : 'text-gray-400',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              </div>
            )
          })}

          {/* Empty slots: each is a "+" that adds a new watchlist. */}
          {onAdd &&
            Array.from({ length: Math.max(0, visible - tabs.length) }, (_, i) => (
              <div key={`empty-${i}`} className="flex-none p-0.5" style={{ width: TAB_W }}>
                <button
                  type="button"
                  onClick={() => {
                    if (drag.current?.moved) return
                    onAdd()
                  }}
                  aria-label="New watchlist"
                  className="flex w-full items-center justify-center rounded-xl border border-dashed border-border py-2.5 text-gray-600 active:scale-[0.97] active:text-accent"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
        </div>

        {/* Edge fades — tabs appear to dissolve toward the arrows. */}
        <div
          className={[
            'pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent transition-opacity',
            atStart ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
        />
        <div
          className={[
            'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent transition-opacity',
            atEnd ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
        />
      </div>

      <Arrow dir={1} disabled={atEnd} label="Scroll right">
        <ChevronRight className="h-7 w-7" />
      </Arrow>
    </div>
  )
}
