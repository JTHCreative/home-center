import { useState } from 'react'
import { CalendarIcon } from './Icons.jsx'
import { fieldClass } from './Modal.jsx'
import DatePicker from './DatePicker.jsx'

// Themed replacement for <input type="date">: a field-styled tap target with a
// calendar icon that opens the themed DatePicker in a popover (month/year
// dropdowns included). Value/onChange use 'YYYY-MM-DD', like the native input.
const formatDate = (value) => {
  if (!value) return 'Select date'
  const d = new Date(`${value}T00:00`)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function DateField({ value, onChange, min, ariaLabel = 'Date' }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative w-full">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${fieldClass} flex items-center justify-between gap-2 px-3 text-left`}
      >
        <span className="truncate whitespace-nowrap">{formatDate(value)}</span>
        <CalendarIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
      </button>

      {open && (
        <>
          {/* Tap-away backdrop. */}
          <button
            type="button"
            aria-label="Close date picker"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3 shadow-glow">
            <DatePicker
              value={value}
              min={min}
              onChange={(v) => {
                onChange(v)
                setOpen(false)
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
