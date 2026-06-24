import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from './Icons.jsx'
import { useDragScroll } from '../lib/useDragScroll.js'
import { parseLocalDate } from '../lib/dates.js'

// Touch-friendly calendar date picker. Value/onChange use 'YYYY-MM-DD' strings.
// Weeks start Sunday, to match the Calendar and Meals pages. The month and year
// in the header are tappable dropdowns (month grid / scrollable year list) for
// fast jumps, in addition to the prev/next arrows for stepping one month.
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// A generous, scrollable range centered on the current year.
const NOW_Y = new Date().getFullYear()
const YEARS = Array.from({ length: 121 }, (_, i) => NOW_Y - 80 + i)

// Scrollable, drag-pannable year grid; centers the selected year when shown.
function YearGrid({ selectedYear, onPick }) {
  const { ref, handlers } = useDragScroll()
  const centered = useRef(false)
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
      className="no-scrollbar h-64 cursor-grab touch-pan-y overflow-y-auto overscroll-contain py-1 active:cursor-grabbing"
    >
      <div className="grid grid-cols-4 gap-1">
        {YEARS.map((y) => {
          const sel = y === selectedYear
          return (
            <button
              key={y}
              type="button"
              data-selected={sel}
              onClick={() => onPick(y)}
              className={[
                'flex h-11 items-center justify-center rounded-lg font-mono text-sm active:scale-95',
                sel ? 'bg-accent font-bold text-bg shadow-glow' : 'font-medium text-gray-100 hover:bg-white/5',
              ].join(' ')}
            >
              {y}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DatePicker({ value, onChange, onClear, min }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = isoOf(today)

  // The month being shown; starts on the selected date's month, else today's.
  const [cursor, setCursor] = useState(() => {
    const base = value ? parseLocalDate(value) : today
    const d = Number.isNaN(base.getTime()) ? today : base
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  // Which header dropdown is open (replaces the day grid while picking).
  const [picking, setPicking] = useState(null) // null | 'month' | 'year'

  const stepMonth = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  const pickMonth = (m) => {
    setCursor((c) => new Date(c.getFullYear(), m, 1))
    setPicking(null)
  }
  const pickYear = (y) => {
    setCursor((c) => new Date(y, c.getMonth(), 1))
    setPicking(null)
  }
  const toggle = (which) => setPicking((p) => (p === which ? null : which))

  // 6-week grid starting on the Sunday on/before the 1st of the month.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = new Date(first)
  gridStart.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })

  const headerBtn = (active) =>
    [
      'flex items-center gap-1 rounded-lg px-3 py-1.5 text-base font-bold active:scale-95',
      active ? 'bg-accent/15 text-accent' : 'text-white hover:bg-white/5',
    ].join(' ')

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
          className="rounded-xl bg-white/5 p-2.5 text-gray-300 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1">
          <button type="button" onClick={() => toggle('month')} className={headerBtn(picking === 'month')}>
            {MONTHS[cursor.getMonth()]}
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => toggle('year')} className={headerBtn(picking === 'year')}>
            {cursor.getFullYear()}
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => stepMonth(1)}
          aria-label="Next month"
          className="rounded-xl bg-white/5 p-2.5 text-gray-300 active:scale-95"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {picking === 'month' ? (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS_SHORT.map((m, i) => {
            const sel = i === cursor.getMonth()
            return (
              <button
                key={m}
                type="button"
                onClick={() => pickMonth(i)}
                className={[
                  'flex h-12 items-center justify-center rounded-lg text-sm active:scale-95',
                  sel ? 'bg-accent font-bold text-bg shadow-glow' : 'font-medium text-gray-100 hover:bg-white/5',
                ].join(' ')}
              >
                {m}
              </button>
            )
          })}
        </div>
      ) : picking === 'year' ? (
        <YearGrid selectedYear={cursor.getFullYear()} onPick={pickYear} />
      ) : (
        <>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const dISO = isoOf(d)
              const inMonth = d.getMonth() === cursor.getMonth()
              const isSelected = value && dISO === value
              const isToday = dISO === todayISO
              const disabled = !!min && dISO < min
              return (
                <button
                  key={dISO}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(dISO)}
                  className={[
                    'flex h-11 items-center justify-center rounded-lg text-sm active:scale-95',
                    isSelected
                      ? 'bg-accent font-bold text-bg shadow-glow'
                      : inMonth
                        ? 'font-medium text-gray-100'
                        : 'text-gray-600',
                    !isSelected && isToday ? 'ring-1 ring-accent/60' : '',
                    disabled ? 'cursor-not-allowed opacity-30' : '',
                  ].join(' ')}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!!min && todayISO < min}
          onClick={() => {
            setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
            setPicking(null)
            onChange(todayISO)
          }}
          className="rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-gray-300 active:scale-95 disabled:opacity-30"
        >
          Today
        </button>
        {onClear && value && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-gray-400 active:scale-95"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
