import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Card.jsx'
import Tabs from '../components/Tabs.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import Toggle from '../components/Toggle.jsx'
import TimePicker from '../components/TimePicker.jsx'
import DateField from '../components/DateField.jsx'
import { MemberBadge, MemberPicker } from '../components/Member.jsx'
import { useLocalState } from '../lib/storage.js'
import { useDragScroll } from '../lib/useDragScroll.js'
import { SEED_MEMBERS } from '../lib/seeds.js'
import {
  BellIcon,
  BookIcon,
  BriefcaseIcon,
  CalendarIcon,
  CarIcon,
  ChevronLeft,
  ChevronRight,
  ClockIcon,
  CloseIcon,
  DumbbellIcon,
  FilterIcon,
  GiftIcon,
  HeartIcon,
  HomeIcon,
  MealIcon,
  MoonIcon,
  MusicIcon,
  NoteIcon,
  PencilIcon,
  PlaneIcon,
  PlusIcon,
  StarIcon,
  SunIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from '../components/Icons.jsx'

const VIEWS = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
]

// Pickable icons for categories. Keyed by a stable id stored on the category.
const ICONS = {
  briefcase: BriefcaseIcon,
  user: UserIcon,
  users: UsersIcon,
  heart: HeartIcon,
  home: HomeIcon,
  star: StarIcon,
  bell: BellIcon,
  tag: TagIcon,
  book: BookIcon,
  gift: GiftIcon,
  plane: PlaneIcon,
  dumbbell: DumbbellIcon,
  music: MusicIcon,
  sun: SunIcon,
  moon: MoonIcon,
  car: CarIcon,
  meal: MealIcon,
  calendar: CalendarIcon,
}
const ICON_NAMES = Object.keys(ICONS)
function CategoryIcon({ name, ...props }) {
  const Cmp = ICONS[name] || TagIcon
  return <Cmp {...props} />
}

// Color palette shared with Meals/Goals so categories feel consistent.
const PALETTE = ['#58A6FF', '#39D353', '#F0883E', '#BC8CFF', '#F85149', '#D29922', '#2DD4BF', '#8B949E']

const DEFAULT_CATEGORIES = [
  { id: 'work', name: 'Work', color: '#58A6FF', icon: 'briefcase' },
  { id: 'personal', name: 'Personal', color: '#39D353', icon: 'user' },
  { id: 'health', name: 'Health', color: '#F85149', icon: 'heart' },
  { id: 'family', name: 'Family', color: '#BC8CFF', icon: 'users' },
  { id: 'other', name: 'Other', color: '#8B949E', icon: 'tag' },
]

// Resolve an event's stored category reference (id, or legacy name) to a
// category object, falling back to the last category ("Other") so a deleted or
// unknown category never crashes the view.
const catOf = (categories, key) =>
  categories.find((c) => c.id === key) ||
  categories.find((c) => c.name.toLowerCase() === String(key || '').toLowerCase()) ||
  categories[categories.length - 1] ||
  DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const HOUR_HEIGHT = 52 // px per hour row in the week/day time grids
const DAY_HEIGHT = HOUR_HEIGHT * 24

// --- Date/time helpers (local, no library; weeks start Sunday) ---------------
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
const minutesOf = (t) => {
  const [h, m] = String(t || '').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}
const fmtMinutes = (mins) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
// Add minutes to a HH:MM string, clamped to the same day (never past 23:59).
const addMinutes = (t, delta) => fmtMinutes(Math.min(23 * 60 + 59, minutesOf(t) + delta))

function emptyEvent(date, time = '09:00', categoryId = DEFAULT_CATEGORIES[1].id) {
  return {
    id: crypto.randomUUID(),
    title: '',
    allDay: false,
    startDate: date,
    startTime: time,
    endDate: date,
    endTime: addMinutes(time, 60),
    category: categoryId,
    members: [],
    notes: '',
  }
}

// Upgrade legacy events ({ date, time }) to the timeframe shape on read so old
// saves keep working and gain a sensible 1-hour duration.
function migrateEvents(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      if (typeof e.startDate === 'string') {
        return Array.isArray(e.members) ? e : { ...e, members: [] }
      }
      const date = typeof e.date === 'string' ? e.date : ''
      const time = typeof e.time === 'string' ? e.time : '09:00'
      return {
        id: e.id || crypto.randomUUID(),
        title: e.title || '',
        allDay: !!e.allDay,
        startDate: date,
        startTime: time,
        endDate: date,
        endTime: addMinutes(time, 60),
        category: e.category || 'other',
        members: Array.isArray(e.members) ? e.members : [],
        notes: e.notes || '',
      }
    })
}

// Sort key: all-day events sort before timed ones on the same day.
const eventStart = (e) => `${e.startDate} ${e.allDay ? '00:00' : e.startTime}`
// Does an event's span cover the given ISO day?
const coversDay = (e, key) => e.startDate <= key && key <= (e.endDate || e.startDate)
const isMultiDay = (e) => (e.endDate || e.startDate) !== e.startDate

// Human-readable range, e.g. "Mon, Jun 16 · 9:00 – 10:00" or a multi-day span.
function rangeText(e) {
  const sd = new Date(`${e.startDate}T00:00`)
  const ed = new Date(`${(e.endDate || e.startDate)}T00:00`)
  const dayFmt = { weekday: 'short', month: 'short', day: 'numeric' }
  if (e.allDay) {
    return isMultiDay(e)
      ? `${sd.toLocaleDateString([], dayFmt)} → ${ed.toLocaleDateString([], dayFmt)} · All day`
      : `${sd.toLocaleDateString([], dayFmt)} · All day`
  }
  if (!isMultiDay(e)) {
    return `${sd.toLocaleDateString([], dayFmt)} · ${e.startTime} – ${e.endTime}`
  }
  return `${sd.toLocaleDateString([], dayFmt)} ${e.startTime} → ${ed.toLocaleDateString([], dayFmt)} ${e.endTime}`
}

// Lay out a day's events into side-by-side lanes so overlapping blocks don't
// stack on top of each other. Items carry { segStart, segEnd } in minutes.
function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.segStart - b.segStart || a.segEnd - b.segEnd)
  const out = []
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    const laneEnds = []
    for (const it of cluster) {
      let lane = 0
      for (; lane < laneEnds.length; lane++) if (laneEnds[lane] <= it.segStart) break
      laneEnds[lane] = it.segEnd
      it.lane = lane
    }
    for (const it of cluster) {
      it.lanes = laneEnds.length
      out.push(it)
    }
    cluster = []
  }
  for (const it of sorted) {
    if (cluster.length && it.segStart >= clusterEnd) {
      flush()
      clusterEnd = -1
    }
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.segEnd)
  }
  flush()
  return out
}

// Timed events on a day that cover the given day (all-day events are shown
// separately in the all-day band), each is later sorted into lanes.
const allDayOn = (events, key) =>
  events
    .filter((e) => e.allDay && coversDay(e, key))
    .sort((a, b) => eventStart(a).localeCompare(eventStart(b)))

// Events overlapping a given day, with per-day clamped start/end minutes.
function daySegments(events, key) {
  const segs = events
    .filter((e) => !e.allDay && coversDay(e, key))
    .map((e) => {
      const segStart = key === e.startDate ? minutesOf(e.startTime) : 0
      let segEnd = key === (e.endDate || e.startDate) ? minutesOf(e.endTime) : 24 * 60
      if (segEnd <= segStart) segEnd = Math.min(24 * 60, segStart + 30)
      return { ...e, segStart, segEnd }
    })
  return layoutDay(segs)
}

export default function Calendar() {
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(new Date())
  const [events, setEvents] = useLocalState('calendar-events', [], migrateEvents)
  const [categories, setCategories] = useLocalState('calendar-categories', DEFAULT_CATEGORIES)
  const [members] = useLocalState('meals-members', SEED_MEMBERS) // shared with Meals/Settings
  const [draft, setDraft] = useState(null) // event being added/edited
  const [selectedId, setSelectedId] = useState(null) // event whose info page is open
  const [catManagerOpen, setCatManagerOpen] = useState(false)
  const [catDraft, setCatDraft] = useState(null) // category being added/edited
  // When a category is created from the event editor, re-select it on save.
  const [pendingCatSelect, setPendingCatSelect] = useState(false)
  // Filter facets: category ids and member ids (each empty == no constraint).
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterCategories, setFilterCategories] = useState([])
  const [filterMembers, setFilterMembers] = useState([])

  const today = new Date()
  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) || null,
    [events, selectedId],
  )

  const filterActive = filterCategories.length > 0 || filterMembers.length > 0
  // An event matches when each active facet is satisfied (category AND member).
  const visibleEvents = useMemo(() => {
    if (!filterActive) return events
    return events.filter((e) => {
      if (filterCategories.length && !filterCategories.includes(e.category)) return false
      if (filterMembers.length && !(e.members || []).some((id) => filterMembers.includes(id)))
        return false
      return true
    })
  }, [events, filterActive, filterCategories, filterMembers])

  const toggleFilterCategory = (id) =>
    setFilterCategories((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const toggleFilterMember = (id) =>
    setFilterMembers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const clearFilter = () => {
    setFilterCategories([])
    setFilterMembers([])
  }

  const openNew = (date, time) => {
    const id = categories[0]?.id || DEFAULT_CATEGORIES[0].id
    setDraft(emptyEvent(date, time, id))
  }
  const openEdit = (e) => {
    setSelectedId(null)
    setDraft({ ...e })
  }

  const saveDraft = () => {
    if (!draft.title.trim()) return
    // Keep the timeframe coherent: end can't precede start.
    const next = { ...draft, title: draft.title.trim() }
    if ((next.endDate || next.startDate) < next.startDate) next.endDate = next.startDate
    if (!next.allDay && next.endDate === next.startDate && minutesOf(next.endTime) <= minutesOf(next.startTime)) {
      next.endTime = addMinutes(next.startTime, 60)
    }
    setEvents((list) => {
      const exists = list.some((e) => e.id === next.id)
      return exists ? list.map((e) => (e.id === next.id ? next : e)) : [...list, next]
    })
    setDraft(null)
  }
  const deleteEvent = (id) => {
    setEvents((list) => list.filter((e) => e.id !== id))
    setDraft(null)
    setSelectedId(null)
  }

  // --- Category ops ----------------------------------------------------------
  const saveCategory = () => {
    if (!catDraft.name.trim()) return
    const c = { ...catDraft, name: catDraft.name.trim() }
    setCategories((list) => {
      const exists = list.some((x) => x.id === c.id)
      return exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]
    })
    if (pendingCatSelect) setDraft((d) => (d ? { ...d, category: c.id } : d))
    setCatDraft(null)
    setPendingCatSelect(false)
  }
  const deleteCategory = (id) => {
    setCategories((list) => (list.length > 1 ? list.filter((c) => c.id !== id) : list))
    setCatDraft(null)
  }
  const newCategory = () => ({
    id: crypto.randomUUID(),
    name: '',
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    icon: ICON_NAMES[0],
  })
  const createCategoryForEvent = () => {
    setPendingCatSelect(true)
    setCatDraft(newCategory())
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

  // Navigator labels (primary + relative subtitle), matching the Meals/Goals
  // week navigator style across all three views.
  const nav = useMemo(() => {
    const now = new Date()
    if (view === 'month') {
      const delta =
        (cursor.getFullYear() - now.getFullYear()) * 12 + (cursor.getMonth() - now.getMonth())
      return {
        primary: cursor.toLocaleDateString([], { month: 'long', year: 'numeric' }),
        secondary: relLabel(delta, 'month'),
        isNow: delta === 0,
      }
    }
    if (view === 'week') {
      const ws = startOfWeek(cursor)
      const we = addDays(ws, 6)
      const delta = Math.round((ws - startOfWeek(now)) / (7 * 864e5))
      return {
        primary: `${ws.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
        secondary: relLabel(delta, 'week'),
        isNow: delta === 0,
      }
    }
    const a = new Date(cursor)
    a.setHours(0, 0, 0, 0)
    const b = new Date(now)
    b.setHours(0, 0, 0, 0)
    const delta = Math.round((a - b) / 864e5)
    return {
      primary: cursor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }),
      secondary: relLabel(delta, 'day'),
      isNow: delta === 0,
    }
  }, [view, cursor])

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader title="Calendar">
        <div className="flex items-center gap-3">
          <Tabs tabs={VIEWS} active={view} onChange={setView} />
        </div>
      </PageHeader>

      {/* Sub-navigation: on phones everything stacks (navigator on top, the
          action buttons in a row below). At sm+ the navigator is centered with
          Categories pinned left and the filter + add-event cluster pinned right. */}
      <div className="mb-4 flex flex-col gap-3 sm:relative sm:block">
        <div className="order-1 sm:order-none">
          <Navigator
            primary={nav.primary}
            secondary={nav.secondary}
            secondaryAccent={!nav.isNow}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onToday={() => setCursor(new Date())}
          />
        </div>

        {/* Action buttons: a justify-between row on phones; the two groups become
            absolutely-positioned corners at sm+ (children opt in via sm: prefixes). */}
        <div className="order-2 flex items-center justify-between gap-2 sm:order-none">
          <div className="sm:absolute sm:inset-y-0 sm:left-0 sm:flex sm:items-center">
            <button
              type="button"
              onClick={() => setCatManagerOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-gray-300 active:scale-95"
            >
              <TagIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Categories</span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:absolute sm:inset-y-0 sm:right-0">
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                aria-label="Filter events"
                className={[
                  'flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
                  filterActive ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-300',
                ].join(' ')}
              >
                <FilterIcon className="h-5 w-5" />
                <span className="hidden sm:inline">Filter</span>
                {filterActive && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-bg">
                    {filterCategories.length + filterMembers.length}
                  </span>
                )}
              </button>
              {filterOpen && (
                <CalendarFilter
                  categories={categories}
                  members={members}
                  filterCategories={filterCategories}
                  filterMembers={filterMembers}
                  onToggleCategory={toggleFilterCategory}
                  onToggleMember={toggleFilterMember}
                  onClear={clearFilter}
                  onClose={() => setFilterOpen(false)}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => openNew(iso(view === 'day' ? cursor : today))}
              className="flex items-center gap-2 rounded-xl bg-accent/15 px-4 py-3 text-sm font-semibold text-accent shadow-glow active:scale-95"
            >
              <PlusIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Event</span>
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            today={today}
            events={visibleEvents}
            categories={categories}
            onAdd={openNew}
            onOpen={(e) => setSelectedId(e.id)}
          />
        )}
        {view === 'week' && (
          <TimeGrid
            days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
            today={today}
            events={visibleEvents}
            categories={categories}
            members={members}
            showHeader
            onAdd={openNew}
            onOpen={(e) => setSelectedId(e.id)}
          />
        )}
        {view === 'day' && (
          <TimeGrid
            days={[new Date(cursor)]}
            today={today}
            events={visibleEvents}
            categories={categories}
            members={members}
            onAdd={openNew}
            onOpen={(e) => setSelectedId(e.id)}
          />
        )}
      </div>

      {/* Event info page */}
      <EventDetail
        event={selected}
        categories={categories}
        members={members}
        onClose={() => setSelectedId(null)}
        onEdit={() => openEdit(selected)}
      />

      {/* Add / edit event */}
      <EventModal
        draft={draft}
        setDraft={setDraft}
        categories={categories}
        members={members}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
        onDelete={() => deleteEvent(draft.id)}
        onNewCategory={createCategoryForEvent}
        isExisting={draft && events.some((e) => e.id === draft.id)}
      />

      {/* Category manager */}
      <CategoriesModal
        open={catManagerOpen}
        categories={categories}
        onClose={() => setCatManagerOpen(false)}
        onAdd={() => setCatDraft(newCategory())}
        onEdit={(c) => setCatDraft({ ...c })}
      />

      {/* Add / edit a single category */}
      <CategoryModal
        draft={catDraft}
        setDraft={setCatDraft}
        onClose={() => {
          setCatDraft(null)
          setPendingCatSelect(false)
        }}
        onSave={saveCategory}
        onDelete={() => deleteCategory(catDraft.id)}
        canDelete={categories.length > 1 && categories.some((c) => c.id === catDraft?.id)}
        isExisting={catDraft && categories.some((c) => c.id === catDraft.id)}
      />
    </div>
  )
}

// Relative subtitle for the navigator ("This week", "Next month", …).
function relLabel(delta, unit) {
  const u = (n) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (delta === 0) return unit === 'month' ? 'This month' : unit === 'week' ? 'This week' : 'Today'
  if (delta === -1) return unit === 'day' ? 'Yesterday' : `Last ${unit}`
  if (delta === 1) return unit === 'day' ? 'Tomorrow' : `Next ${unit}`
  return delta < 0 ? `${u(-delta)} ago` : `In ${u(delta)}`
}

// Shared navigator: arrows flank a centered label; tap the label to jump to now.
function Navigator({ primary, secondary, secondaryAccent, onPrev, onNext, onToday }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous"
        className="rounded-xl bg-white/5 p-3 text-gray-300 active:scale-95"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={onToday}
        title="Jump to today"
        className="min-w-[11rem] rounded-xl px-4 py-2 text-center active:scale-95 sm:min-w-[14rem]"
      >
        <div className="text-xl font-bold text-white">{primary}</div>
        <div className={secondaryAccent ? 'text-xs text-accent' : 'text-xs text-gray-500'}>
          {secondary}
        </div>
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next"
        className="rounded-xl bg-white/5 p-3 text-gray-300 active:scale-95"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  )
}

function EventChip({ event, category, onOpen }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(event)
      }}
      className="flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-xs font-medium text-white active:scale-[0.98]"
      style={{ backgroundColor: `${category.color}33` }}
    >
      <CategoryIcon name={category.icon} className="h-3 w-3 flex-shrink-0" style={{ color: category.color }} />
      <span className="font-mono text-[10px] text-gray-300">{event.allDay ? 'All day' : event.startTime}</span>
      <span className="truncate">{event.title}</span>
    </button>
  )
}

function MonthView({ cursor, today, events, categories, onAdd, onOpen }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  return (
    <div className="scroll-area h-full">
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
          const dayEvents = events
            .filter((e) => coversDay(e, key))
            .sort((a, b) => eventStart(a).localeCompare(eventStart(b)))
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
                  <EventChip key={e.id} event={e} category={catOf(categories, e.category)} onOpen={onOpen} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="px-2 text-[10px] text-gray-500">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Hour-slot time grid used by both Week (7 columns) and Day (1 column) views.
// Vertically scrollable with a tap-friendly scrollbar; mouse press-and-drag
// pans via useDragScroll while touch uses native scrolling.
function TimeGrid({ days, today, events, categories, members, showHeader, onAdd, onOpen }) {
  const { ref, handlers } = useDragScroll()
  const single = days.length === 1
  const memberById = useMemo(() => Object.fromEntries((members || []).map((m) => [m.id, m])), [members])

  // Open scrolled to the morning so the day's first events are in view.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 7 * HOUR_HEIGHT
  }, [ref])

  const nowMinutes = today.getHours() * 60 + today.getMinutes()
  // Only show the all-day band when at least one displayed day has an all-day event.
  const hasAllDay = days.some((d) => allDayOn(events, iso(d)).length > 0)

  return (
    <div className="flex h-full flex-col">
      {showHeader && (
        <div className="flex flex-shrink-0 border-b border-border pr-[10px]">
          <div className="w-14 flex-none" />
          {days.map((d) => {
            const isToday = sameDay(d, today)
            return (
              <div
                key={iso(d)}
                className={['flex-1 py-2 text-center', isToday ? 'bg-accent/10' : ''].join(' ')}
              >
                <div className="text-xs text-gray-500">{WEEKDAYS[d.getDay()]}</div>
                <div className={['font-mono text-lg', isToday ? 'font-bold text-accent' : 'text-gray-200'].join(' ')}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pinned all-day band above the scrolling hour grid */}
      {hasAllDay && (
        <div className="flex flex-shrink-0 border-b border-border bg-bg/40 pr-[10px]">
          <div className="flex w-14 flex-none items-center justify-end pr-2 text-[10px] uppercase text-gray-500">
            All day
          </div>
          {days.map((d) => {
            const key = iso(d)
            return (
              <div key={key} className="min-w-0 flex-1 space-y-1 border-l border-border p-1">
                {allDayOn(events, key).map((e) => (
                  <EventChip key={e.id} event={e} category={catOf(categories, e.category)} onOpen={onOpen} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      <div ref={ref} {...handlers} className="scroll-area relative flex-1">
        <div className="flex" style={{ height: DAY_HEIGHT }}>
          {/* Hour label gutter */}
          <div className="relative w-14 flex-none">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-gray-500"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
          {/* Day columns */}
          {days.map((d) => {
            const key = iso(d)
            const isToday = sameDay(d, today)
            const segs = daySegments(events, key)
            return (
              <div key={key} className="relative flex-1 border-l border-border">
                {/* Hour rows: each is a tap target to add an event at that hour */}
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onAdd(key, `${String(h).padStart(2, '0')}:00`)}
                    className="absolute inset-x-0 border-b border-border/60 active:bg-white/5"
                    style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    aria-label={`Add event ${key} ${h}:00`}
                  />
                ))}
                {/* Current-time indicator */}
                {isToday && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <span className="-ml-1 h-2 w-2 rounded-full bg-loss" />
                    <span className="h-0.5 flex-1 bg-loss" />
                  </div>
                )}
                {/* Event blocks */}
                {segs.map((e) => {
                  const cat = catOf(categories, e.category)
                  const top = (e.segStart / 60) * HOUR_HEIGHT
                  const height = Math.max(18, ((e.segEnd - e.segStart) / 60) * HOUR_HEIGHT - 2)
                  const widthPct = 100 / e.lanes
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onOpen(e)
                      }}
                      className="absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left active:scale-[0.99]"
                      style={{
                        top,
                        height,
                        left: `calc(${e.lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: `${cat.color}26`,
                        borderLeft: `3px solid ${cat.color}`,
                      }}
                    >
                      <div className="flex items-center gap-1 truncate text-xs font-semibold text-white">
                        <CategoryIcon name={cat.icon} className="h-3 w-3 flex-shrink-0" style={{ color: cat.color }} />
                        <span className="truncate">{e.title || '(untitled)'}</span>
                      </div>
                      {height > 30 && (
                        <div className="truncate font-mono text-[10px] text-gray-300">
                          {single || !isMultiDay(e)
                            ? `${fmtMinutes(e.segStart)}–${fmtMinutes(e.segEnd)}`
                            : 'all day'}
                        </div>
                      )}
                      {height > 48 && (e.members || []).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {(e.members || []).map(
                            (id) => memberById[id] && <MemberBadge key={id} member={memberById[id]} size={16} />,
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Read-only event info page with a pencil edit affordance in the top-right.
function EventDetail({ event, categories, members, onClose, onEdit }) {
  if (!event) return null
  const cat = catOf(categories, event.category)
  const assigned = (event.members || [])
    .map((id) => (members || []).find((m) => m.id === id))
    .filter(Boolean)
  return (
    <Modal
      open={!!event}
      onClose={onClose}
      title="Event"
      headerExtra={
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit event"
          className="rounded-lg p-2 text-accent active:scale-95 active:bg-white/5"
        >
          <PencilIcon className="h-6 w-6" />
        </button>
      }
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${cat.color}22` }}
          >
            <CategoryIcon name={cat.icon} className="h-6 w-6" style={{ color: cat.color }} />
          </span>
          <div className="min-w-0">
            <h3 className="text-2xl font-bold text-white">{event.title || '(untitled)'}</h3>
            <span
              className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
            >
              {cat.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-gray-200">
          <ClockIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
          <span>{rangeText(event)}</span>
        </div>

        {assigned.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
            <UsersIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
            <div className="flex flex-wrap gap-2">
              {assigned.map((m) => (
                <span
                  key={m.id}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold"
                  style={{ backgroundColor: `${m.color}22`, color: m.color }}
                >
                  <MemberBadge member={m} size={18} />
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {event.notes?.trim() && (
          <div className="flex items-start gap-3 rounded-xl bg-white/5 px-4 py-3 text-gray-200">
            <NoteIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
            <p className="whitespace-pre-wrap">{event.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function EventModal({ draft, setDraft, categories, members, onClose, onSave, onDelete, onNewCategory, isExisting }) {
  if (!draft) return null
  const set = (patch) => setDraft({ ...draft, ...patch })
  const toggleMember = (id) =>
    set({
      members: (draft.members || []).includes(id)
        ? draft.members.filter((x) => x !== id)
        : [...(draft.members || []), id],
    })
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
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <input
            autoFocus
            className={fieldClass}
            placeholder="Event title"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value })}
          />
          {/* Time frame: from (date + time) → to (date + time) */}
          <div className="space-y-3 rounded-xl border border-border bg-bg/40 p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-300">All day</span>
              <Toggle
                checked={!!draft.allDay}
                onChange={(v) => set({ allDay: v })}
                label="All day event"
              />
            </label>
            <div>
              <label className="mb-1 block text-xs text-gray-500">From</label>
              <div className="flex gap-2">
                <DateField
                  value={draft.startDate}
                  ariaLabel="Start date"
                  onChange={(v) => set({ startDate: v })}
                />
                {!draft.allDay && (
                  <TimePicker
                    value={draft.startTime}
                    ariaLabel="Start time"
                    onChange={(v) => set({ startTime: v })}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">To</label>
              <div className="flex gap-2">
                <DateField
                  value={draft.endDate}
                  min={draft.startDate}
                  ariaLabel="End date"
                  onChange={(v) => set({ endDate: v })}
                />
                {!draft.allDay && (
                  <TimePicker
                    value={draft.endTime}
                    ariaLabel="End time"
                    onChange={(v) => set({ endTime: v })}
                  />
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Notes</label>
            <textarea
              rows={4}
              className={fieldClass}
              placeholder="Description / notes…"
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs text-gray-500">Category</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = draft.category === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set({ category: c.id })}
                  className={[
                    'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95',
                    on ? 'shadow-glow' : 'opacity-60',
                  ].join(' ')}
                  style={{
                    backgroundColor: `${c.color}22`,
                    color: c.color,
                    outline: on ? `2px solid ${c.color}` : 'none',
                  }}
                >
                  <CategoryIcon name={c.icon} className="h-4 w-4" />
                  {c.name}
                </button>
              )
            })}
            <button
              type="button"
              onClick={onNewCategory}
              className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-gray-400 active:scale-95"
            >
              <PlusIcon className="h-4 w-4" /> New
            </button>
          </div>

          <label className="mb-2 mt-5 block text-xs text-gray-500">Members</label>
          <MemberPicker
            members={members}
            selected={draft.members || []}
            onToggle={toggleMember}
            emptyHint="No household members yet — add them in Settings → Household."
          />
        </div>
      </div>
    </Modal>
  )
}

// Manager listing all categories with edit/delete and an add button.
function CategoriesModal({ open, categories, onClose, onAdd, onEdit }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Categories"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
          <Button onClick={onAdd}>
            <span className="flex items-center gap-2">
              <PlusIcon className="h-5 w-5" /> Category
            </span>
          </Button>
        </>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onEdit(c)}
            className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left active:scale-[0.98]"
            style={{ outline: `1px solid ${c.color}55` }}
          >
            <span
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${c.color}22` }}
            >
              <CategoryIcon name={c.icon} className="h-5 w-5" style={{ color: c.color }} />
            </span>
            <span className="flex-1 truncate font-semibold text-white">{c.name}</span>
            <PencilIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
          </button>
        ))}
      </div>
    </Modal>
  )
}

function CategoryModal({ draft, setDraft, onClose, onSave, onDelete, canDelete, isExisting }) {
  if (!draft) return null
  const set = (patch) => setDraft({ ...draft, ...patch })
  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      size="narrow"
      title={isExisting ? 'Edit Category' : 'New Category'}
      footer={
        <>
          {canDelete && (
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
      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-xs text-gray-500">Name</label>
          <input
            autoFocus
            className={fieldClass}
            placeholder="Category name (e.g. Travel)"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-2 block text-xs text-gray-500">Color</label>
          <div className="flex flex-wrap gap-3">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ color: c })}
                aria-label={`Color ${c}`}
                className="h-10 w-10 rounded-full active:scale-90"
                style={{
                  backgroundColor: c,
                  outline: draft.color === c ? '3px solid white' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs text-gray-500">Icon</label>
          <div className="flex flex-wrap gap-2">
            {ICON_NAMES.map((name) => {
              const on = draft.icon === name
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => set({ icon: name })}
                  aria-label={`Icon ${name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl active:scale-90"
                  style={{
                    backgroundColor: on ? `${draft.color}22` : 'rgba(255,255,255,0.05)',
                    color: on ? draft.color : '#8B949E',
                    outline: on ? `2px solid ${draft.color}` : 'none',
                  }}
                >
                  <CategoryIcon name={name} className="h-6 w-6" />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// Popover for filtering events by category and/or member. Each active facet
// must be satisfied for an event to show.
function CalendarFilter({
  categories,
  members,
  filterCategories,
  filterMembers,
  onToggleCategory,
  onToggleMember,
  onClear,
  onClose,
}) {
  const active = filterCategories.length > 0 || filterMembers.length > 0
  return (
    <>
      {/* Click-away backdrop. */}
      <button type="button" aria-label="Close filter" onClick={onClose} className="fixed inset-0 z-40 cursor-default" />
      <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-surface p-4 text-left shadow-glow">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Filter events</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 active:scale-90">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-2 block text-xs text-gray-500">Category</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = filterCategories.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggleCategory(c.id)}
                className={[
                  'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold active:scale-95',
                  on ? '' : 'opacity-60',
                ].join(' ')}
                style={{
                  backgroundColor: `${c.color}22`,
                  color: c.color,
                  outline: on ? `2px solid ${c.color}` : 'none',
                }}
              >
                <CategoryIcon name={c.icon} className="h-4 w-4" />
                {c.name}
              </button>
            )
          })}
        </div>

        <label className="mb-2 block text-xs text-gray-500">Member</label>
        <MemberPicker
          members={members}
          selected={filterMembers}
          onToggle={onToggleMember}
          emptyHint="No household members yet — add them in Settings → Household."
        />

        {active && (
          <button
            type="button"
            onClick={onClear}
            className="mt-4 w-full rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-gray-300 active:scale-95"
          >
            Clear filters
          </button>
        )}
      </div>
    </>
  )
}
