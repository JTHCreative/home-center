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
import Modal, { Button } from '../components/Modal.jsx'
import Toggle from '../components/Toggle.jsx'
import Slider from '../components/Slider.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useLocalState } from '../lib/storage.js'
import { fetchQuotes, hasFinnhubKey } from '../lib/finnhub.js'
import {
  CheckIcon,
  GearIcon,
  GripIcon,
  MoonIcon,
  PowerIcon,
  SunIcon,
  SunriseIcon,
  VolumeIcon,
} from '../components/Icons.jsx'
// Seed defaults are shared with the source pages (one source of truth) so the
// dashboard sees the same items/IDs even before those pages have been opened.
import {
  DEFAULT_SMART_HOME,
  DEFAULT_WATCHLISTS,
  GOALS_SEED,
  SEED_MEALS,
} from '../lib/seeds.js'

// --- Module registry ---------------------------------------------------------
// The dashboard is a customizable stack of "modules", each a compact, live view
// of another page. Order, visibility, and per-module settings are all persisted
// (and shared across devices) under the single `dashboard` state key.
const MODULES = [
  { id: 'meals', title: "Today's Meals" },
  { id: 'smarthome', title: 'Smart Home' },
  { id: 'stocks', title: 'Stocks & Crypto' },
  { id: 'goals', title: 'Goals' },
  { id: 'calendar', title: "Today's Events" },
]
const MODULE_IDS = MODULES.map((m) => m.id)
const TITLE = Object.fromEntries(MODULES.map((m) => [m.id, m.title]))
// Modules that expose a settings gear (the others have nothing to configure).
const CONFIGURABLE = new Set(['smarthome', 'stocks', 'goals'])

const DEFAULT_DASHBOARD = {
  order: [...MODULE_IDS],
  enabled: { meals: true, smarthome: true, stocks: true, goals: true, calendar: true },
  settings: {
    smarthome: { controls: [] }, // [{ kind:'light', room, id } | { kind:'plug', id } | { kind:'media' }]
    stocks: { watchlistId: null }, // null → first watchlist
    goals: { sectionId: null }, // null → first list
  },
}

// Fold older/partial saved configs into the current shape: append any module
// added since the config was written, and backfill missing settings.
function migrateDashboard(stored) {
  if (!stored || typeof stored !== 'object') return DEFAULT_DASHBOARD
  const order = Array.isArray(stored.order) ? stored.order.filter((id) => MODULE_IDS.includes(id)) : []
  for (const id of MODULE_IDS) if (!order.includes(id)) order.push(id)
  return {
    order,
    enabled: { ...DEFAULT_DASHBOARD.enabled, ...(stored.enabled || {}) },
    settings: {
      smarthome: { ...DEFAULT_DASHBOARD.settings.smarthome, ...(stored.settings?.smarthome || {}) },
      stocks: { ...DEFAULT_DASHBOARD.settings.stocks, ...(stored.settings?.stocks || {}) },
      goals: { ...DEFAULT_DASHBOARD.settings.goals, ...(stored.settings?.goals || {}) },
    },
  }
}

// --- Shared date helpers (local, weeks start Sunday) -------------------------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOTS = ['Breakfast', 'Lunch', 'Dinner']
const SLOT_THEME = {
  Breakfast: { color: '#D29922', Icon: SunriseIcon },
  Lunch: { color: '#39D353', Icon: SunIcon },
  Dinner: { color: '#58A6FF', Icon: MoonIcon },
}
const CAL_COLORS = {
  Work: '#58A6FF',
  Personal: '#39D353',
  Health: '#F85149',
  Family: '#BC8CFF',
  Other: '#8B949E',
}

const iso = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const sundayOf = (d) => {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  c.setDate(c.getDate() - c.getDay())
  return c
}
const weekKeyNow = () => iso(sundayOf(new Date()))
const dayNameNow = () => DAYS[new Date().getDay()]

// Meals plan can be a flat (legacy) or week-keyed map; fold flat into this week.
const DAY_SET = new Set(DAYS)
function migratePlan(stored) {
  if (!stored || typeof stored !== 'object') return {}
  const keys = Object.keys(stored)
  if (keys.length && keys.some((k) => DAY_SET.has(k))) return { [weekKeyNow()]: stored }
  return stored
}
const slotMealId = (v) => (typeof v === 'string' ? v : v?.mealId || undefined)

// --- Stocks helpers ----------------------------------------------------------
const money = (n) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const display = (symbol) => symbol.split(':').pop().replace('USDT', '').replace('USD', '')

// Deterministic mock quote so the module renders without a Finnhub key.
function mockQuote(symbol) {
  let seed = 0
  for (const ch of symbol) seed = (seed * 31 + ch.charCodeAt(0)) % 100000
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const price = 20 + rnd() * 480
  const changePercent = (rnd() - 0.45) * 6
  const change = (price * changePercent) / 100
  return { price, change, changePercent }
}

// Live (or mock) quotes for a symbol list, refreshed each minute.
function useQuotes(symbols) {
  const key = symbols.join(',')
  const [quotes, setQuotes] = useState({})
  const [updatedAt, setUpdatedAt] = useState(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const syms = key ? key.split(',') : []
      if (!syms.length) {
        setQuotes({})
        return
      }
      if (!hasFinnhubKey) {
        const next = {}
        for (const s of syms) next[s] = mockQuote(s)
        if (!cancelled) {
          setQuotes(next)
          setUpdatedAt(new Date())
        }
        return
      }
      const live = await fetchQuotes(syms)
      if (!cancelled) {
        setQuotes(live)
        setUpdatedAt(new Date())
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [key])
  return { quotes, updatedAt }
}

// --- Goals completion helpers (mirror Goals.jsx) -----------------------------
const EMPTY_WEEK = { items: {}, children: {} }
function itemCompletion(item, wp) {
  const kids = item.children || []
  if (kids.length > 0) return kids.filter((c) => wp.children[c.id]).length / kids.length
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

// A stable key for a smart-home control reference.
const ctrlKey = (c) => (c.kind === 'media' ? 'media' : `${c.kind}:${c.room || ''}:${c.id}`)

// =============================================================================
// Module bodies
// =============================================================================

function MealsModule() {
  const [meals] = useLocalState('meals-recipes', SEED_MEALS)
  const [plans] = useLocalState('meals-plan', {}, migratePlan)
  const mealById = useMemo(() => Object.fromEntries(meals.map((m) => [m.id, m])), [meals])
  const plan = plans[weekKeyNow()] || {}
  const day = dayNameNow()

  return (
    <div className="space-y-2">
      {SLOTS.map((slot) => {
        const theme = SLOT_THEME[slot]
        const SlotIcon = theme.Icon
        const meal = mealById[slotMealId(plan[day]?.[slot])]
        const takeout = meal && (meal.type || 'recipe') === 'takeout'
        return (
          <div
            key={slot}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: `${theme.color}14`, borderLeft: `4px solid ${theme.color}` }}
          >
            <SlotIcon className="h-6 w-6 flex-shrink-0" style={{ color: theme.color }} />
            <span className="w-20 flex-shrink-0 text-sm font-semibold" style={{ color: theme.color }}>
              {slot}
            </span>
            {meal ? (
              <span className="flex-1 truncate font-medium text-white">
                {meal.name}
                <span className="ml-2 font-mono text-[10px] uppercase text-gray-500">
                  {takeout ? 'Takeout' : 'Homecooked'}
                </span>
              </span>
            ) : (
              <span className="flex-1 truncate text-sm text-gray-600">Nothing planned</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SmartHomeModule({ controls }) {
  const [state, setState] = useLocalState('smart-home', DEFAULT_SMART_HOME)

  const setLight = (room, id, patch) =>
    setState((s) => ({
      ...s,
      lights: { ...s.lights, [room]: s.lights[room].map((l) => (l.id === id ? { ...l, ...patch } : l)) },
    }))
  const setPlug = (id, patch) =>
    setState((s) => ({ ...s, plugs: s.plugs.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  const setMedia = (patch) => setState((s) => ({ ...s, media: { ...s.media, ...patch } }))

  if (!controls || controls.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No favorites yet. Use the <GearIcon className="inline h-4 w-4" /> in customize mode to pick the
        controls you use most.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {controls.map((c) => {
        if (c.kind === 'light') {
          const light = (state.lights[c.room] || []).find((l) => l.id === c.id)
          if (!light) return null
          return (
            <div key={ctrlKey(c)}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className={light.on ? 'truncate text-white' : 'truncate text-gray-500'}>
                  {c.room} · {light.name}
                </span>
                <Toggle
                  checked={light.on}
                  label={`${c.room} ${light.name}`}
                  onChange={(on) => setLight(c.room, c.id, { on })}
                />
              </div>
              <Slider
                value={light.brightness}
                disabled={!light.on}
                ariaLabel={`${light.name} brightness`}
                onChange={(brightness) => setLight(c.room, c.id, { brightness })}
              />
            </div>
          )
        }
        if (c.kind === 'plug') {
          const plug = state.plugs.find((p) => p.id === c.id)
          if (!plug) return null
          return (
            <button
              key={ctrlKey(c)}
              type="button"
              onClick={() => setPlug(c.id, { on: !plug.on })}
              className={[
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.98]',
                plug.on ? 'border-accent/50 bg-accent/10 shadow-glow' : 'border-border bg-bg',
              ].join(' ')}
            >
              <PowerIcon className={['h-6 w-6', plug.on ? 'text-accent' : 'text-gray-600'].join(' ')} />
              <span className="flex-1 truncate font-medium text-white">{plug.name}</span>
              <span
                className={['font-mono text-xs uppercase', plug.on ? 'text-gain' : 'text-gray-500'].join(' ')}
              >
                {plug.on ? 'On' : 'Off'}
              </span>
            </button>
          )
        }
        // media
        return (
          <div key="media" className="flex items-center gap-3 rounded-xl border border-border bg-bg p-3">
            <button
              type="button"
              onClick={() => setMedia({ power: !state.media.power })}
              aria-label="TV power"
              className={[
                'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors active:scale-95',
                state.media.power ? 'bg-accent/20 text-accent shadow-glow' : 'bg-white/5 text-gray-500',
              ].join(' ')}
            >
              <PowerIcon className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-gray-300">
                <VolumeIcon className="h-5 w-5" />
                <span className="truncate font-mono text-sm text-white">
                  TV · {state.media.input} · {state.media.volume}
                </span>
              </div>
              <Slider
                value={state.media.volume}
                disabled={!state.media.power}
                ariaLabel="TV volume"
                onChange={(volume) => setMedia({ volume })}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StocksModule({ watchlistId }) {
  const [watchlists] = useLocalState('watchlists-v2', DEFAULT_WATCHLISTS)
  const list = watchlists.find((w) => w.id === watchlistId) || watchlists[0]
  const symbols = useMemo(() => (list?.items || []).map((i) => i.symbol), [list])
  const { quotes, updatedAt } = useQuotes(symbols)

  const rows = useMemo(() => {
    return [...symbols].sort((a, b) => (quotes[b]?.changePercent ?? -Infinity) - (quotes[a]?.changePercent ?? -Infinity))
  }, [symbols, quotes])

  if (!list || symbols.length === 0) {
    return <p className="text-sm text-gray-500">This watchlist has no symbols yet.</p>
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-gray-300">{list.name}</span>
        <span className="text-gray-600">
          {!hasFinnhubKey && 'Demo · '}
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Updating…'}
        </span>
      </div>
      <div className="scroll-area -mr-1 max-h-72 overflow-y-auto pr-1">
        <table className="w-full">
          <tbody>
            {rows.map((symbol) => {
              const q = quotes[symbol]
              const up = q?.changePercent != null ? q.changePercent >= 0 : true
              const chg = up ? 'text-gain' : 'text-loss'
              return (
                <tr key={symbol} className="border-t border-border first:border-t-0">
                  <td className="py-1.5 pr-2 font-semibold text-white">{display(symbol)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-gray-200">
                    {q?.price != null ? money(q.price) : '—'}
                  </td>
                  <td className={`py-1.5 pl-2 text-right font-mono font-bold ${chg}`}>
                    {q?.changePercent != null ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GoalsModule({ sectionId }) {
  const [sections] = useLocalState('goals-sections', GOALS_SEED)
  const [progress, setProgress] = useLocalState('goals-progress', {})
  const section = sections.find((s) => s.id === sectionId) || sections[0]
  const wk = weekKeyNow()
  const wp = progress[wk] || EMPTY_WEEK

  const editWeek = (fn) =>
    setProgress((p) => ({ ...p, [wk]: fn(p[wk] || EMPTY_WEEK) }))
  const toggleCheckbox = (itemId) =>
    editWeek((w) => {
      const item = w.items[itemId] || {}
      return { ...w, items: { ...w.items, [itemId]: { ...item, done: !item.done } } }
    })
  const toggleChild = (childId) =>
    editWeek((w) => ({ ...w, children: { ...w.children, [childId]: !w.children[childId] } }))

  if (!section) return <p className="text-sm text-gray-500">No goals lists yet.</p>

  const color = section.color
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="flex-1 truncate text-base font-bold" style={{ color }}>
          {section.title}
        </h3>
        <ProgressRing value={sectionCompletion(section, wp)} size={40} color={color} />
      </div>
      <ul className="scroll-area max-h-72 space-y-1 overflow-y-auto pr-1">
        {section.items.length === 0 && <li className="py-2 text-sm text-gray-500">No items yet.</li>}
        {section.items.map((it) => {
          const kids = it.children || []
          const isGroup = kids.length > 0
          const complete = itemCompletion(it, wp) >= 1
          const done = wp.items[it.id]?.done
          return (
            <li key={it.id} className="rounded-lg px-1 py-1">
              <div className="flex items-center gap-3">
                {isGroup ? (
                  <span
                    className="flex h-6 min-w-[2.5rem] flex-shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {kids.filter((c) => wp.children[c.id]).length}/{kids.length}
                  </span>
                ) : it.type === 'tally' ? (
                  <span
                    className="flex h-6 min-w-[2.5rem] flex-shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {(wp.items[it.id]?.checks || []).slice(0, it.target).filter(Boolean).length}/{it.target}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleCheckbox(it.id)}
                    aria-label={`Toggle ${it.title}`}
                    className={[
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 active:scale-95',
                      done ? 'text-bg' : 'border-border',
                    ].join(' ')}
                    style={done ? { backgroundColor: color, borderColor: color } : undefined}
                  >
                    {done && <CheckIcon className="h-4 w-4" />}
                  </button>
                )}
                <span className={complete ? 'flex-1 truncate text-gray-500 line-through' : 'flex-1 truncate text-gray-100'}>
                  {it.title}
                </span>
                {it.note && <span className="font-mono text-[11px] text-gray-500">{it.note}</span>}
              </div>
              {isGroup && (
                <ul className="ml-7 mt-1 space-y-1 border-l border-border pl-3">
                  {kids.map((c) => {
                    const cdone = !!wp.children[c.id]
                    return (
                      <li key={c.id} className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggleChild(c.id)}
                          aria-label={`Toggle ${c.title}`}
                          className={[
                            'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 active:scale-95',
                            cdone ? 'text-bg' : 'border-border',
                          ].join(' ')}
                          style={cdone ? { backgroundColor: color, borderColor: color } : undefined}
                        >
                          {cdone && <CheckIcon className="h-3.5 w-3.5" />}
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
        })}
      </ul>
    </div>
  )
}

function CalendarModule() {
  const [events] = useLocalState('calendar-events', [])
  const today = iso(new Date())
  const todays = useMemo(() => {
    const list = Array.isArray(events) ? events : []
    return list
      .filter((e) => e && typeof e.date === 'string' && e.date === today)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }, [events, today])

  if (todays.length === 0) {
    return <p className="text-sm text-gray-500">Nothing on the calendar today.</p>
  }
  const fmtTime = (t) => {
    if (!t) return ''
    const d = new Date(`${today}T${t}`)
    return Number.isNaN(d.getTime()) ? t : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return (
    <ul className="space-y-2">
      {todays.map((e) => (
        <li key={e.id} className="flex items-center gap-3">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: CAL_COLORS[e.category] || '#8B949E' }}
          />
          <span className="flex-1 truncate text-gray-100">{e.title}</span>
          <span className="font-mono text-xs text-gray-400">{fmtTime(e.time)}</span>
        </li>
      ))}
    </ul>
  )
}

function ModuleBody({ id, settings }) {
  switch (id) {
    case 'meals':
      return <MealsModule />
    case 'smarthome':
      return <SmartHomeModule controls={settings.smarthome.controls} />
    case 'stocks':
      return <StocksModule watchlistId={settings.stocks.watchlistId} />
    case 'goals':
      return <GoalsModule sectionId={settings.goals.sectionId} />
    case 'calendar':
      return <CalendarModule />
    default:
      return null
  }
}

// =============================================================================
// Config modals
// =============================================================================

function SmartHomeConfig({ value, onChange }) {
  const [state] = useLocalState('smart-home', DEFAULT_SMART_HOME)
  const selected = value || []
  const isSel = (opt) => selected.some((c) => ctrlKey(c) === ctrlKey(opt))
  const toggle = (opt) =>
    onChange(isSel(opt) ? selected.filter((c) => ctrlKey(c) !== ctrlKey(opt)) : [...selected, opt])

  const options = [
    ...Object.entries(state.lights || {}).flatMap(([room, arr]) =>
      arr.map((l) => ({ opt: { kind: 'light', room, id: l.id }, label: `${room} · ${l.name}`, group: 'Lights' })),
    ),
    ...(state.plugs || []).map((p) => ({ opt: { kind: 'plug', id: p.id }, label: p.name, group: 'Plugs' })),
    { opt: { kind: 'media' }, label: 'TV / Media', group: 'Media' },
  ]
  const groups = ['Lights', 'Plugs', 'Media']

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">Pick the controls you use most — they appear on the dashboard.</p>
      {groups.map((g) => (
        <div key={g}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{g}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {options
              .filter((o) => o.group === g)
              .map((o) => {
                const on = isSel(o.opt)
                return (
                  <button
                    key={ctrlKey(o.opt)}
                    type="button"
                    onClick={() => toggle(o.opt)}
                    className={[
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                      on ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-200',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2',
                        on ? 'border-accent bg-accent text-bg' : 'border-border',
                      ].join(' ')}
                    >
                      {on && <CheckIcon className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Single-choice picker shared by the Stocks and Goals config modals.
function ChoiceList({ options, value, onChange }) {
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const on = value === o.id || (value == null && o.id === options[0]?.id)
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={[
              'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.98]',
              on ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-200',
            ].join(' ')}
          >
            <span
              className={[
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                on ? 'border-accent' : 'border-border',
              ].join(' ')}
            >
              {on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
            </span>
            {o.color && <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: o.color }} />}
            <span className="flex-1 truncate">{o.label}</span>
            {o.hint != null && <span className="font-mono text-xs text-gray-500">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

function StocksConfig({ value, onChange }) {
  const [watchlists] = useLocalState('watchlists-v2', DEFAULT_WATCHLISTS)
  return (
    <ChoiceList
      value={value}
      onChange={onChange}
      options={watchlists.map((w) => ({ id: w.id, label: w.name, hint: `${w.items.length}` }))}
    />
  )
}

function GoalsConfig({ value, onChange }) {
  const [sections] = useLocalState('goals-sections', GOALS_SEED)
  return (
    <ChoiceList
      value={value}
      onChange={onChange}
      options={sections.map((s) => ({ id: s.id, label: s.title, color: s.color }))}
    />
  )
}

// =============================================================================
// Module card + sortable wrapper
// =============================================================================

function ModuleCard({ title, enabled, editing, hasConfig, dragHandleProps, onToggle, onConfigure, children }) {
  return (
    <Card className={editing && !enabled ? 'opacity-60' : ''}>
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
        {editing && (
          <button
            type="button"
            {...dragHandleProps}
            aria-label={`Reorder ${title}`}
            style={{ touchAction: 'none' }}
            className="-ml-1 flex-shrink-0 cursor-grab rounded-md p-1 text-gray-600 active:cursor-grabbing active:text-gray-300"
          >
            <GripIcon className="h-5 w-5" />
          </button>
        )}
        <h2 className="flex-1 truncate text-lg font-bold text-white">{title}</h2>
        {editing && hasConfig && (
          <button
            type="button"
            onClick={onConfigure}
            aria-label={`Configure ${title}`}
            className="rounded-lg bg-white/5 p-2 text-gray-300 active:scale-95"
          >
            <GearIcon className="h-5 w-5" />
          </button>
        )}
        {editing && <Toggle checked={enabled} onChange={onToggle} label={`Show ${title}`} />}
      </div>
      {children}
    </Card>
  )
}

function SortableModule({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

// =============================================================================
// Page
// =============================================================================

export default function Dashboard() {
  const [cfg, setCfg] = useLocalState('dashboard', DEFAULT_DASHBOARD, migrateDashboard)
  const [editing, setEditing] = useState(false)
  const [configFor, setConfigFor] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const setEnabled = (id, on) => setCfg((c) => ({ ...c, enabled: { ...c.enabled, [id]: on } }))
  const setSetting = (mod, key, val) =>
    setCfg((c) => ({ ...c, settings: { ...c.settings, [mod]: { ...c.settings[mod], [key]: val } } }))

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setCfg((c) => {
      const from = c.order.indexOf(active.id)
      const to = c.order.indexOf(over.id)
      return from === -1 || to === -1 ? c : { ...c, order: arrayMove(c.order, from, to) }
    })
  }

  const today = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const visible = editing ? cfg.order : cfg.order.filter((id) => cfg.enabled[id])

  const renderCard = (id, handleProps) => {
    const body = cfg.enabled[id] ? (
      <ModuleBody id={id} settings={cfg.settings} />
    ) : (
      <p className="text-sm text-gray-500">Hidden — toggle to show this on your dashboard.</p>
    )
    return (
      <ModuleCard
        title={TITLE[id]}
        enabled={cfg.enabled[id]}
        editing={editing}
        hasConfig={CONFIGURABLE.has(id)}
        dragHandleProps={handleProps}
        onToggle={(on) => setEnabled(id, on)}
        onConfigure={() => setConfigFor(id)}
      >
        {body}
      </ModuleCard>
    )
  }

  const grid = (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      {visible.map((id) =>
        editing ? (
          <SortableModule key={id} id={id}>
            {(handle) => renderCard(id, handle)}
          </SortableModule>
        ) : (
          <div key={id}>{renderCard(id, null)}</div>
        ),
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Home" subtitle={today}>
        <Button variant={editing ? 'primary' : 'ghost'} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Customize'}
        </Button>
      </PageHeader>

      {editing && (
        <p className="mb-4 text-sm text-gray-500">
          Drag <GripIcon className="inline h-4 w-4" /> to reorder, toggle to show/hide, and tap{' '}
          <GearIcon className="inline h-4 w-4" /> to choose what each module displays.
        </p>
      )}

      {visible.length === 0 ? (
        <Card className="text-center text-gray-500">
          All modules are hidden. Tap <span className="text-accent">Customize</span> to add some.
        </Card>
      ) : editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={cfg.order} strategy={rectSortingStrategy}>
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}

      {/* Per-module configuration */}
      <Modal
        open={!!configFor}
        onClose={() => setConfigFor(null)}
        title={configFor ? `Configure ${TITLE[configFor]}` : ''}
        footer={<Button onClick={() => setConfigFor(null)}>Done</Button>}
      >
        {configFor === 'smarthome' && (
          <SmartHomeConfig
            value={cfg.settings.smarthome.controls}
            onChange={(controls) => setSetting('smarthome', 'controls', controls)}
          />
        )}
        {configFor === 'stocks' && (
          <StocksConfig
            value={cfg.settings.stocks.watchlistId}
            onChange={(id) => setSetting('stocks', 'watchlistId', id)}
          />
        )}
        {configFor === 'goals' && (
          <GoalsConfig
            value={cfg.settings.goals.sectionId}
            onChange={(id) => setSetting('goals', 'sectionId', id)}
          />
        )}
      </Modal>
    </div>
  )
}
