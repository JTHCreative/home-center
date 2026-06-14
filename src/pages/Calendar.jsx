import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Card.jsx'
import Tabs from '../components/Tabs.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import { useLocalState } from '../lib/storage.js'
import { ChevronLeft, ChevronRight, TrashIcon } from '../components/Icons.jsx'

const VIEWS = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
]

// Category → accent color (hex + tailwind-ish bg via inline style for flexibility).
const CATEGORIES = {
  Work: '#58A6FF',
  Personal: '#39D353',
  Health: '#F85149',
  Family: '#BC8CFF',
  Other: '#8B949E',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

// --- Date helpers (local, no library) ----------------------------------------
const iso = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const addDays = (d, n) => {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}
const startOfWeek = (d) => addDays(d, -d.getDay())
const sameDay = (a, b) => iso(a) === iso(b)

function emptyEvent(date, time = '09:00') {
  return { id: crypto.randomUUID(), title: '', date, time, category: 'Personal' }
}

export default function Calendar() {
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(new Date())
  const [events, setEvents] = useLocalState('calendar-events', [])
  const [draft, setDraft] = useState(null)

  const today = new Date()

  const eventsByDate = useMemo(() => {
    const map = {}
    for (const e of events) (map[e.date] ||= []).push(e)
    for (const k in map) map[k].sort((a, b) => a.time.localeCompare(b.time))
    return map
  }, [events])

  const openNew = (date, time) => setDraft(emptyEvent(date, time))
  const openEdit = (e) => setDraft({ ...e })

  const saveDraft = () => {
    if (!draft.title.trim()) return
    setEvents((list) => {
      const exists = list.some((e) => e.id === draft.id)
      return exists ? list.map((e) => (e.id === draft.id ? draft : e)) : [...list, draft]
    })
    setDraft(null)
  }
  const deleteDraft = () => {
    setEvents((list) => list.filter((e) => e.id !== draft.id))
    setDraft(null)
  }

  // Navigation steps depend on the active view.
  const step = (dir) => {
    if (view === 'month') {
      const c = new Date(cursor)
      c.setMonth(c.getMonth() + dir)
      setCursor(c)
    } else {
      setCursor(addDays(cursor, dir * (view === 'week' ? 7 : 1)))
    }
  }

  const title =
    view === 'month'
      ? cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `Week of ${startOfWeek(cursor).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
        : cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader title="Calendar">
        <div className="flex items-center gap-3">
          <Tabs tabs={VIEWS} active={view} onChange={setView} />
        </div>
      </PageHeader>

      {/* Sub-navigation */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-xl bg-white/5 p-3 text-gray-300 active:scale-95"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-gray-300 active:scale-95"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-xl bg-white/5 p-3 text-gray-300 active:scale-95"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>

      <div className="scroll-area flex-1 rounded-2xl border border-border bg-surface">
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            today={today}
            eventsByDate={eventsByDate}
            onAdd={openNew}
            onOpen={openEdit}
          />
        )}
        {view === 'week' && (
          <WeekView
            cursor={cursor}
            today={today}
            eventsByDate={eventsByDate}
            onAdd={openNew}
            onOpen={openEdit}
          />
        )}
        {view === 'day' && (
          <DayView
            cursor={cursor}
            today={today}
            eventsByDate={eventsByDate}
            onAdd={openNew}
            onOpen={openEdit}
          />
        )}
      </div>

      <EventModal
        draft={draft}
        setDraft={setDraft}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
        onDelete={deleteDraft}
        isExisting={draft && events.some((e) => e.id === draft.id)}
      />
    </div>
  )
}

function EventChip({ event, onOpen }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(event)
      }}
      className="flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-xs font-medium text-white active:scale-[0.98]"
      style={{ backgroundColor: `${CATEGORIES[event.category]}33` }}
    >
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: CATEGORIES[event.category] }}
      />
      <span className="font-mono text-[10px] text-gray-300">{event.time}</span>
      <span className="truncate">{event.title}</span>
    </button>
  )
}

function MonthView({ cursor, today, eventsByDate, onAdd, onOpen }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = iso(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const isToday = sameDay(d, today)
          const dayEvents = eventsByDate[key] || []
          return (
            <button
              key={key}
              type="button"
              onClick={() => onAdd(key)}
              className={[
                'min-h-[96px] border-b border-r border-border p-1.5 text-left align-top active:bg-white/5',
                inMonth ? '' : 'opacity-40',
              ].join(' ')}
            >
              <div
                className={[
                  'mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full font-mono text-sm',
                  isToday ? 'bg-accent text-bg font-bold shadow-glow' : 'text-gray-300',
                ].join(' ')}
              >
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} onOpen={onOpen} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="px-2 text-[10px] text-gray-500">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ cursor, today, eventsByDate, onAdd, onOpen }) {
  const start = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="grid grid-cols-7">
      {days.map((d) => {
        const key = iso(d)
        const isToday = sameDay(d, today)
        const dayEvents = eventsByDate[key] || []
        return (
          <div key={key} className="min-h-full border-r border-border">
            <div
              className={[
                'border-b border-border px-2 py-2 text-center',
                isToday ? 'bg-accent/10' : '',
              ].join(' ')}
            >
              <div className="text-xs text-gray-500">{WEEKDAYS[d.getDay()]}</div>
              <div
                className={[
                  'font-mono text-lg',
                  isToday ? 'font-bold text-accent' : 'text-gray-200',
                ].join(' ')}
              >
                {d.getDate()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onAdd(key)}
              className="block min-h-[280px] w-full space-y-1 p-2 text-left align-top active:bg-white/5"
            >
              {dayEvents.map((e) => (
                <EventChip key={e.id} event={e} onOpen={onOpen} />
              ))}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function DayView({ cursor, today, eventsByDate, onAdd, onOpen }) {
  const key = iso(cursor)
  const dayEvents = eventsByDate[key] || []
  const isToday = sameDay(cursor, today)
  return (
    <div>
      {HOURS.map((h) => {
        const hh = String(h).padStart(2, '0')
        const slotEvents = dayEvents.filter((e) => Number(e.time.slice(0, 2)) === h)
        const isNow = isToday && today.getHours() === h
        return (
          <button
            key={h}
            type="button"
            onClick={() => onAdd(key, `${hh}:00`)}
            className={[
              'flex w-full items-start gap-4 border-b border-border px-4 py-3 text-left active:bg-white/5',
              isNow ? 'bg-accent/10' : '',
            ].join(' ')}
          >
            <div className="w-16 flex-shrink-0 pt-0.5 font-mono text-sm text-gray-500">
              {hh}:00
            </div>
            <div className="flex-1 space-y-1">
              {slotEvents.map((e) => (
                <EventChip key={e.id} event={e} onOpen={onOpen} />
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function EventModal({ draft, setDraft, onClose, onSave, onDelete, isExisting }) {
  if (!draft) return null
  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={isExisting ? 'Edit Event' : 'Add Event'}
      footer={
        <>
          {isExisting && (
            <Button variant="danger" onClick={onDelete}>
              <TrashIcon className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </>
      }
    >
      {/* Two columns: details on the left, category on the right. */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <input
            autoFocus
            className={fieldClass}
            placeholder="Event title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <div className="flex gap-3">
            <input
              type="date"
              className={fieldClass}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
            <input
              type="time"
              className={fieldClass}
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs text-gray-500">Category</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIES).map(([name, color]) => (
              <button
                key={name}
                type="button"
                onClick={() => setDraft({ ...draft, category: name })}
                className={[
                  'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95',
                  draft.category === name ? 'shadow-glow' : 'opacity-60',
                ].join(' ')}
                style={{
                  backgroundColor: `${color}22`,
                  color,
                  outline: draft.category === name ? `2px solid ${color}` : 'none',
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
