import { useState } from 'react'
import { ChevronLeft, ChevronRight } from './Icons.jsx'

// Touch-friendly calendar date picker. Value/onChange use 'YYYY-MM-DD' strings.
// Weeks start Sunday, to match the Calendar and Meals pages.
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const pad = (n) => String(n).padStart(2, '0')
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default function DatePicker({ value, onChange, onClear }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = isoOf(today)

  // The month being shown; starts on the selected date's month, else today's.
  const [cursor, setCursor] = useState(() => {
    const base = value ? new Date(`${value}T00:00`) : today
    const d = Number.isNaN(base.getTime()) ? today : base
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const stepMonth = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))

  // 6-week grid starting on the Sunday on/before the 1st of the month.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = new Date(first)
  gridStart.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
          className="rounded-xl bg-white/5 p-2.5 text-gray-300 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-base font-bold text-white">
          {cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}
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
          return (
            <button
              key={dISO}
              type="button"
              onClick={() => onChange(dISO)}
              className={[
                'flex h-11 items-center justify-center rounded-lg text-sm active:scale-95',
                isSelected
                  ? 'bg-accent font-bold text-bg shadow-glow'
                  : inMonth
                    ? 'font-medium text-gray-100'
                    : 'text-gray-600',
                !isSelected && isToday ? 'ring-1 ring-accent/60' : '',
              ].join(' ')}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange(todayISO)}
          className="rounded-lg bg-white/5 px-4 py-2 text-sm font-semibold text-gray-300 active:scale-95"
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
