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
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useLocalState } from '../lib/storage.js'
import {
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  GripIcon,
  PlusIcon,
  TrashIcon,
} from '../components/Icons.jsx'
import { GOALS_SEED as SEED } from '../lib/seeds.js'

// Section accent palette (tap to pick when creating/editing a section).
const COLORS = ['#39D353', '#58A6FF', '#F0883E', '#BC8CFF', '#F85149', '#D29922', '#8B949E']

// Default calendar category colors (mirrors Calendar.jsx) for the Upcoming
// Events list, used as a fallback when no stored categories match.
const CAL_COLORS = {
  Work: '#58A6FF',
  Personal: '#39D353',
  Health: '#F85149',
  Family: '#BC8CFF',
  Other: '#8B949E',
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
})

export default function Goals() {
  const [sections, setSections] = useLocalState('goals-sections', SEED)
  const [progress, setProgress] = useLocalState('goals-progress', {}) // weekKey -> { items, children }
  const [calendarEvents] = useLocalState('calendar-events', []) // read-only, shared with Calendar
  const [calendarCategories] = useLocalState('calendar-categories', []) // read-only, for colors
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [sectionDraft, setSectionDraft] = useState(null)
  const [itemDraft, setItemDraft] = useState(null) // { sectionId, item }

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
    return match?.color || CAL_COLORS[e.category] || '#8B949E'
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
    const item = {
      ...itemDraft.item,
      title: itemDraft.item.title.trim(),
      target: Math.max(1, Number(itemDraft.item.target) || 1),
      children: (itemDraft.item.children || [])
        .map((c) => ({ id: c.id, title: c.title.trim() }))
        .filter((c) => c.title),
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
                onEditSection={() => setSectionDraft({ ...section })}
                onRemoveSection={() => removeSection(section.id)}
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
            <ul className="space-y-2">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: eventColor(e) }}
                  />
                  <span className="flex-1 truncate text-gray-200">{e.title}</span>
                  <span className="font-mono text-xs text-gray-400">
                    {new Date(`${evDate(e)}T${evTime(e) || '00:00'}`).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <SectionModal draft={sectionDraft} setDraft={setSectionDraft} onClose={() => setSectionDraft(null)} onSave={saveSection} />
      <ItemModal draft={itemDraft} setDraft={setItemDraft} onClose={() => setItemDraft(null)} onSave={saveItem} />
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

function SectionCard({ section, wp, dragHandleProps, onAddItem, onEditItem, onToggleCheckbox, onToggleTally, onToggleChild, onRemoveItem, onEditSection, onRemoveSection }) {
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
        <h2 className="flex-1 truncate text-lg font-bold" style={{ color: section.color }}>
          {section.title}
        </h2>
        <ProgressRing value={pct} size={44} color={section.color} />
      </div>

      <ul className="space-y-1">
        {section.items.length === 0 && (
          <li className="px-1 py-2 text-sm text-gray-500">No items yet.</li>
        )}
        {section.items.map((it) => (
          <GoalItem
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

function GoalItem({ item, color, wp, onToggle, onToggleBox, onToggleChild, onEdit, onRemove }) {
  const kids = item.children || []
  const isGroup = kids.length > 0
  const complete = itemCompletion(item, wp) >= 1
  const doneCount = kids.filter((c) => wp.children[c.id]).length
  const checks = wp.items[item.id]?.checks || []
  const done = wp.items[item.id]?.done
  const tallyDone = checks.slice(0, item.target).filter(Boolean).length

  return (
    <li className="rounded-lg px-1 py-1.5">
      <div className="flex items-center gap-3">
        {isGroup ? (
          <span
            className="flex h-7 min-w-[2.75rem] flex-shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {doneCount}/{kids.length}
          </span>
        ) : item.type === 'checkbox' ? (
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
        ) : (
          <TallyBoxes checks={checks} target={item.target} color={color} onToggle={onToggleBox} />
        )}

        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 items-center gap-2 truncate text-left active:opacity-70"
        >
          <span className={complete ? 'truncate text-gray-500 line-through' : 'truncate text-gray-100'}>
            {item.title}
          </span>
          {!isGroup && item.type === 'tally' && (
            <span className="font-mono text-xs text-gray-500">
              {tallyDone}/{item.target}
            </span>
          )}
          {item.note && <span className="font-mono text-xs text-gray-500">· {item.note}</span>}
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${item.title}`}
          className="rounded p-1.5 text-gray-600 active:scale-95 active:text-loss"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Sub-items */}
      {isGroup && (
        <ul className="ml-6 mt-1 space-y-1 border-l border-border pl-3">
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
    </li>
  )
}

// Row of tappable boxes. Each box toggles independently and shows a check mark.
function TallyBoxes({ checks, target, color, onToggle }) {
  return (
    <div className="flex flex-shrink-0 flex-wrap gap-1.5">
      {Array.from({ length: target }, (_, i) => {
        const filled = !!checks[i]
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            aria-label={`Toggle box ${i + 1}`}
            className="flex h-7 w-7 items-center justify-center rounded border-2 active:scale-90"
            style={
              filled
                ? { backgroundColor: color, borderColor: color, color: '#0D1117' }
                : { borderColor: '#30363D' }
            }
          >
            {filled && <CheckIcon className="h-4 w-4" />}
          </button>
        )
      })}
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

function ItemModal({ draft, setDraft, onClose, onSave }) {
  if (!draft) return null
  const item = draft.item
  const set = (patch) => setDraft({ ...draft, item: { ...item, ...patch } })
  const children = item.children || []
  const hasChildren = children.length > 0

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
