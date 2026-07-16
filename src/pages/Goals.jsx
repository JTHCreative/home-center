import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import TallyBoxes from '../components/TallyBoxes.jsx'
import Toggle from '../components/Toggle.jsx'
import { MemberBadge, MemberPicker } from '../components/Member.jsx'
import { useLocalState } from '../lib/storage.js'
import {
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from '../components/Icons.jsx'
import { GOALS_SEED as SEED, SEED_MEMBERS } from '../lib/seeds.js'
import { migrateColors } from '../lib/colors.js'

// Section accent palette (tap to pick when creating/editing a section).
// Nature-inspired Color Design System palette, shared across the app.
const COLORS = [
  '#E28F54', // Ember
  '#52C167', // Sage
  '#61A2E0', // Water
  '#AC88E0', // Thistle
  '#CDA86C', // Sand
  '#8FC992', // Fern
  '#D8685E', // Dusk
  '#82B0C8', // Fog
  '#BD9541', // Lichen
  '#D078A9', // Heather
  '#8C948F', // Stone
  '#44B2A8', // Tide
]

// Default calendar category colors (mirrors Calendar.jsx) for the Upcoming
// Events list, used as a fallback when no stored categories match.
const CAL_COLORS = {
  Work: '#61A2E0',
  Personal: '#52C167',
  Health: '#D8685E',
  Family: '#AC88E0',
  Other: '#8C948F',
}

// Read an event's start date/time across both the legacy ({ date, time }) and
// the timeframe ({ startDate, startTime }) shapes used by the Calendar.
const evDate = (e) => e.startDate || e.date || ''
const evTime = (e) => e.startTime || e.time || ''

// --- Date helpers ------------------------------------------------------------
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
const sundayOf = (d) => {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  c.setDate(c.getDate() - c.getDay()) // week starts Sunday
  return c
}

const EMPTY_WEEK = { items: {}, children: {} }

// Completion (0–1) for an item, using the selected week's progress.
function itemCompletion(item, wp) {
  const kids = item.children || []
  if (kids.length > 0) {
    return kids.filter((c) => wp.children[c.id]).length / kids.length
  }
  if (item.type === 'tally') {
    const checks = wp.items[item.id]?.checks || []
    const done = checks.slice(0, item.target).filter(Boolean).length
    return item.target ? Math.max(0, Math.min(1, done / item.target)) : 0
  }
  return wp.items[item.id]?.done ? 1 : 0
}

const sectionCompletion = (s, wp) =>
  s.items.length === 0
    ? 0
    : (s.items.reduce((sum, it) => sum + itemCompletion(it, wp), 0) / s.items.length) * 100

const newSection = () => ({ id: crypto.randomUUID(), title: '', color: COLORS[1], items: [] })

const newItem = () => ({
  id: crypto.randomUUID(),
  title: '',
  type: 'checkbox',
  target: 7,
  note: '',
  children: [],
  // Habit tracking: habits also appear on the Habits page, where each check
  // earns the assigned member(s) a point. No members = everyone on that page.
  habit: false,
  habitMembers: [],
})

export default function Goals() {
  const [sections, setSections] = useLocalState('goals-sections', SEED, migrateColors)
  const [progress, setProgress] = useLocalState('goals-progress', {}) // weekKey -> { items, children }
  const [calendarEvents] = useLocalState('calendar-events', []) // read-only, shared with Calendar
  const [calendarCategories] = useLocalState('calendar-categories', [], migrateColors) // read-only, for colors
  const [members] = useLocalState('meals-members', SEED_MEMBERS, migrateColors) // read-only, for event member circles
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [sectionDraft, setSectionDraft] = useState(null)
  const [itemDraft, setItemDraft] = useState(null) // { sectionId, item }
  const [fullSectionId, setFullSectionId] = useState(null) // section opened full screen

  // Derived so live edits/toggles show while the full-screen view is open.
  const fullSection = sections.find((s) => s.id === fullSectionId) || null

  const weekKey = iso(weekStart)
  const wp = progress[weekKey] || EMPTY_WEEK
  const isCurrentWeek = weekKey === iso(sundayOf(new Date()))

  // Upcoming events pulled (read-only) from the Calendar page's stored events.
  const upcoming = useMemo(() => {
    const today = iso(new Date())
    const stored = Array.isArray(calendarEvents) ? calendarEvents : []
    return stored
      .filter((e) => e && evDate(e) >= today)
      .sort((a, b) => `${evDate(a)}${evTime(a)}`.localeCompare(`${evDate(b)}${evTime(b)}`))
      .slice(0, 8)
  }, [calendarEvents])

  // Resolve an event's category color from the shared categories (by id or
  // legacy name), falling back to the built-in palette.
  const eventColor = (e) => {
    const cats = Array.isArray(calendarCategories) ? calendarCategories : []
    const match = cats.find(
      (c) => c.id === e.category || c.name?.toLowerCase() === String(e.category || '').toLowerCase(),
    )
    return match?.color || CAL_COLORS[e.category] || '#8C948F'
  }

  // Household members assigned to an event (skips any that no longer exist).
  const eventMembers = (e) => {
    const list = Array.isArray(members) ? members : []
    return (e.members || []).map((id) => list.find((m) => m.id === id)).filter(Boolean)
  }

  // --- Per-week progress mutations ------------------------------------------
  const editWeek = (fn) =>
    setProgress((p) => {
      const cur = p[weekKey] || EMPTY_WEEK
      return { ...p, [weekKey]: fn(cur) }
    })
  const toggleCheckbox = (itemId) =>
    editWeek((wk) => {
      const item = wk.items[itemId] || {}
      return { ...wk, items: { ...wk.items, [itemId]: { ...item, done: !item.done } } }
    })
  const toggleTally = (itemId, index, target) =>
    editWeek((wk) => {
      const item = wk.items[itemId] || {}
      const checks = Array.from({ length: target }, (_, i) => item.checks?.[i] || false)
      checks[index] = !checks[index]
      return { ...wk, items: { ...wk.items, [itemId]: { ...item, checks } } }
    })
  const toggleChild = (childId) =>
    editWeek((wk) => ({ ...wk, children: { ...wk.children, [childId]: !wk.children[childId] } }))

  // --- Section ops ----------------------------------------------------------
  const saveSection = () => {
    if (!sectionDraft.title.trim()) return
    const draft = { ...sectionDraft, title: sectionDraft.title.trim() }
    setSections((list) => {
      const exists = list.some((s) => s.id === draft.id)
      return exists ? list.map((s) => (s.id === draft.id ? draft : s)) : [...list, draft]
    })
    setSectionDraft(null)
  }
  const removeSection = (id) => setSections((list) => list.filter((s) => s.id !== id))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setSections((list) => {
      const from = list.findIndex((s) => s.id === active.id)
      const to = list.findIndex((s) => s.id === over.id)
      return from === -1 || to === -1 ? list : arrayMove(list, from, to)
    })
  }

  // --- Item ops -------------------------------------------------------------
  const saveItem = () => {
    if (!itemDraft.item.title.trim()) return
    const children = (itemDraft.item.children || [])
      .map((c) => ({ id: c.id, title: c.title.trim() }))
      .filter((c) => c.title)
    const item = {
      ...itemDraft.item,
      title: itemDraft.item.title.trim(),
      target: Math.max(1, Number(itemDraft.item.target) || 1),
      children,
      // Checklists (with sub-items) can't be habits — points are per check.
      habit: children.length === 0 && !!itemDraft.item.habit,
      habitMembers: itemDraft.item.habitMembers || [],
    }
    setSections((list) =>
      list.map((s) => {
        if (s.id !== itemDraft.sectionId) return s
        const exists = s.items.some((it) => it.id === item.id)
        return {
          ...s,
          items: exists ? s.items.map((it) => (it.id === item.id ? item : it)) : [...s.items, item],
        }
      }),
    )
    setItemDraft(null)
  }
  const removeItem = (sectionId, itemId) =>
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId ? { ...s, items: s.items.filter((it) => it.id !== itemId) } : s,
      ),
    )
  const reorderItems = (sectionId, activeId, overId) =>
    setSections((list) =>
      list.map((s) => {
        if (s.id !== sectionId) return s
        const from = s.items.findIndex((it) => it.id === activeId)
        const to = s.items.findIndex((it) => it.id === overId)
        return from === -1 || to === -1 ? s : { ...s, items: arrayMove(s.items, from, to) }
      }),
    )

  // Week label, e.g. "Jun 8 – Jun 14"
  const weekEnd = addDays(weekStart, 6)
  const rangeLabel = `${weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
  const weekDelta = Math.round((weekStart - sundayOf(new Date())) / (7 * 864e5))
  const relLabel =
    weekDelta === 0
      ? 'This week'
      : weekDelta === -1
        ? 'Last week'
        : weekDelta === 1
          ? 'Next week'
          : weekDelta < 0
            ? `${-weekDelta} weeks ago`
            : `In ${weekDelta} weeks`

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Goals" subtitle="Color-coded lists, tracked by week">
        <Button onClick={() => setSectionDraft(newSection())}>
          <span className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" /> Add List
          </span>
        </Button>
      </PageHeader>

      {/* Week navigator — arrows flank the range; click the range to jump to
          this week (matches the Meals schedule navigator). */}
      <div className="mb-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label="Previous week"
          className="rounded-xl bg-white/5 p-3 text-gray-300 active:scale-95"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(sundayOf(new Date()))}
          title="Jump to this week"
          className="min-w-[12rem] rounded-xl px-4 py-2 text-center active:scale-95"
        >
          <div className="text-xl font-bold text-white">{rangeLabel}</div>
          <div className={isCurrentWeek ? 'text-xs text-gray-500' : 'text-xs text-accent'}>
            {relLabel}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label="Next week"
          className="rounded-xl bg-white/5 p-3 text-gray-300 active:scale-95"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={rectSortingStrategy}>
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                wp={wp}
                onAddItem={() => setItemDraft({ sectionId: section.id, item: newItem() })}
                onEditItem={(it) => setItemDraft({ sectionId: section.id, item: { ...it } })}
                onToggleCheckbox={toggleCheckbox}
                onToggleTally={toggleTally}
                onToggleChild={toggleChild}
                onRemoveItem={(itemId) => removeItem(section.id, itemId)}
                onReorderItems={(activeId, overId) => reorderItems(section.id, activeId, overId)}
                onEditSection={() => setSectionDraft({ ...section })}
                onRemoveSection={() => removeSection(section.id)}
                onOpenFull={() => setFullSectionId(section.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Upcoming events, pulled read-only from the Calendar */}
        <Card>
          <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
            <span className="h-3 w-3 rounded-full bg-accent" />
            <h2 className="text-lg font-bold text-white">Upcoming Events</h2>
            <span className="font-mono text-xs text-gray-500">from Calendar</span>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming events on the Calendar.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((e) => {
                const evMembers = eventMembers(e)
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: eventColor(e) }}
                    />
                    <span className="flex-1 truncate text-gray-200">{e.title}</span>
                    {/* Household members involved (none shown if unassigned). */}
                    {evMembers.length > 0 ? (
                      <div className="flex flex-shrink-0 items-center -space-x-1.5">
                        {evMembers.map((m) => (
                          <MemberBadge key={m.id} member={m} size={22} />
                        ))}
                      </div>
                    ) : (
                      <span className="flex-shrink-0 text-xs text-gray-600">None</span>
                    )}
                    <span className="w-12 flex-shrink-0 text-right font-mono text-xs text-gray-400">
                      {new Date(`${evDate(e)}T${evTime(e) || '00:00'}`).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Full-screen view of one list — opened by tapping the list's title.
          Rendered before the edit modals so those stack on top of it. */}
      {fullSection && (
        <Modal
          open
          size="full"
          onClose={() => setFullSectionId(null)}
          title={
            <span className="flex min-w-0 items-center gap-3">
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: fullSection.color }}
              />
              <span className="truncate" style={{ color: fullSection.color }}>
                {fullSection.title}
              </span>
              <span className="flex-shrink-0 font-mono text-xs font-normal text-gray-500">
                {relLabel}
              </span>
            </span>
          }
          headerExtra={
            <ProgressRing
              value={sectionCompletion(fullSection, wp)}
              size={40}
              color={fullSection.color}
            />
          }
        >
          <div className="mx-auto max-w-3xl">
            <ItemList
              section={fullSection}
              wp={wp}
              onEditItem={(it) => setItemDraft({ sectionId: fullSection.id, item: { ...it } })}
              onToggleCheckbox={toggleCheckbox}
              onToggleTally={toggleTally}
              onToggleChild={toggleChild}
              onRemoveItem={(itemId) => removeItem(fullSection.id, itemId)}
              onReorderItems={(activeId, overId) => reorderItems(fullSection.id, activeId, overId)}
            />
            <div className="mt-4 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setItemDraft({ sectionId: fullSection.id, item: newItem() })}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-gray-300 active:scale-95"
              >
                <PlusIcon className="h-4 w-4" /> Item
              </button>
            </div>
          </div>
        </Modal>
      )}

      <SectionModal draft={sectionDraft} setDraft={setSectionDraft} onClose={() => setSectionDraft(null)} onSave={saveSection} />
      <ItemModal draft={itemDraft} setDraft={setItemDraft} onClose={() => setItemDraft(null)} onSave={saveItem} members={members} />
    </div>
  )
}

// Sortable wrapper: applies the drag transform and hands the handle props to the
// card so only the grip initiates a drag (the rest stays tappable).
function SortableSection({ section, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <SectionCard section={section} dragHandleProps={{ ...attributes, ...listeners }} {...props} />
    </div>
  )
}

function SectionCard({ section, wp, dragHandleProps, onAddItem, onEditItem, onToggleCheckbox, onToggleTally, onToggleChild, onRemoveItem, onReorderItems, onEditSection, onRemoveSection, onOpenFull }) {
  const pct = sectionCompletion(section, wp)

  return (
    <Card>
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
        <button
          type="button"
          {...dragHandleProps}
          aria-label={`Reorder ${section.title}`}
          style={{ touchAction: 'none' }}
          className="-ml-1 flex-shrink-0 cursor-grab rounded-md p-1 text-gray-600 active:cursor-grabbing active:text-gray-300"
        >
          <GripIcon className="h-5 w-5" />
        </button>
        <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: section.color }} />
        {/* Tap the title to open this list full screen. Wraps instead of
            truncating so the name is always fully visible on small screens. */}
        <button
          type="button"
          onClick={onOpenFull}
          title={`Open ${section.title} full screen`}
          className="min-w-0 flex-1 text-left active:opacity-70"
        >
          <h2
            className="break-words text-base font-bold leading-tight sm:text-lg"
            style={{ color: section.color }}
          >
            {section.title}
          </h2>
        </button>
        <ProgressRing value={pct} size={44} color={section.color} />
      </div>

      <ItemList
        section={section}
        wp={wp}
        onEditItem={onEditItem}
        onToggleCheckbox={onToggleCheckbox}
        onToggleTally={onToggleTally}
        onToggleChild={onToggleChild}
        onRemoveItem={onRemoveItem}
        onReorderItems={onReorderItems}
      />

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onAddItem}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-gray-300 active:scale-95"
        >
          <PlusIcon className="h-4 w-4" /> Item
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onEditSection}
          className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-gray-400 active:scale-95"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onRemoveSection}
          aria-label={`Delete ${section.title}`}
          className="rounded-lg bg-loss/15 p-2 text-loss active:scale-95"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}

// Sortable list of one section's goal items — used by both the section card
// and the full-screen view. Drag an item's grip to re-arrange within the list.
function ItemList({ section, wp, onEditItem, onToggleCheckbox, onToggleTally, onToggleChild, onRemoveItem, onReorderItems }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    onReorderItems(active.id, over.id)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={section.items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1">
          {section.items.length === 0 && (
            <li className="px-1 py-2 text-sm text-gray-500">No items yet.</li>
          )}
          {section.items.map((it) => (
            <SortableGoalItem
              key={it.id}
              item={it}
              color={section.color}
              wp={wp}
              onToggle={() => onToggleCheckbox(it.id)}
              onToggleBox={(index) => onToggleTally(it.id, index, it.target)}
              onToggleChild={(childId) => onToggleChild(childId)}
              onEdit={() => onEditItem(it)}
              onRemove={() => onRemoveItem(it.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

// Sortable wrapper for a goal item: renders the row's <li>, applies the drag
// transform, and hands the handle props down so only the grip starts a drag.
function SortableGoalItem({ item, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }
  return (
    <li ref={setNodeRef} style={style} className="relative rounded-lg px-1 py-1.5">
      <GoalItem item={item} dragHandleProps={{ ...attributes, ...listeners }} {...props} />
    </li>
  )
}

function GoalItem({ item, color, wp, dragHandleProps, onToggle, onToggleBox, onToggleChild, onEdit, onRemove }) {
  const kids = item.children || []
  const isGroup = kids.length > 0
  const isTally = !isGroup && item.type === 'tally'
  const complete = itemCompletion(item, wp) >= 1
  const doneCount = kids.filter((c) => wp.children[c.id]).length
  const checks = wp.items[item.id]?.checks || []
  const done = wp.items[item.id]?.done
  const tallyDone = checks.slice(0, item.target).filter(Boolean).length
  // Multi-part items (tally boxes / checklists) fold their parts onto a row
  // beneath the title, toggled by the chevron, so the title keeps the full
  // row width. Checklists start open (matches the old always-visible layout).
  const [open, setOpen] = useState(isGroup)

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          {...dragHandleProps}
          aria-label={`Reorder ${item.title}`}
          style={{ touchAction: 'none' }}
          className="-ml-1 flex-shrink-0 cursor-grab rounded p-0.5 text-gray-700 active:cursor-grabbing active:text-gray-300"
        >
          <GripIcon className="h-4 w-4" />
        </button>

        {isGroup || isTally ? (
          // Read-only progress badge — checks happen on the row beneath.
          <span
            className="flex h-7 min-w-[2.75rem] flex-shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {isGroup ? `${doneCount}/${kids.length}` : `${tallyDone}/${item.target}`}
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-label={`Toggle ${item.title}`}
            className={[
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border-2 active:scale-95',
              done ? 'text-bg' : 'border-border',
            ].join(' ')}
            style={done ? { backgroundColor: color, borderColor: color } : undefined}
          >
            {done && <CheckIcon className="h-5 w-5" />}
          </button>
        )}

        {/* Title wraps instead of truncating so it stays fully visible. */}
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left active:opacity-70">
          <span
            className={[
              'break-words text-sm sm:text-base',
              complete ? 'text-gray-500 line-through' : 'text-gray-100',
            ].join(' ')}
          >
            {item.title}
          </span>
          {item.habit && (
            <StarIcon className="ml-1.5 inline-block h-3.5 w-3.5 text-accent" title="Habit" />
          )}
          {item.note && <span className="ml-1.5 font-mono text-xs text-gray-500">· {item.note}</span>}
        </button>

        {(isGroup || isTally) && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${item.title}`}
            aria-expanded={open}
            className="flex-shrink-0 rounded-md bg-white/5 p-1.5 text-gray-400 active:scale-95"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${item.title}`}
          className="rounded p-1.5 text-gray-600 active:scale-95 active:text-loss"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Tally boxes, on their own row so the title never gets squeezed */}
      {isTally && open && (
        <div className="ml-9 mt-2">
          <TallyBoxes checks={checks} target={item.target} color={color} onToggle={onToggleBox} />
        </div>
      )}

      {/* Sub-items */}
      {isGroup && open && (
        <ul className="ml-9 mt-1 space-y-1 border-l border-border pl-3">
          {kids.map((c) => {
            const cdone = !!wp.children[c.id]
            return (
              <li key={c.id} className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onToggleChild(c.id)}
                  aria-label={`Toggle ${c.title}`}
                  className={[
                    'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2 active:scale-95',
                    cdone ? 'text-bg' : 'border-border',
                  ].join(' ')}
                  style={cdone ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  {cdone && <CheckIcon className="h-4 w-4" />}
                </button>
                <span className={cdone ? 'text-sm text-gray-500 line-through' : 'text-sm text-gray-200'}>
                  {c.title}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SectionModal({ draft, setDraft, onClose, onSave }) {
  if (!draft) return null
  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title="List"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-xs text-gray-500">Name</label>
          <input
            autoFocus
            className={fieldClass}
            placeholder="List name (e.g. Justin's Goals)"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-2 block text-xs text-gray-500">Color</label>
          <div className="flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft({ ...draft, color: c })}
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
      </div>
    </Modal>
  )
}

function ItemModal({ draft, setDraft, onClose, onSave, members }) {
  if (!draft) return null
  const item = draft.item
  const set = (patch) => setDraft({ ...draft, item: { ...item, ...patch } })
  const children = item.children || []
  const hasChildren = children.length > 0
  const habitMembers = item.habitMembers || []
  const toggleHabitMember = (id) =>
    set({
      habitMembers: habitMembers.includes(id)
        ? habitMembers.filter((m) => m !== id)
        : [...habitMembers, id],
    })

  const addChild = () =>
    set({ children: [...children, { id: crypto.randomUUID(), title: '' }] })
  const setChild = (id, title) =>
    set({ children: children.map((c) => (c.id === id ? { ...c, title } : c)) })
  const removeChild = (id) => set({ children: children.filter((c) => c.id !== id) })

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title="Goal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </>
      }
    >
      <div className="space-y-5">
        <input
          autoFocus
          className={fieldClass}
          placeholder="Goal (e.g. Work out, Father's Day Cards)"
          value={item.title}
          onChange={(e) => set({ title: e.target.value })}
        />

        {/* Two columns: settings on the left, the sub-item checklist on the
            right, so tall lists spread sideways instead of forcing a scroll. */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            {/* Type only applies to a single goal (no sub-items). */}
            {!hasChildren && (
              <div>
                <label className="mb-2 block text-xs text-gray-500">Type</label>
                <div className="flex gap-2">
                  {[
                    { id: 'checkbox', label: 'Checkbox' },
                    { id: 'tally', label: 'Tally boxes' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => set({ type: t.id })}
                      className={[
                        'flex-1 rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
                        item.type === t.id ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
                      ].join(' ')}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!hasChildren && item.type === 'tally' && (
              <div>
                <label className="mb-1 block text-xs text-gray-500">Number of boxes</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={fieldClass}
                  value={item.target}
                  onChange={(e) => set({ target: e.target.value })}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-gray-500">Note (optional)</label>
              <input
                className={fieldClass}
                placeholder="e.g. 215 hours, $4,157.50"
                value={item.note}
                onChange={(e) => set({ note: e.target.value })}
              />
            </div>

            {/* Habit: also track this goal on the Habits page, where each check
                earns a point toward the reward shop. Not available for
                checklists (points are per check, not per sub-item). */}
            {!hasChildren && (
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StarIcon className="h-4 w-4 text-accent" />
                    <span className="text-sm font-semibold text-gray-200">Track as Habit</span>
                  </div>
                  <Toggle
                    checked={!!item.habit}
                    onChange={(v) => set({ habit: v })}
                    label="Track as Habit"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Shows on the Habits page — every check earns a point.
                </p>
                {item.habit && (
                  <div className="mt-3">
                    <label className="mb-2 block text-xs text-gray-500">
                      Whose habit? <span className="text-gray-600">(none = everyone)</span>
                    </label>
                    <MemberPicker
                      members={members || []}
                      selected={habitMembers}
                      onToggle={toggleHabitMember}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sub-items / checklist */}
          <div>
            <label className="mb-2 block text-xs text-gray-500">
              Sub-items {hasChildren && <span className="text-gray-600">(turns this into a checklist)</span>}
            </label>
            <div className="space-y-2">
              {children.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    className={fieldClass}
                    placeholder="Sub-item (e.g. Papa Hui)"
                    value={c.title}
                    onChange={(e) => setChild(c.id, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeChild(c.id)}
                    aria-label="Remove sub-item"
                    className="rounded-lg bg-loss/15 p-3 text-loss active:scale-95"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addChild}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-300 active:scale-95"
              >
                <PlusIcon className="h-4 w-4" /> Add sub-item
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
