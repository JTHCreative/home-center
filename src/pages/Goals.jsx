import { useEffect, useMemo, useState } from 'react'
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
import { readStored, useLocalState } from '../lib/storage.js'
import { CheckIcon, GripIcon, PlusIcon, TrashIcon } from '../components/Icons.jsx'

// Section accent palette (tap to pick when creating/editing a section).
const COLORS = ['#39D353', '#58A6FF', '#F0883E', '#BC8CFF', '#F85149', '#D29922', '#8B949E']

const RESETS = [
  { id: 'none', label: 'Never' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

// Calendar category colors (mirrors Calendar.jsx) for the Upcoming Events list.
const CAL_COLORS = {
  Work: '#58A6FF',
  Personal: '#39D353',
  Health: '#F85149',
  Family: '#BC8CFF',
  Other: '#8B949E',
}

// --- Period keys: identify which period a section currently belongs to. ------
function currentPeriodKey(reset, now = new Date()) {
  if (reset === 'monthly') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  if (reset === 'weekly') {
    const offset = (now.getDay() + 6) % 7 // week starts Monday
    const monday = new Date(now)
    monday.setDate(now.getDate() - offset)
    return `W-${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  }
  if (reset === 'daily') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
  return null // 'none' — never resets
}

// Reset a section's items (and any sub-items) when its period has rolled over.
function withResets(sections) {
  let changed = false
  const next = sections.map((s) => {
    if (!s.reset || s.reset === 'none') return s
    const key = currentPeriodKey(s.reset)
    if (s.periodKey === key) return s
    changed = true
    return {
      ...s,
      periodKey: key,
      items: s.items.map((it) => ({
        ...it,
        done: false,
        checks: [],
        children: (it.children || []).map((c) => ({ ...c, done: false })),
      })),
    }
  })
  return changed ? next : sections
}

const SEED = [
  { id: crypto.randomUUID(), title: "Justin's Goals", color: '#39D353', reset: 'none', periodKey: null, items: [] },
  { id: crypto.randomUUID(), title: "Kitty's Goals", color: '#F0883E', reset: 'none', periodKey: null, items: [] },
  { id: crypto.randomUUID(), title: 'Weekly Goals', color: '#58A6FF', reset: 'weekly', periodKey: currentPeriodKey('weekly'), items: [] },
]

// Completion as a 0–1 fraction. Items with sub-items roll up their children.
function itemCompletion(it) {
  const kids = it.children || []
  if (kids.length > 0) {
    return kids.filter((c) => c.done).length / kids.length
  }
  if (it.type === 'tally') {
    const checked = (it.checks || []).slice(0, it.target).filter(Boolean).length
    return it.target ? Math.max(0, Math.min(1, checked / it.target)) : 0
  }
  return it.done ? 1 : 0
}

const sectionCompletion = (s) =>
  s.items.length === 0
    ? 0
    : (s.items.reduce((sum, it) => sum + itemCompletion(it), 0) / s.items.length) * 100

const newSection = () => ({
  id: crypto.randomUUID(),
  title: '',
  color: COLORS[1],
  reset: 'none',
  periodKey: null,
  items: [],
})

const newItem = () => ({
  id: crypto.randomUUID(),
  title: '',
  type: 'checkbox',
  target: 7,
  checks: [], // per-box state for tally type (each box toggles independently)
  done: false,
  note: '',
  children: [],
})

const iso = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Goals() {
  const [sections, setSections] = useLocalState('goals-sections', SEED)
  const [sectionDraft, setSectionDraft] = useState(null)
  const [itemDraft, setItemDraft] = useState(null) // { sectionId, item }

  // Apply section resets on mount and every minute (covers rollover while the
  // kiosk stays open).
  useEffect(() => {
    setSections((s) => withResets(s))
    const id = setInterval(() => setSections((s) => withResets(s)), 60_000)
    return () => clearInterval(id)
  }, [setSections])

  // Upcoming events pulled (read-only) from the Calendar page's stored events.
  const upcoming = useMemo(() => {
    const today = iso(new Date())
    const events = readStored('calendar-events', [])
    return events
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 8)
  }, [])

  // --- Section ops ----------------------------------------------------------
  const saveSection = () => {
    if (!sectionDraft.title.trim()) return
    const draft = {
      ...sectionDraft,
      title: sectionDraft.title.trim(),
      periodKey: currentPeriodKey(sectionDraft.reset),
    }
    setSections((list) => {
      const exists = list.some((s) => s.id === draft.id)
      return exists ? list.map((s) => (s.id === draft.id ? draft : s)) : [...list, draft]
    })
    setSectionDraft(null)
  }
  const removeSection = (id) => setSections((list) => list.filter((s) => s.id !== id))

  // Drag-to-reorder sections. A small distance threshold keeps taps on the
  // handle from being treated as drags; works for both touch and mouse.
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
  const patchItem = (sectionId, itemId, patch) =>
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
          : s,
      ),
    )

  const toggleChild = (sectionId, itemId, childId) =>
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((it) =>
                it.id === itemId
                  ? {
                      ...it,
                      children: it.children.map((c) =>
                        c.id === childId ? { ...c, done: !c.done } : c,
                      ),
                    }
                  : it,
              ),
            }
          : s,
      ),
    )

  // Toggle a single tally box independently of the others.
  const toggleTally = (sectionId, itemId, index) =>
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((it) => {
                if (it.id !== itemId) return it
                const checks = Array.from({ length: it.target }, (_, i) => it.checks?.[i] || false)
                checks[index] = !checks[index]
                return { ...it, checks }
              }),
            }
          : s,
      ),
    )

  const saveItem = () => {
    if (!itemDraft.item.title.trim()) return
    const target = Math.max(1, Number(itemDraft.item.target) || 1)
    const item = {
      ...itemDraft.item,
      title: itemDraft.item.title.trim(),
      target,
      // Resize the per-box state to the (possibly changed) target.
      checks:
        itemDraft.item.type === 'tally'
          ? Array.from({ length: target }, (_, i) => itemDraft.item.checks?.[i] || false)
          : [],
      children: (itemDraft.item.children || [])
        .map((c) => ({ ...c, title: c.title.trim() }))
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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Goals" subtitle="Color-coded lists, optional auto-reset">
        <Button onClick={() => setSectionDraft(newSection())}>
          <span className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" /> Add List
          </span>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={rectSortingStrategy}>
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                onAddItem={() => setItemDraft({ sectionId: section.id, item: newItem() })}
                onEditItem={(it) => setItemDraft({ sectionId: section.id, item: { ...it } })}
                onPatchItem={(itemId, patch) => patchItem(section.id, itemId, patch)}
                onToggleChild={(itemId, childId) => toggleChild(section.id, itemId, childId)}
                onToggleTally={(itemId, index) => toggleTally(section.id, itemId, index)}
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
                    style={{ backgroundColor: CAL_COLORS[e.category] || '#8B949E' }}
                  />
                  <span className="flex-1 truncate text-gray-200">{e.title}</span>
                  <span className="font-mono text-xs text-gray-400">
                    {new Date(`${e.date}T${e.time}`).toLocaleDateString([], {
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

function SectionCard({ section, dragHandleProps, onAddItem, onEditItem, onPatchItem, onToggleChild, onToggleTally, onRemoveItem, onEditSection, onRemoveSection }) {
  const pct = sectionCompletion(section)
  const resetLabel = RESETS.find((r) => r.id === (section.reset || 'none')).label

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
        {section.reset && section.reset !== 'none' && (
          <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] uppercase text-gray-400">
            {resetLabel}
          </span>
        )}
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
            onToggle={() => onPatchItem(it.id, { done: !it.done })}
            onToggleBox={(index) => onToggleTally(it.id, index)}
            onToggleChild={(childId) => onToggleChild(it.id, childId)}
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

function GoalItem({ item, color, onToggle, onToggleBox, onToggleChild, onEdit, onRemove }) {
  const kids = item.children || []
  const isGroup = kids.length > 0
  const complete = itemCompletion(item) >= 1
  const doneCount = kids.filter((c) => c.done).length
  const tallyDone = (item.checks || []).slice(0, item.target).filter(Boolean).length

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
              item.done ? 'text-bg' : 'border-border',
            ].join(' ')}
            style={item.done ? { backgroundColor: color, borderColor: color } : undefined}
          >
            {item.done && <CheckIcon className="h-5 w-5" />}
          </button>
        ) : (
          <TallyBoxes checks={item.checks || []} target={item.target} color={color} onToggle={onToggleBox} />
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
          {kids.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onToggleChild(c.id)}
                aria-label={`Toggle ${c.title}`}
                className={[
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2 active:scale-95',
                  c.done ? 'text-bg' : 'border-border',
                ].join(' ')}
                style={c.done ? { backgroundColor: color, borderColor: color } : undefined}
              >
                {c.done && <CheckIcon className="h-4 w-4" />}
              </button>
              <span className={c.done ? 'text-sm text-gray-500 line-through' : 'text-sm text-gray-200'}>
                {c.title}
              </span>
            </li>
          ))}
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
      <div className="space-y-4">
        <input
          autoFocus
          className={fieldClass}
          placeholder="List name (e.g. Justin's Goals)"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />

        <div>
          <label className="mb-2 block text-xs text-gray-500">Color</label>
          <div className="flex flex-wrap gap-3">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft({ ...draft, color: c })}
                aria-label={`Color ${c}`}
                className="h-9 w-9 rounded-full active:scale-90"
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
          <label className="mb-2 block text-xs text-gray-500">Auto-reset</label>
          <div className="flex flex-wrap gap-2">
            {RESETS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setDraft({ ...draft, reset: r.id })}
                className={[
                  'rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95',
                  draft.reset === r.id ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
                ].join(' ')}
              >
                {r.label}
              </button>
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
    set({ children: [...children, { id: crypto.randomUUID(), title: '', done: false }] })
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
      <div className="space-y-4">
        <input
          autoFocus
          className={fieldClass}
          placeholder="Goal (e.g. Work out, Father's Day Cards)"
          value={item.title}
          onChange={(e) => set({ title: e.target.value })}
        />

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
    </Modal>
  )
}
