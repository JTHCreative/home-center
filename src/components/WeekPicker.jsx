import { useState } from 'react'
import Modal, { Button } from './Modal.jsx'
import { ChevronLeft, ChevronRight } from './Icons.jsx'
import { addDays, isoDate, parseLocalDate, sundayOf, weekLabels } from '../lib/dates.js'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Month calendar for picking a whole week (weeks start Sunday). Tap any day to
// select its week, then confirm. The week the item is already in (`fromWeek`)
// is marked and can't be picked.
export default function WeekPicker({ open, title, fromWeek, confirmLabel = 'Move', onPick, onClose }) {
  if (!open) return null
  return (
    <WeekPickerBody
      title={title}
      fromWeek={fromWeek}
      confirmLabel={confirmLabel}
      onPick={onPick}
      onClose={onClose}
    />
  )
}

function WeekPickerBody({ title, fromWeek, confirmLabel, onPick, onClose }) {
  const start = parseLocalDate(fromWeek)
  const [month, setMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1))
  const [selected, setSelected] = useState(null) // week key

  const todayKey = isoDate(new Date())
  const thisWeek = isoDate(sundayOf(new Date()))
  // Week rows covering the month, Sunday to Saturday.
  const rows = []
  for (let d = sundayOf(month); d.getMonth() === month.getMonth() || d < month; d = addDays(d, 7)) {
    rows.push(d)
  }
  const shiftMonth = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const label = selected ? weekLabels(parseLocalDate(selected)) : null

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="narrow"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => selected && onPick(selected)} disabled={!selected} className={selected ? '' : 'opacity-40'}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded-xl bg-white/5 p-2.5 text-gray-300 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-lg font-bold text-white">
          {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded-xl bg-white/5 p-2.5 text-gray-300 active:scale-95"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-gray-500">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((sun) => {
          const key = isoDate(sun)
          const isFrom = key === fromWeek
          const isSel = key === selected
          return (
            <button
              key={key}
              type="button"
              disabled={isFrom}
              onClick={() => setSelected(key)}
              aria-label={`Week of ${weekLabels(sun).range}${isFrom ? ' (current)' : ''}`}
              aria-pressed={isSel}
              className={[
                'relative grid w-full grid-cols-7 rounded-xl py-2 text-center text-sm',
                isSel
                  ? 'bg-accent/20 text-white ring-2 ring-accent'
                  : isFrom
                    ? 'cursor-not-allowed bg-white/5 text-gray-500'
                    : key === thisWeek
                      ? 'bg-white/5 text-gray-200 active:bg-white/10'
                      : 'text-gray-200 hover:bg-white/5 active:bg-white/10',
              ].join(' ')}
            >
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(sun, i)
                const out = d.getMonth() !== month.getMonth()
                return (
                  <span
                    key={i}
                    className={[
                      'mx-auto flex h-8 w-8 items-center justify-center rounded-full',
                      out ? 'opacity-40' : '',
                      isoDate(d) === todayKey ? 'border border-accent font-bold' : '',
                    ].join(' ')}
                  >
                    {d.getDate()}
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>

      <div className="mt-4 min-h-[2.5rem] text-center text-sm">
        {label ? (
          <>
            <div className="font-semibold text-white">{label.range}</div>
            <div className="text-xs text-gray-500">{label.rel}</div>
          </>
        ) : (
          <div className="text-gray-500">Tap a week · grey row is where it is now</div>
        )}
      </div>
    </Modal>
  )
}
