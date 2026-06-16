import { useEffect, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Card, { PageHeader } from '../components/Card.jsx'
import Tabs from '../components/Tabs.jsx'
import Toggle from '../components/Toggle.jsx'
import Slider from '../components/Slider.jsx'
import { CheckIcon, GripIcon, MuteIcon, PencilIcon, PlusIcon, VolumeIcon } from '../components/Icons.jsx'
import { MEMBER_COLORS, MemberBadge, MemberModal } from '../components/Member.jsx'
import { Button } from '../components/Modal.jsx'
import { THEMES, useSettings } from '../lib/settings.jsx'
import { useLocalState } from '../lib/storage.js'
import { pageById, reconcileMenu } from '../lib/menu.js'
import { SEED_MEMBERS } from '../lib/seeds.js'

const TABS = [
  { id: 'themes', label: 'Themes' },
  { id: 'menu', label: 'Menu' },
  { id: 'household', label: 'Household' },
]

export default function Settings() {
  const [tab, setTab] = useState('themes')

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </PageHeader>

      {tab === 'themes' && <ThemesTab />}
      {tab === 'menu' && <MenuTab />}
      {tab === 'household' && <HouseholdTab />}
    </div>
  )
}

// Household members are shared with the Meals page (and now Calendar) via the
// 'meals-members' storage key. This is a full add/edit/manage surface; Meals
// keeps its own Add Member button too.
function HouseholdTab() {
  const [members, setMembers] = useLocalState('meals-members', SEED_MEMBERS)
  const [, setCalendarEvents] = useLocalState('calendar-events', [])
  const [, setPlans] = useLocalState('meals-plan', {})
  const [draft, setDraft] = useState(null)

  const saveMember = () => {
    if (!draft.name.trim()) return
    const m = { ...draft, name: draft.name.trim() }
    setMembers((list) => {
      const exists = list.some((x) => x.id === m.id)
      return exists ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m]
    })
    setDraft(null)
  }

  const deleteMember = (id) => {
    setMembers((list) => list.filter((m) => m.id !== id))
    // Drop the member from any calendar events they were assigned to.
    setCalendarEvents((list) =>
      Array.isArray(list)
        ? list.map((e) =>
            e && Array.isArray(e.members) && e.members.includes(id)
              ? { ...e, members: e.members.filter((x) => x !== id) }
              : e,
          )
        : list,
    )
    // Drop the member from every meal-plan provider/guest list across all weeks.
    setPlans((p) => {
      if (!p || typeof p !== 'object') return p
      const next = {}
      for (const [wk, days] of Object.entries(p)) {
        next[wk] = {}
        for (const [day, slots] of Object.entries(days || {})) {
          next[wk][day] = {}
          for (const [slot, val] of Object.entries(slots || {})) {
            next[wk][day][slot] =
              val && typeof val === 'object'
                ? {
                    ...val,
                    providers: (val.providers || []).filter((x) => x !== id),
                    guests: (val.guests || []).filter((x) => x !== id),
                  }
                : val
          }
        }
      }
      return next
    })
    setDraft(null)
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-300">Household Members</h2>
          <p className="text-sm text-gray-400">
            Shared with Meals and Calendar — assign members to events and meal slots.
          </p>
        </div>
        <Button
          onClick={() => setDraft({ id: crypto.randomUUID(), name: '', color: MEMBER_COLORS[0] })}
        >
          <span className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" /> Member
          </span>
        </Button>
      </div>

      {members.length === 0 ? (
        <Card className="text-sm text-gray-500">Add household members to get started.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((mem) => (
            <Card key={mem.id} style={{ borderColor: `${mem.color}66` }}>
              <div className="flex items-center gap-3">
                <MemberBadge member={mem} size={40} />
                <h3 className="flex-1 truncate text-lg font-bold" style={{ color: mem.color }}>
                  {mem.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setDraft({ ...mem })}
                  aria-label={`Edit ${mem.name}`}
                  className="rounded-lg bg-white/5 p-2 text-gray-300 active:scale-95"
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <MemberModal
        draft={draft}
        setDraft={setDraft}
        onClose={() => setDraft(null)}
        onSave={saveMember}
        onDelete={() => deleteMember(draft.id)}
        isExisting={draft && members.some((m) => m.id === draft.id)}
      />
    </>
  )
}

function ThemesTab() {
  const { theme, setTheme, soundOn, setSoundOn, volume, setVolume } = useSettings()
  const current = THEMES.find((t) => t.id === theme)

  return (
    <>
      {/* Theme picker */}
      <h2 className="mb-3 text-lg font-semibold text-gray-300">Theme</h2>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {THEMES.map((t) => {
          const active = t.id === theme
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={[
                'relative overflow-hidden rounded-2xl border p-4 text-left transition-all active:scale-[0.98]',
                active ? 'border-accent shadow-glow' : 'border-border',
              ].join(' ')}
              style={{ backgroundColor: t.colors.surface }}
            >
              {active && (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-bg">
                  <CheckIcon className="h-4 w-4" />
                </span>
              )}
              {/* Swatch */}
              <div className="mb-3 flex gap-1.5">
                {[t.colors.bg, t.colors.surface, t.colors.accent].map((c, i) => (
                  <span
                    key={i}
                    className="h-8 w-8 rounded-lg border border-white/10"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="font-bold text-white">{t.name}</div>
              <div className="mt-0.5 font-mono text-xs" style={{ color: t.colors.accent }}>
                {t.soundLabel}
              </div>
            </button>
          )
        })}
      </div>

      {/* Sound controls */}
      <h2 className="mb-3 text-lg font-semibold text-gray-300">Ambient Sound</h2>
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {soundOn ? (
              <VolumeIcon className="h-6 w-6 text-accent" />
            ) : (
              <MuteIcon className="h-6 w-6 text-gray-500" />
            )}
            <div>
              <div className="font-semibold text-white">Play ambient sound</div>
              <div className="text-sm text-gray-400">
                {current?.sound
                  ? `Plays “${current.soundLabel}” with the ${current.name} theme`
                  : `The ${current?.name} theme is silent — pick Ocean, Forest, or Moon & Sky for sound`}
              </div>
            </div>
          </div>
          <Toggle checked={soundOn} label="Ambient sound" onChange={setSoundOn} />
        </div>

        <div className={soundOn ? 'mt-6' : 'mt-6 opacity-40'}>
          <div className="mb-2 flex items-center justify-between text-sm text-gray-400">
            <span>Volume</span>
            <span className="font-mono text-white">{volume}</span>
          </div>
          <Slider value={volume} disabled={!soundOn} ariaLabel="Ambient volume" onChange={setVolume} />
        </div>
      </Card>

      <p className="mt-4 text-xs text-gray-600">
        Sounds are generated on the device (Web Audio) — no files or network needed. Browsers may
        wait for your first tap before audio starts.
      </p>
    </>
  )
}

function MenuTab() {
  const [config, setConfig] = useLocalState('menu-config', null, reconcileMenu)

  return (
    <>
      <h2 className="mb-1 text-lg font-semibold text-gray-300">Sidebar Menu</h2>
      <p className="mb-5 text-sm text-gray-400">
        Drag pages between the two bins to add or remove them, and drag within a bin to reorder. The{' '}
        <span className="font-semibold text-gray-300">Menu</span> bin is what shows in the sidebar.
      </p>
      <MenuBoard config={config} onChange={setConfig} />
    </>
  )
}

// Two-bin drag board: "Menu" (sidebar contents/order) and "Available" (pool of
// pages not in the menu). Mirrors the Meals grocery board — items can be
// reordered within a bin or dragged across, with a line showing the drop spot.
function MenuBoard({ config, onChange }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [cols, setCols] = useState(config)
  const [activeId, setActiveId] = useState(null)
  const [overId, setOverId] = useState(null)

  // Re-sync from the persisted config whenever it changes — but not mid-drag,
  // so a live cross-bin move isn't clobbered by a re-render.
  useEffect(() => {
    if (!activeId) setCols(config)
  }, [config, activeId])

  const findColumn = (id) => {
    if (cols[id]) return id // a bin id ('menu' / 'pool')
    return Object.keys(cols).find((c) => cols[c].includes(id))
  }

  const onDragStart = ({ active }) => {
    setActiveId(active.id)
    setOverId(active.id)
  }

  const onDragOver = ({ active, over }) => {
    setOverId(over?.id ?? null)
    if (!over) return
    const from = findColumn(active.id)
    const to = findColumn(over.id)
    if (!from || !to || from === to) return
    setCols((prev) => {
      if (!prev[from].includes(active.id)) return prev
      const toList = prev[to]
      let idx = toList.indexOf(over.id)
      if (idx === -1) idx = toList.length
      return {
        ...prev,
        [from]: prev[from].filter((id) => id !== active.id),
        [to]: [...toList.slice(0, idx), active.id, ...toList.slice(idx)],
      }
    })
  }

  const onDragEnd = ({ active, over }) => {
    let next = cols
    const from = findColumn(active.id)
    const to = over ? findColumn(over.id) : from
    if (from && to && from === to) {
      const list = cols[from]
      const oldIdx = list.indexOf(active.id)
      const newIdx = list.indexOf(over.id)
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        next = { ...cols, [from]: arrayMove(list, oldIdx, newIdx) }
      }
    }
    setCols(next)
    setActiveId(null)
    setOverId(null)
    onChange(next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <MenuBin
          id="menu"
          title="Menu"
          subtitle="Shown in the sidebar"
          accent="rgb(var(--c-accent))"
          items={cols.menu}
          activeId={activeId}
          overId={overId}
        />
        <MenuBin
          id="pool"
          title="Available"
          subtitle="Drag in to add to the menu"
          accent="#8B949E"
          items={cols.pool}
          activeId={activeId}
          overId={overId}
        />
      </div>
      <DragOverlay>
        {activeId && pageById[activeId] ? <MenuRow page={pageById[activeId]} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function MenuBin({ id, title, subtitle, accent, items, activeId, overId }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const empty = items.length === 0
  // Highlight when hovering the bin itself or any item inside it.
  const active = isOver || items.some((pid) => pid === overId)
  return (
    <Card style={{ borderColor: active ? accent : undefined }}>
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="flex-1 font-bold text-white">{title}</h3>
        <span className="font-mono text-xs text-gray-500">{items.length}</span>
      </div>
      <p className="mb-3 text-xs text-gray-500">{subtitle}</p>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="min-h-[3.5rem] space-y-1.5">
          {empty ? (
            <li
              className={[
                'rounded-xl border border-dashed py-6 text-center text-sm',
                isOver ? 'border-accent text-accent' : 'border-border text-gray-600',
              ].join(' ')}
            >
              {isOver ? 'Drop here' : 'Empty'}
            </li>
          ) : (
            items.map((pid) => (
              <SortableMenuItem
                key={pid}
                page={pageById[pid]}
                showLine={overId === pid && activeId !== pid}
              />
            ))
          )}
        </ul>
      </SortableContext>
    </Card>
  )
}

function SortableMenuItem({ page, showLine }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <li ref={setNodeRef} style={style}>
      {/* Drop indicator line. */}
      <div className={['mb-1 h-0.5 rounded-full', showLine ? 'bg-accent' : 'bg-transparent'].join(' ')} />
      <MenuRow page={page} dragHandleProps={{ ...attributes, ...listeners }} />
    </li>
  )
}

// Shared row markup, reused by the live list and the lifted drag overlay.
function MenuRow({ page, dragHandleProps, dragging }) {
  const { Icon, label } = page
  return (
    <div
      {...dragHandleProps}
      style={{ touchAction: 'none' }}
      className={[
        'flex cursor-grab items-center gap-3 rounded-xl px-3 py-3 active:cursor-grabbing',
        dragging ? 'scale-[1.03] bg-surface shadow-glow' : 'bg-white/5',
      ].join(' ')}
    >
      <GripIcon className="h-5 w-5 flex-shrink-0 text-gray-600" />
      <Icon className="h-6 w-6 flex-shrink-0 text-gray-300" />
      <span className="flex-1 truncate font-medium text-white">{label}</span>
    </div>
  )
}
