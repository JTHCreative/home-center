import { useLayoutEffect, useRef, useState } from 'react'
import { ClockIcon } from './Icons.jsx'
import { fieldClass } from './Modal.jsx'
import { useDragScroll } from '../lib/useDragScroll.js'

// Themed, touch- and mouse-friendly replacement for <input type="time">. The
// native picker can't be styled to match the kiosk theme and only scrolls with a
// wheel/trackpad; this one is a tap target that opens themed hour/minute/AM-PM
// columns you can flick (touch) or click-and-drag (mouse) to scroll.
// Value/onChange use a 24-hour 'HH:MM' string, same as the native input.

const pad = (n) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

function parse(value) {
  const [h, m] = (value || '').split(':').map((n) => parseInt(n, 10))
  const hh = Number.isFinite(h) ? h : 9
  const mm = Number.isFinite(m) ? m : 0
  return { h12: hh % 12 || 12, m: mm, ap: hh >= 12 ? 'PM' : 'AM' }
}
const compose = (h12, m, ap) => `${pad((h12 % 12) + (ap === 'PM' ? 12 : 0))}:${pad(m)}`
const format12 = (value) => {
  const { h12, m, ap } = parse(value)
  return `${h12}:${pad(m)} ${ap}`
}

// One scrollable wheel column. The generous top/bottom padding lets the first
// and last items reach the vertical centre, like a physical wheel picker.
function WheelColumn({ items, selected, onPick }) {
  const { ref, handlers } = useDragScroll()
  const centered = useRef(false)
  // Centre the selected value when the column first appears (without scrolling
  // the surrounding modal, so we set scrollTop directly rather than scrollIntoView).
  useLayoutEffect(() => {
    const el = ref.current
    if (centered.current || !el) return
    const sel = el.querySelector('[data-selected="true"]')
    if (sel) el.scrollTop = sel.offsetTop - el.clientHeight / 2 + sel.clientHeight / 2
    centered.current = true
  })
  return (
    <div
      ref={ref}
      {...handlers}
      className="no-scrollbar h-48 flex-1 cursor-grab touch-pan-y overflow-y-auto overscroll-contain py-[4.5rem] active:cursor-grabbing"
    >
      {items.map((it) => {
        const isSel = it === selected
        return (
          <button
            key={it}
            type="button"
            data-selected={isSel}
            onClick={() => onPick(it)}
            className={[
              'flex h-10 w-full items-center justify-center rounded-lg font-mono text-base active:scale-95',
              isSel ? 'bg-accent font-bold text-bg shadow-glow' : 'text-gray-200',
            ].join(' ')}
          >
            {pad(it)}
          </button>
        )
      })}
    </div>
  )
}

export default function TimePicker({ value, onChange, ariaLabel = 'Time' }) {
  const [open, setOpen] = useState(false)
  const { h12, m, ap } = parse(value)

  return (
    <div className="relative w-full">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${fieldClass} flex items-center justify-between gap-2 px-3 text-left`}
      >
        <span className="whitespace-nowrap">{format12(value)}</span>
        <ClockIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
      </button>

      {open && (
        <>
          {/* Tap-away backdrop. */}
          <button
            type="button"
            aria-label="Close time picker"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-2 flex w-full min-w-[15rem] gap-1 rounded-2xl border border-border bg-surface p-2 shadow-glow">
            <WheelColumn items={HOURS} selected={h12} onPick={(x) => onChange(compose(x, m, ap))} />
            <WheelColumn items={MINUTES} selected={m} onPick={(x) => onChange(compose(h12, x, ap))} />
            {/* AM/PM is just two choices — no scrolling needed. */}
            <div className="flex h-48 w-16 flex-col justify-center gap-1">
              {['AM', 'PM'].map((v) => {
                const isSel = v === ap
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange(compose(h12, m, v))}
                    className={[
                      'flex h-12 w-full items-center justify-center rounded-lg font-mono text-base active:scale-95',
                      isSel ? 'bg-accent font-bold text-bg shadow-glow' : 'text-gray-200',
                    ].join(' ')}
                  >
                    {v}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
