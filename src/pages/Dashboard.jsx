import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import Tabs from '../components/Tabs.jsx'
import DatePicker from '../components/DatePicker.jsx'
import Toggle from '../components/Toggle.jsx'
import Slider from '../components/Slider.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useLocalState } from '../lib/storage.js'
import { fetchQuotes, hasFinnhubKey } from '../lib/finnhub.js'
import { directionsUrl, embedMapUrl, fetchTravelTime, hasGoogleMapsKey } from '../lib/googleMaps.js'
import { describeWeather, fetchWeather, geocode } from '../lib/weather.js'
import { parseLocalDate } from '../lib/dates.js'
import {
  getDevices as spotifyGetDevices,
  hasSpotifyClientId,
  initPlayer,
  isAuthed as spotifyAuthed,
  localDeviceId,
  login as spotifyLogin,
  logout as spotifyLogout,
  nextTrack,
  parseSpotify,
  play as spotifyPlay,
  previousTrack,
  spotifyEmbedUrl,
  subscribeAuth as subscribeSpotifyAuth,
  subscribePlayer,
  togglePlay,
  transferPlayback as spotifyTransfer,
} from '../lib/spotify.js'
import {
  CarIcon,
  CastIcon,
  CheckIcon,
  ChevronRight,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSnowIcon,
  GearIcon,
  GripIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PowerIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpotifyIcon,
  SunIcon,
  SunriseIcon,
  TrashIcon,
  VolumeIcon,
} from '../components/Icons.jsx'
// Seed defaults are shared with the source pages (one source of truth) so the
// dashboard sees the same items/IDs even before those pages have been opened.
import {
  DEFAULT_SMART_HOME,
  DEFAULT_WATCHLISTS,
  GOALS_SEED,
  SEED_MEALS,
  SEED_MEMBERS,
} from '../lib/seeds.js'
import { migrateColors } from '../lib/colors.js'
import { MemberBadge } from '../components/Member.jsx'

// --- Module registry ---------------------------------------------------------
// The dashboard is a customizable stack of module *instances*. Each instance has
// a stable id, a `type` from this registry, an enabled flag, and its own
// settings. Singleton types exist once (toggle to show/hide); `multi` types
// (Traffic) can be added any number of times from the customize screen.
const MODULE_TYPES = {
  meals: { title: "Today's Meals", configurable: false, multi: false },
  shopping: { title: 'Shopping', configurable: false, multi: false },
  weather: { title: 'Weather', configurable: true, multi: true },
  smarthome: { title: 'Smart Home', configurable: true, multi: false },
  stocks: { title: 'Investments', configurable: true, multi: false },
  goals: { title: 'Goals', configurable: true, multi: false },
  calendar: { title: "Today's Events", configurable: false, multi: false },
  traffic: { title: 'Traffic', configurable: true, multi: true },
  spotify: { title: 'Spotify', configurable: true, multi: true },
}
// Order in which singleton instances seed a fresh dashboard / get backfilled.
const SINGLETONS = ['meals', 'shopping', 'smarthome', 'stocks', 'goals', 'calendar']

function defaultSettings(type) {
  switch (type) {
    case 'smarthome':
      return { controls: [] } // [{ kind:'light', room, id } | { kind:'plug', id } | { kind:'media' }]
    case 'stocks':
      return { watchlistId: null } // null → first watchlist
    case 'goals':
      return { sectionId: null } // null → first list
    case 'traffic':
      return { label: '', origin: '', destination: '', via: [] }
    case 'weather':
      return { location: '', units: 'fahrenheit' }
    case 'spotify':
      return { label: '', url: '' }
    default:
      return {}
  }
}

const newInstance = (type) => ({
  id: crypto.randomUUID(),
  type,
  enabled: true,
  settings: defaultSettings(type),
})

export const defaultDashboard = () => ({ modules: SINGLETONS.map((t) => ({ ...newInstance(t), id: t })) })

// Sanitize a module instance into the current shape. `column` (0 = left,
// 1 = right) places the module in one of the two independent dashboard columns;
// it's normalized later for any module that lacks a valid value.
function cleanModule(m) {
  if (!m || !MODULE_TYPES[m.type]) return null
  return {
    id: m.id || crypto.randomUUID(),
    type: m.type,
    enabled: m.enabled !== false,
    settings: { ...defaultSettings(m.type), ...(m.settings || {}) },
    column: m.column === 0 || m.column === 1 ? m.column : undefined,
  }
}

// Assign a column to any module missing one. Legacy configs (no columns) get an
// alternating split, reproducing the prior left/right row-major arrangement.
function normalizeColumns(modules) {
  return modules.map((m, i) => ({
    ...m,
    column: m.column === 0 || m.column === 1 ? m.column : i % 2,
  }))
}

// Guarantee every singleton type is present at least once (so it can always be
// re-shown from the Add Module screen).
function ensureSingletons(modules) {
  const have = new Set(modules.map((m) => m.type))
  const out = [...modules]
  for (const t of SINGLETONS) if (!have.has(t)) out.push({ ...newInstance(t), id: t })
  return out
}

// Fold older/partial configs into the instance model. Handles both the new
// `{ modules }` shape and the original `{ order, enabled, settings }` shape.
export function migrateDashboard(stored) {
  if (!stored || typeof stored !== 'object') return defaultDashboard()
  if (Array.isArray(stored.modules)) {
    const modules = stored.modules.map(cleanModule).filter(Boolean)
    return { modules: normalizeColumns(ensureSingletons(modules)) }
  }
  // Original shape: a fixed list of singleton modules keyed by type.
  const order = Array.isArray(stored.order) ? stored.order.filter((t) => SINGLETONS.includes(t)) : []
  for (const t of SINGLETONS) if (!order.includes(t)) order.push(t)
  const modules = order.map((t) => ({
    id: t,
    type: t,
    enabled: stored.enabled?.[t] !== false,
    settings: { ...defaultSettings(t), ...(stored.settings?.[t] || {}) },
  }))
  return { modules: normalizeColumns(modules) }
}

const moduleTitle = (m) => {
  if (m.type === 'traffic') return m.settings.label?.trim() || 'Traffic'
  if (m.type === 'weather') return m.settings.location?.trim() || 'Weather'
  if (m.type === 'spotify') return m.settings.label?.trim() || 'Spotify'
  return MODULE_TYPES[m.type].title
}

// --- Shared date helpers (local, weeks start Sunday) -------------------------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOTS = ['Breakfast', 'Lunch', 'Dinner']
const SLOT_THEME = {
  Breakfast: { color: '#BD9541', Icon: SunriseIcon }, // Lichen (was gold)
  Lunch: { color: '#52C167', Icon: SunIcon }, // Sage (was green)
  Dinner: { color: '#61A2E0', Icon: MoonIcon }, // Water (was blue)
}
const CAL_COLORS = {
  Work: '#61A2E0',
  Personal: '#52C167',
  Health: '#D8685E',
  Family: '#AC88E0',
  Other: '#8C948F',
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
const slotProviders = (v) => (typeof v === 'string' ? [] : v?.providers || [])

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

// --- Traffic helper ----------------------------------------------------------
// To keep API usage (and cost) minimal, the Traffic module only polls during the
// configured time-of-day windows, only while the dashboard tab is actually
// visible, and at a relaxed cadence. Outside those windows it shows the last
// reading.
const COMMUTE_WINDOWS = [
  { start: 6 * 60, end: 8 * 60 }, //  6:00–8:00 am
  { start: 16 * 60, end: 18 * 60 }, //  4:00–6:00 pm
]
const TRAFFIC_POLL_MS = 5 * 60 * 1000 // 5 minutes

// Windows are stored on the module as { start, end } minutes-from-midnight. Fall
// back to the default commute windows when a module has none configured yet.
const normalizeWindows = (w) => {
  const list = Array.isArray(w)
    ? w.filter((x) => x && Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
    : []
  return list.length ? list : COMMUTE_WINDOWS
}
const inWindows = (windows, d = new Date()) => {
  const min = d.getHours() * 60 + d.getMinutes()
  return windows.some((w) => min >= w.start && min < w.end)
}
// Minutes-from-midnight <-> 12-hour parts, for the config time pickers.
const minToParts = (min) => {
  let h = Math.floor(min / 60)
  const m = min % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return { h, m, ap }
}
const partsToMin = (h, m, ap) => ((h % 12) + (ap === 'PM' ? 12 : 0)) * 60 + m
const fmtClock = (min) => {
  const { h, m, ap } = minToParts(min)
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''}${ap.toLowerCase()}`
}
const fmtWindows = (windows) => windows.map((w) => `${fmtClock(w.start)}–${fmtClock(w.end)}`).join(' · ')

const tabVisible = () =>
  typeof document === 'undefined' || document.visibilityState === 'visible'

function useTravelTime(origin, destination, via, windows = COMMUTE_WINDOWS) {
  const o = origin?.trim() || ''
  const d = destination?.trim() || ''
  // Stable key so the effect only re-runs when the via stops actually change.
  const viaKey = (via || []).map((v) => v?.trim() || '').filter(Boolean).join('|')
  // Stable key so the effect re-subscribes only when the windows actually change.
  const winKey = windows.map((w) => `${w.start}-${w.end}`).join('|')
  const [data, setData] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(() => inWindows(windows))

  useEffect(() => {
    if (!o || !d) {
      setData(null)
      return
    }
    let cancelled = false
    const stops = viaKey ? viaKey.split('|') : []
    const wins = winKey.split('|').map((s) => {
      const [start, end] = s.split('-').map(Number)
      return { start, end }
    })

    // Only spend an API call when we're in a polling window AND the dashboard is
    // on-screen; otherwise the last reading stays put.
    const load = async () => {
      if (!inWindows(wins) || !tabVisible()) return
      setLoading(true)
      const r = await fetchTravelTime(o, d, stops)
      if (!cancelled) {
        setData(r)
        setUpdatedAt(new Date())
        setLoading(false)
      }
    }

    const tick = () => {
      if (cancelled) return
      setActive(inWindows(wins))
      load()
    }
    // When the tab becomes visible again mid-window, refresh straight away.
    const onVisibility = () => {
      setActive(inWindows(wins))
      if (tabVisible()) load()
    }

    tick() // immediate attempt (no-op outside a window / when hidden)
    const id = setInterval(tick, TRAFFIC_POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [o, d, viaKey, winKey])

  return { data, updatedAt, loading, active }
}

const fmtDuration = (sec) => {
  const min = Math.max(1, Math.round(sec / 60))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}
const fmtMiles = (meters) => {
  if (meters == null) return null
  const mi = meters / 1609.34
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
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
  const [members] = useLocalState('meals-members', SEED_MEMBERS, migrateColors)
  const mealById = useMemo(() => Object.fromEntries(meals.map((m) => [m.id, m])), [meals])
  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const plan = plans[weekKeyNow()] || {}
  const day = dayNameNow()

  return (
    // A container so the slot label can hide itself when the module is narrow
    // (e.g. in a two-column dashboard on an iPad), freeing space for the name.
    <div className="space-y-2 [container-type:inline-size]">
      {SLOTS.map((slot) => {
        const theme = SLOT_THEME[slot]
        const SlotIcon = theme.Icon
        const val = plan[day]?.[slot]
        const meal = mealById[slotMealId(val)]
        const takeout = meal && (meal.type || 'recipe') === 'takeout'
        const providers = meal
          ? slotProviders(val)
              .map((id) => memberById[id])
              .filter(Boolean)
          : []
        return (
          <div
            key={slot}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: `${theme.color}14`, borderLeft: `4px solid ${theme.color}` }}
          >
            <SlotIcon className="h-6 w-6 flex-shrink-0" style={{ color: theme.color }} title={slot} />
            <span
              className="meal-slot-name w-20 flex-shrink-0 text-sm font-semibold"
              style={{ color: theme.color }}
            >
              {slot}
            </span>
            {meal ? (
              <>
                <span className="min-w-0 flex-1 truncate font-medium text-white">
                  {meal.name}
                  <span className="ml-2 font-mono text-[10px] uppercase text-gray-500">
                    {takeout ? 'Takeout' : 'Homecooked'}
                  </span>
                </span>
                {providers.length > 0 && (
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    Provided by{' '}
                    {providers.map((m, i) => (
                      <span key={m.id}>
                        <span className="font-semibold" style={{ color: m.color }}>
                          {m.name}
                        </span>
                        {i < providers.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>
                )}
              </>
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
    return [...symbols].sort(
      (a, b) => (quotes[b]?.changePercent ?? -Infinity) - (quotes[a]?.changePercent ?? -Infinity),
    )
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
          {updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Updating…'}
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
  const [sections] = useLocalState('goals-sections', GOALS_SEED, migrateColors)
  const [progress, setProgress] = useLocalState('goals-progress', {})
  const section = sections.find((s) => s.id === sectionId) || sections[0]
  const wk = weekKeyNow()
  const wp = progress[wk] || EMPTY_WEEK

  const editWeek = (fn) => setProgress((p) => ({ ...p, [wk]: fn(p[wk] || EMPTY_WEEK) }))
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
                <span
                  className={
                    complete ? 'flex-1 truncate text-gray-500 line-through' : 'flex-1 truncate text-gray-100'
                  }
                >
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
                        <span
                          className={cdone ? 'text-sm text-gray-500 line-through' : 'text-sm text-gray-200'}
                        >
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
  const [categories] = useLocalState('calendar-categories', [], migrateColors)
  const [members] = useLocalState('meals-members', SEED_MEMBERS, migrateColors)
  const today = iso(new Date())
  // Start date/time across legacy ({date,time}) and timeframe ({startDate,...}).
  const evDate = (e) => e.startDate || e.date || ''
  const evTime = (e) => e.startTime || e.time || ''
  const todays = useMemo(() => {
    const list = Array.isArray(events) ? events : []
    return list
      .filter((e) => e && evDate(e) <= today && today <= (e.endDate || e.startDate || e.date || evDate(e)))
      .sort((a, b) => evTime(a).localeCompare(evTime(b)))
  }, [events, today])

  if (todays.length === 0) {
    return <p className="text-sm text-gray-500">Nothing on the calendar today.</p>
  }
  const colorOf = (e) => {
    const cats = Array.isArray(categories) ? categories : []
    const match = cats.find(
      (c) => c.id === e.category || c.name?.toLowerCase() === String(e.category || '').toLowerCase(),
    )
    return match?.color || CAL_COLORS[e.category] || '#8C948F'
  }
  const fmtTime = (t) => {
    if (!t) return ''
    const d = parseLocalDate(`${today}T${t}`)
    return Number.isNaN(d.getTime()) ? t : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  // Household members assigned to an event (skips any that no longer exist).
  const eventMembers = (e) => {
    const list = Array.isArray(members) ? members : []
    return (e.members || []).map((id) => list.find((m) => m.id === id)).filter(Boolean)
  }
  return (
    <ul className="space-y-1">
      {todays.map((e) => {
        const evMembers = eventMembers(e)
        return (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: colorOf(e) }}
            />
            <span className="flex-1 truncate text-gray-100">{e.title}</span>
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
            <span className="w-16 flex-shrink-0 text-right font-mono text-xs text-gray-400">
              {e.allDay ? 'All day' : fmtTime(evTime(e))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function TrafficModule({ settings, fullHeight = false }) {
  const { origin, destination, via } = settings
  const stops = (via || []).map((v) => v?.trim()).filter(Boolean)
  const windows = normalizeWindows(settings.windows)
  const { data, updatedAt, active } = useTravelTime(origin, destination, via, windows)

  if (!origin?.trim() || !destination?.trim()) {
    return (
      <p className="text-sm text-gray-500">
        Set a start and destination with the <GearIcon className="inline h-4 w-4" /> in customize mode to
        see live drive time.
      </p>
    )
  }

  // Delay vs the typical (no-traffic) duration.
  let delayLabel = 'Live traffic'
  let delayClass = 'text-gray-400'
  if (data) {
    const delayMin = Math.round((data.durationSec - data.staticDurationSec) / 60)
    if (delayMin >= 2) {
      delayLabel = `+${delayMin} min vs usual`
      delayClass = 'text-loss'
    } else if (delayMin <= -2) {
      delayLabel = `${-delayMin} min faster than usual`
      delayClass = 'text-gain'
    } else {
      delayLabel = 'Typical traffic'
      delayClass = 'text-gain'
    }
  }
  const miles = data ? fmtMiles(data.distanceMeters) : null
  const mapUrl = embedMapUrl(origin, destination, via)

  return (
    <div className={fullHeight ? 'flex h-full flex-col' : undefined}>
      <div className="mb-3 flex items-start gap-2 text-sm text-gray-300">
        <CarIcon className="h-5 w-5 flex-shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block truncate">
            <span className="text-white">{origin}</span>
            <span className="mx-1.5 text-gray-600">→</span>
            <span className="text-white">{destination}</span>
          </span>
          {stops.length > 0 && (
            <span className="block truncate text-xs text-gray-500">via {stops.join(', ')}</span>
          )}
        </span>
      </div>

      {data ? (
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-4xl font-bold text-white">{fmtDuration(data.durationSec)}</div>
            <div className={`mt-1 text-sm font-semibold ${delayClass}`}>{delayLabel}</div>
          </div>
          <div className="text-right">
            {miles && <div className="font-mono text-lg text-gray-300">{miles}</div>}
            <a
              href={directionsUrl(origin, destination, via)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-block text-xs font-semibold text-accent underline decoration-dotted underline-offset-2"
            >
              Open in Maps
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          {active ? 'Checking traffic…' : `Live drive time updates during ${fmtWindows(windows)}.`}
        </p>
      )}

      {mapUrl ? (
        <div
          className={[
            'mt-3 overflow-hidden rounded-lg border border-white/10',
            fullHeight ? 'min-h-0 flex-1' : '',
          ].join(' ')}
        >
          {/* Remount (reload) the embed whenever the Routes poll succeeds, so the
              map refreshes its traffic-aware route on the same commute-window
              cadence as the drive-time number. Maps Embed loads are free. */}
          <iframe
            key={updatedAt ? updatedAt.getTime() : 'map'}
            title="Commute map"
            src={mapUrl}
            className={fullHeight ? 'block h-full w-full' : 'block h-48 w-full'}
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      ) : (
        !hasGoogleMapsKey && (
          <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-500">
            Add <span className="font-mono">VITE_GOOGLE_MAPS_API_KEY</span> (with the Maps Embed API
            enabled) to show a live route map here.
          </p>
        )
      )}

      <div className="mt-3 text-right text-xs text-gray-600">
        {data?.mock && (hasGoogleMapsKey ? 'Traffic unavailable · ' : 'Demo data · ')}
        {!active && 'Paused outside set hours · '}
        {updatedAt
          ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : active
            ? 'Checking…'
            : `Checks ${fmtWindows(windows)}`}
      </div>
    </div>
  )
}

// --- Shopping ----------------------------------------------------------------
// A simple shopping list with an optional "buy by" date per item. Items live in
// their own shared state key so the list syncs across devices like everything else.
const fmtShopDate = (date) => {
  if (!date) return ''
  const d = parseLocalDate(date)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function ShoppingModule() {
  const [items, setItems] = useLocalState('shopping-list', [])
  const [draft, setDraft] = useState(null) // { id?, text, date }
  const today = iso(new Date())

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1 // unchecked first
      const ad = a.date || '9999-12-31'
      const bd = b.date || '9999-12-31'
      if (ad !== bd) return ad < bd ? -1 : 1
      return (a.text || '').localeCompare(b.text || '')
    })
  }, [items])

  const save = () => {
    const text = draft.text.trim()
    if (!text) return
    const item = { id: draft.id || crypto.randomUUID(), text, date: draft.date || '', done: draft.done || false }
    setItems((list) => {
      const exists = list.some((i) => i.id === item.id)
      return exists ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item]
    })
    setDraft(null)
  }
  const toggle = (id) => setItems((list) => list.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  const remove = (id) => setItems((list) => list.filter((i) => i.id !== id))

  // Date urgency color: overdue/today = red, within 3 days = amber, else gray.
  const dateClass = (date, done) => {
    if (done) return 'text-gray-500'
    if (date < today) return 'text-loss'
    if (date === today) return 'text-loss'
    const diff = (parseLocalDate(date) - parseLocalDate(today)) / 86_400_000
    return diff <= 3 ? 'text-[#BD9541]' : 'text-gray-400'
  }

  return (
    <div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to buy yet. Add an item below.</p>
      ) : (
        <ul className="scroll-area max-h-72 space-y-1 overflow-y-auto pr-1">
          {sorted.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-lg px-1 py-1">
              <button
                type="button"
                onClick={() => toggle(it.id)}
                aria-label={`Toggle ${it.text}`}
                className={[
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2 active:scale-95',
                  it.done ? 'border-gain bg-gain text-bg' : 'border-border',
                ].join(' ')}
              >
                {it.done && <CheckIcon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setDraft({ id: it.id, text: it.text, date: it.date || '', done: it.done })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
              >
                <span className={it.done ? 'truncate text-gray-500 line-through' : 'truncate text-gray-100'}>
                  {it.text}
                </span>
                {it.date && (
                  <span className={`flex-shrink-0 font-mono text-xs ${dateClass(it.date, it.done)}`}>
                    {it.date === today && !it.done ? 'Today' : fmtShopDate(it.date)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => remove(it.id)}
                aria-label={`Remove ${it.text}`}
                className="flex-shrink-0 rounded p-1.5 text-gray-600 active:scale-95 active:text-loss"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setDraft({ text: '', date: '' })}
        className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-300 active:scale-95"
      >
        <PlusIcon className="h-4 w-4" /> Add item
      </button>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit item' : 'Add item'}
        size="narrow"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Item</label>
              <input
                autoFocus
                className={fieldClass}
                placeholder="e.g. Milk"
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs text-gray-500">Buy by (optional)</label>
              <DatePicker
                value={draft.date}
                onChange={(date) => setDraft({ ...draft, date })}
                onClear={() => setDraft({ ...draft, date: '' })}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// --- Weather ----------------------------------------------------------------
const WX_ICON = {
  clear: SunIcon,
  cloud: CloudIcon,
  fog: CloudIcon,
  rain: CloudRainIcon,
  snow: CloudSnowIcon,
  thunder: CloudLightningIcon,
}
const WX_COLOR = {
  clear: '#F0A92B',
  cloud: '#8B949E',
  fog: '#8B949E',
  rain: '#58A6FF',
  snow: '#A5D8FF',
  thunder: '#D29922',
}

// Geocode the location once, then refresh weather periodically while the tab is
// visible. Open-Meteo is free/keyless, so the only gate is being on-screen.
function useWeather(location, units) {
  const q = location?.trim() || ''
  const unit = units === 'celsius' ? 'celsius' : 'fahrenheit'
  const [place, setPlace] = useState(null)
  const [data, setData] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!q) {
      setPlace(null)
      setData(null)
      setError(false)
      return
    }
    let cancelled = false
    geocode(q)
      .then((p) => {
        if (cancelled) return
        setPlace(p)
        setError(!p) // not found
      })
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [q])

  useEffect(() => {
    if (!place) return
    let cancelled = false
    const load = async () => {
      if (!tabVisible()) return
      try {
        const w = await fetchWeather(place.latitude, place.longitude, unit)
        if (!cancelled) {
          setData(w)
          setUpdatedAt(new Date())
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()
    const id = setInterval(load, 900_000) // every 15 minutes
    const onVisibility = () => tabVisible() && load()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [place, unit])

  return { place, data, updatedAt, error }
}

function WeatherModule({ settings }) {
  const { place, data, updatedAt, error } = useWeather(settings.location, settings.units)
  const u = settings.units === 'celsius' ? '°C' : '°F'
  const windUnit = settings.units === 'celsius' ? 'km/h' : 'mph'

  if (!settings.location?.trim()) {
    return (
      <p className="text-sm text-gray-500">
        Set a location with the <GearIcon className="inline h-4 w-4" /> in customize mode to see the
        current weather.
      </p>
    )
  }

  if (!data) {
    return (
      <p className="text-sm text-gray-500">
        {error
          ? place
            ? 'Weather unavailable right now.'
            : 'Couldn’t find that location.'
          : 'Loading weather…'}
      </p>
    )
  }

  const { label, kind } = describeWeather(data.code)
  const night = kind === 'clear' && !data.isDay
  const Icon = night ? MoonIcon : WX_ICON[kind] || CloudIcon
  const color = night ? '#A78BFA' : WX_COLOR[kind] || '#8B949E'

  return (
    <div>
      <div className="mb-1 truncate text-sm text-gray-400">{place?.name || settings.location}</div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="h-12 w-12 flex-shrink-0" style={{ color }} />
          <div>
            <div className="font-mono text-4xl font-bold text-white">
              {Math.round(data.temp)}
              {u}
            </div>
            <div className="text-sm text-gray-300">{label}</div>
          </div>
        </div>
        <div className="space-y-0.5 text-right text-sm text-gray-400">
          <div>
            Feels {Math.round(data.feels)}
            {u}
          </div>
          <div>
            H {Math.round(data.hi)}
            {u} · L {Math.round(data.lo)}
            {u}
          </div>
          <div>Humidity {data.humidity}%</div>
          <div>
            Wind {Math.round(data.wind)} {windUnit}
          </div>
        </div>
      </div>
      {data.days?.length > 1 && (
        <div className="mt-4 grid grid-cols-5 gap-1 border-t border-white/10 pt-3">
          {data.days.slice(0, 5).map((day, i) => {
            const { kind } = describeWeather(day.code)
            const DayIcon = WX_ICON[kind] || CloudIcon
            return (
              <div key={day.date} className="flex flex-col items-center gap-1">
                <div className="text-[11px] font-medium text-gray-400">
                  {i === 0
                    ? 'Today'
                    : parseLocalDate(day.date).toLocaleDateString([], { weekday: 'short' })}
                </div>
                <DayIcon className="h-5 w-5" style={{ color: WX_COLOR[kind] || '#8B949E' }} />
                <div className="text-xs leading-tight">
                  <span className="font-semibold text-white">{Math.round(day.hi)}°</span>
                  <span className="ml-1 text-gray-500">{Math.round(day.lo)}°</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3 text-right text-xs text-gray-600">
        {error && 'Stale · '}
        {updatedAt
          ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : ''}
      </div>
    </div>
  )
}

function SpotifyEmbed({ parsed }) {
  // Single tracks/episodes look best compact; playlists/albums get the tall card.
  const height = parsed.type === 'track' || parsed.type === 'episode' ? 152 : 352
  return (
    <iframe
      title="Spotify player"
      src={spotifyEmbedUrl(parsed)}
      width="100%"
      height={height}
      loading="lazy"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      style={{ border: 0, borderRadius: 12 }}
    />
  )
}

// Full-playback player (Premium) via the Web Playback SDK.
function SpotifyPlayer({ parsed, label }) {
  const [state, setState] = useState(null)
  const [castOpen, setCastOpen] = useState(false)
  const [devices, setDevices] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  // Chosen Spotify Connect device; null means the in-app "Home Center" device.
  const [target, setTarget] = useState(null)
  useEffect(() => {
    initPlayer()
    return subscribePlayer(setState)
  }, [])

  const refreshDevices = async () => {
    setLoadingDevices(true)
    setDevices(await spotifyGetDevices())
    setLoadingDevices(false)
  }
  const toggleCast = () => {
    const next = !castOpen
    setCastOpen(next)
    if (next) refreshDevices()
  }
  const castTo = async (d) => {
    await spotifyTransfer(d.id)
    setTarget(d.id === localDeviceId() ? null : d.id)
    setCastOpen(false)
    // Give Spotify a moment to switch, then reflect the new active device.
    setTimeout(refreshDevices, 700)
  }

  if (state?.error) {
    // e.g. non-Premium account — fall back to the preview embed.
    return (
      <div>
        <p className="mb-3 text-sm text-loss">{state.error}</p>
        <SpotifyEmbed parsed={parsed} />
      </div>
    )
  }

  const playback = state?.playback
  const track = playback?.track_window?.current_track
  const paused = playback?.paused ?? true
  const art = track?.album?.images?.[0]?.url
  const activeDevice = devices.find((d) => d.isActive)

  return (
    <div>
      <div className="flex items-center gap-3">
        {art ? (
          <img src={art} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg" />
        ) : (
          <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-white/5">
            <SpotifyIcon className="h-8 w-8 text-[#1DB954]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white">{track?.name || 'Nothing playing'}</div>
          <div className="truncate text-sm text-gray-400">
            {track?.artists?.map((a) => a.name).join(', ') || (label || 'Spotify')}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleCast}
          aria-label="Cast to a device"
          aria-expanded={castOpen}
          className={`flex-shrink-0 active:scale-90 ${castOpen || target ? 'text-accent' : 'text-gray-400'}`}
        >
          <CastIcon className="h-6 w-6" />
        </button>
      </div>

      {castOpen && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-1.5">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-gray-400">Cast to</span>
            <button
              type="button"
              onClick={refreshDevices}
              className="text-xs font-semibold text-accent active:scale-95"
            >
              Refresh
            </button>
          </div>
          {loadingDevices && devices.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-500">Finding devices…</p>
          ) : devices.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-500">
              No devices found. Open Spotify on a speaker, phone, or TV and refresh.
            </p>
          ) : (
            devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => castTo(d)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-200 active:scale-[0.98] hover:bg-white/5"
              >
                <CastIcon className={`h-4 w-4 flex-shrink-0 ${d.isActive ? 'text-accent' : 'text-gray-500'}`} />
                <span className="min-w-0 flex-1 truncate">
                  {d.name}
                  <span className="ml-1.5 text-xs text-gray-500">{d.type}</span>
                </span>
                {d.isActive && <CheckIcon className="h-4 w-4 flex-shrink-0 text-accent" />}
              </button>
            ))
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-6">
        <button type="button" onClick={previousTrack} aria-label="Previous" className="text-gray-300 active:scale-90">
          <SkipBackIcon className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? 'Play' : 'Pause'}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg shadow-glow active:scale-95"
        >
          {paused ? <PlayIcon className="h-7 w-7" /> : <PauseIcon className="h-7 w-7" />}
        </button>
        <button type="button" onClick={nextTrack} aria-label="Next" className="text-gray-300 active:scale-90">
          <SkipForwardIcon className="h-7 w-7" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => spotifyPlay(parsed, target)}
        disabled={!state?.ready && !target}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-200 active:scale-95 disabled:opacity-40"
      >
        <PlayIcon className="h-4 w-4" /> Play {label?.trim() || `this ${parsed.type}`}
      </button>
      <div className="mt-2 text-center text-xs text-gray-500">
        {!state?.ready && !target
          ? 'Connecting to Spotify…'
          : activeDevice
            ? `Playing on ${activeDevice.name}`
            : target
              ? 'Casting to selected device'
              : 'Playing on this screen'}
      </div>
    </div>
  )
}

function SpotifyModule({ settings }) {
  const parsed = parseSpotify(settings.url)
  const [authed, setAuthed] = useState(spotifyAuthed())
  useEffect(() => subscribeSpotifyAuth(setAuthed), [])

  if (!settings.url?.trim()) {
    return (
      <p className="text-sm text-gray-500">
        Add a Spotify link with the <GearIcon className="inline h-4 w-4" /> in customize mode (Share → Copy
        link to a playlist, album, track, or show).
      </p>
    )
  }
  if (!parsed) {
    return <p className="text-sm text-gray-500">That doesn’t look like a Spotify link.</p>
  }

  // Full playback when a Spotify app is configured and the kiosk is logged in;
  // otherwise the embed (30-second previews unless signed in to Spotify).
  if (hasSpotifyClientId && authed) {
    return <SpotifyPlayer parsed={parsed} label={settings.label} />
  }
  return (
    <div>
      <SpotifyEmbed parsed={parsed} />
      {hasSpotifyClientId && (
        <p className="mt-2 text-xs text-gray-600">
          Log in with Spotify Premium in the <GearIcon className="inline h-3.5 w-3.5" /> settings to play full
          tracks.
        </p>
      )}
    </div>
  )
}

function ModuleBody({ module }) {
  const { type, settings } = module
  switch (type) {
    case 'meals':
      return <MealsModule />
    case 'shopping':
      return <ShoppingModule />
    case 'weather':
      return <WeatherModule settings={settings} />
    case 'smarthome':
      return <SmartHomeModule controls={settings.controls} />
    case 'stocks':
      return <StocksModule watchlistId={settings.watchlistId} />
    case 'goals':
      return <GoalsModule sectionId={settings.sectionId} />
    case 'calendar':
      return <CalendarModule />
    case 'traffic':
      return <TrafficModule settings={settings} />
    case 'spotify':
      return <SpotifyModule settings={settings} />
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
  const [sections] = useLocalState('goals-sections', GOALS_SEED, migrateColors)
  return (
    <ChoiceList
      value={value}
      onChange={onChange}
      options={sections.map((s) => ({ id: s.id, label: s.title, color: s.color }))}
    />
  )
}

function SpotifyConfig({ settings, onChange }) {
  const parsed = parseSpotify(settings.url)
  const url = settings.url?.trim()
  const [authed, setAuthed] = useState(spotifyAuthed())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => subscribeSpotifyAuth(setAuthed), [])

  const doLogin = async () => {
    setErr('')
    setBusy(true)
    try {
      await spotifyLogin()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Label (optional)</label>
        <input
          className={fieldClass}
          placeholder="e.g. Morning Mix"
          value={settings.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Spotify link</label>
        <input
          className={fieldClass}
          placeholder="https://open.spotify.com/playlist/…"
          value={settings.url || ''}
          onChange={(e) => onChange({ url: e.target.value })}
        />
        {url && (
          <p className={`mt-1 text-xs ${parsed ? 'text-gain' : 'text-loss'}`}>
            {parsed
              ? `${parsed.type.charAt(0).toUpperCase()}${parsed.type.slice(1)} linked.`
              : 'Couldn’t read that Spotify link.'}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-600">
          In Spotify, use Share → Copy link for a playlist, album, track, or show, then paste it here.
        </p>
      </div>

      <div className="border-t border-border pt-4">
        <label className="mb-1 block text-xs text-gray-500">Full playback (Spotify Premium)</label>
        {!hasSpotifyClientId ? (
          <p className="text-xs text-gray-600">
            Set <span className="font-mono">VITE_SPOTIFY_CLIENT_ID</span> to enable login and full-track
            playback. Without it the player shows 30-second previews.
          </p>
        ) : authed ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-gain">
              <SpotifyIcon className="h-4 w-4" /> Logged in to Spotify
            </span>
            <Button variant="ghost" className="px-4 py-2" onClick={spotifyLogout}>
              Log out
            </Button>
          </div>
        ) : (
          <>
            <Button onClick={doLogin} disabled={busy}>
              <span className="flex items-center gap-2">
                <SpotifyIcon className="h-4 w-4" /> {busy ? 'Opening…' : 'Log in with Spotify'}
              </span>
            </Button>
            <p className="mt-1 text-xs text-gray-600">
              Opens a popup to sign in. Premium is required to stream full tracks; the login applies to all
              Spotify modules on this device.
            </p>
          </>
        )}
        {err && <p className="mt-1 text-xs text-loss">{err}</p>}
      </div>
    </div>
  )
}

function WeatherConfig({ settings, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Location</label>
        <input
          className={fieldClass}
          placeholder="City (e.g. Millbrae, CA or London)"
          value={settings.location || ''}
          onChange={(e) => onChange({ location: e.target.value })}
        />
        <p className="mt-1 text-xs text-gray-600">
          Live conditions from Open-Meteo — free, no API key required.
        </p>
      </div>
      <div>
        <label className="mb-2 block text-xs text-gray-500">Units</label>
        <Tabs
          tabs={[
            { id: 'fahrenheit', label: '°F' },
            { id: 'celsius', label: '°C' },
          ]}
          active={settings.units || 'fahrenheit'}
          onChange={(units) => onChange({ units })}
        />
      </div>
    </div>
  )
}

// Touch-friendly 12-hour time picker (hour : minute + AM/PM), editing a value in
// minutes-from-midnight.
const timeSelectClass =
  'rounded-lg border border-border bg-bg px-2 py-2 text-sm text-white outline-none focus:border-accent'
function TimeField({ value, onChange }) {
  const { h, m, ap } = minToParts(value)
  const set = (nh, nm, nap) => onChange(partsToMin(nh, nm, nap))
  return (
    <div className="flex items-center gap-1">
      <select className={timeSelectClass} value={h} onChange={(e) => set(Number(e.target.value), m, ap)}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="text-gray-500">:</span>
      <select className={timeSelectClass} value={m} onChange={(e) => set(h, Number(e.target.value), ap)}>
        {Array.from({ length: 12 }, (_, i) => i * 5).map((n) => (
          <option key={n} value={n}>
            {String(n).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select className={timeSelectClass} value={ap} onChange={(e) => set(h, m, e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

export function TrafficConfig({ settings, onChange }) {
  const via = settings.via || []
  const setVia = (next) => onChange({ via: next })
  // Use the raw saved windows while editing (so a half-finished window doesn't
  // vanish); fall back to the defaults when none are set yet.
  const windows =
    Array.isArray(settings.windows) && settings.windows.length ? settings.windows : COMMUTE_WINDOWS
  const setWindows = (next) => onChange({ windows: next })
  const invalid = windows.some((w) => w.end <= w.start)
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Label (optional)</label>
        <input
          className={fieldClass}
          placeholder="e.g. Commute to work"
          value={settings.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Start location</label>
        <input
          className={fieldClass}
          placeholder="Home address, place, or business name"
          value={settings.origin || ''}
          onChange={(e) => onChange({ origin: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Destination</label>
        <input
          className={fieldClass}
          placeholder="Work address, place, or business name"
          value={settings.destination || ''}
          onChange={(e) => onChange({ destination: e.target.value })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Via (optional)</label>
        <p className="mb-2 text-xs text-gray-600">
          Force a specific route through these stops in order — a highway, exit, or place (e.g. “I-280 N”).
        </p>
        <div className="space-y-2">
          {via.map((stop, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={fieldClass}
                placeholder="Road or place to route through"
                value={stop}
                onChange={(e) => setVia(via.map((v, k) => (k === i ? e.target.value : v)))}
              />
              <button
                type="button"
                onClick={() => setVia(via.filter((_, k) => k !== i))}
                aria-label="Remove waypoint"
                className="rounded-lg bg-loss/15 p-3 text-loss active:scale-95"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setVia([...via, ''])}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-300 active:scale-95"
          >
            <PlusIcon className="h-4 w-4" /> Add waypoint
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Polling windows</label>
        <p className="mb-2 text-xs text-gray-600">
          Live traffic only refreshes (every 5 minutes, while the dashboard is on-screen) during these
          times of day — set each window’s start and end below.
        </p>
        <div className="space-y-2">
          {windows.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <TimeField
                value={w.start}
                onChange={(v) => setWindows(windows.map((x, k) => (k === i ? { ...x, start: v } : x)))}
              />
              <span className="text-xs text-gray-500">to</span>
              <TimeField
                value={w.end}
                onChange={(v) => setWindows(windows.map((x, k) => (k === i ? { ...x, end: v } : x)))}
              />
              <button
                type="button"
                onClick={() => setWindows(windows.filter((_, k) => k !== i))}
                aria-label="Remove window"
                className="ml-auto rounded-lg bg-loss/15 p-3 text-loss active:scale-95"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWindows([...windows, { start: 9 * 60, end: 10 * 60 }])}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-300 active:scale-95"
          >
            <PlusIcon className="h-4 w-4" /> Add window
          </button>
        </div>
        {invalid && (
          <p className="mt-1 text-xs text-loss">Each window’s end time must be after its start.</p>
        )}
        {windows.length === 0 && (
          <p className="mt-1 text-xs text-gray-600">No windows set — defaults to 6–8am and 4–6pm.</p>
        )}
      </div>
      <p className="text-xs text-gray-600">
        Shows the current driving time with live traffic from Google.{' '}
        {hasGoogleMapsKey
          ? ''
          : 'Add VITE_GOOGLE_MAPS_API_KEY for live data — showing demo estimates until then.'}
      </p>
    </div>
  )
}

function ModuleConfig({ module, onPatch }) {
  switch (module.type) {
    case 'spotify':
      return <SpotifyConfig settings={module.settings} onChange={onPatch} />
    case 'weather':
      return <WeatherConfig settings={module.settings} onChange={onPatch} />
    case 'smarthome':
      return (
        <SmartHomeConfig value={module.settings.controls} onChange={(controls) => onPatch({ controls })} />
      )
    case 'stocks':
      return (
        <StocksConfig
          value={module.settings.watchlistId}
          onChange={(watchlistId) => onPatch({ watchlistId })}
        />
      )
    case 'goals':
      return <GoalsConfig value={module.settings.sectionId} onChange={(sectionId) => onPatch({ sectionId })} />
    case 'traffic':
      return <TrafficConfig settings={module.settings} onChange={onPatch} />
    default:
      return null
  }
}

// =============================================================================
// Module card + sortable wrapper
// =============================================================================

function ModuleCard({
  title,
  enabled,
  editing,
  hasConfig,
  canRemove,
  dragHandleProps,
  onToggle,
  onConfigure,
  onRemove,
  onOpen,
  children,
}) {
  // Tappable (to open a full page) only outside customize mode.
  const tappable = !!onOpen && !editing
  return (
    <Card
      className={[
        editing && !enabled ? 'opacity-60' : '',
        tappable ? 'cursor-pointer transition-colors hover:border-accent/40' : '',
      ].join(' ')}
      onClick={tappable ? onOpen : undefined}
    >
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
        {tappable && <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-500" aria-hidden="true" />}
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
        {editing && canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${title}`}
            className="rounded-lg bg-loss/15 p-2 text-loss active:scale-95"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
        {editing && <Toggle checked={enabled} onChange={onToggle} label={`Show ${title}`} />}
      </div>
      {children}
    </Card>
  )
}

function SortableModule({ id, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Hide the original while dragging — the DragOverlay renders the moving card,
    // and this slot stays as the drop placeholder.
    opacity: isDragging ? 0 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

// A whole dashboard column as a drop target, so a module can be dropped into an
// empty column or below the last card.
function DroppableColumn({ id, children }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className="min-h-[120px] min-w-0 flex-1 space-y-6">
      {children}
    </div>
  )
}

// --- Two-column model helpers ------------------------------------------------
// Each module carries a `column` (0 = left, 1 = right); within a column its
// order is its order in the flat modules array. The columns are independent, so
// dragging slots a module into an exact position in whichever column it lands.
const moduleColumn = (m) => (m.column === 1 ? 1 : 0)
const columnIdLists = (mods) => [
  mods.filter((m) => moduleColumn(m) === 0).map((m) => m.id),
  mods.filter((m) => moduleColumn(m) === 1).map((m) => m.id),
]
// Rebuild the flat array (left column first, then right) from two id lists.
const rebuildModules = (mods, leftIds, rightIds) => {
  const byId = new Map(mods.map((m) => [m.id, m]))
  return [
    ...leftIds.map((id) => ({ ...byId.get(id), column: 0 })),
    ...rightIds.map((id) => ({ ...byId.get(id), column: 1 })),
  ]
}
// Column index for a drag id, which may be a module id or a column container id.
const columnOfDragId = (mods, dragId) => {
  if (dragId === 'col-0') return 0
  if (dragId === 'col-1') return 1
  const m = mods.find((x) => x.id === dragId)
  return m ? moduleColumn(m) : null
}

// Module types that can be added multiple times from the Add Module screen.
const ADDABLE = [
  { type: 'traffic', Icon: CarIcon, label: 'Traffic route', desc: 'Live drive time with current traffic' },
  { type: 'weather', Icon: CloudIcon, label: 'Weather', desc: 'Current conditions for a location' },
  { type: 'spotify', Icon: SpotifyIcon, label: 'Spotify', desc: 'Embed a playlist, album, or track' },
]

// Picker for adding modules: add a new instance of a multi-type module (Traffic,
// Weather), or re-show any hidden singletons.
function AddModuleModal({ open, onClose, modules, onShow, onAdd }) {
  const hidden = modules.filter((m) => MODULE_TYPES[m.type] && !MODULE_TYPES[m.type].multi && !m.enabled)
  return (
    <Modal open={open} onClose={onClose} title="Add a module" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-2">
        {ADDABLE.filter((a) => MODULE_TYPES[a.type]?.multi).map((a) => (
          <button
            key={a.type}
            type="button"
            onClick={() => onAdd(a.type)}
            className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left text-gray-200 active:scale-[0.98]"
          >
            <a.Icon className="h-5 w-5 flex-shrink-0 text-accent" />
            <span className="flex-1">
              <span className="block font-semibold text-white">{a.label}</span>
              <span className="text-xs text-gray-500">{a.desc}</span>
            </span>
            <PlusIcon className="h-5 w-5 text-accent" />
          </button>
        ))}

        {hidden.length > 0 && (
          <>
            <div className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Hidden modules
            </div>
            {hidden.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onShow(m.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left text-gray-200 active:scale-[0.98]"
              >
                <span className="flex-1 font-semibold text-white">{MODULE_TYPES[m.type].title}</span>
                <PlusIcon className="h-5 w-5 text-accent" />
              </button>
            ))}
          </>
        )}
      </div>
    </Modal>
  )
}

// =============================================================================
// Page
// =============================================================================

export default function Dashboard() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useLocalState('dashboard', defaultDashboard(), migrateDashboard)
  const [editing, setEditing] = useState(false)
  const [configFor, setConfigFor] = useState(null) // instance id
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState(null) // module being dragged (for the overlay)
  const [dragWidth, setDragWidth] = useState(null) // its width, so the overlay matches

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const modules = cfg.modules
  const setModules = (fn) => setCfg((c) => ({ ...c, modules: fn(c.modules) }))
  const setEnabled = (id, on) =>
    setModules((ms) => ms.map((m) => (m.id === id ? { ...m, enabled: on } : m)))
  const patchSettings = (id, patch) =>
    setModules((ms) => ms.map((m) => (m.id === id ? { ...m, settings: { ...m.settings, ...patch } } : m)))
  const removeModule = (id) => setModules((ms) => ms.filter((m) => m.id !== id))

  const addInstance = (type) => {
    const inst = newInstance(type)
    setModules((ms) => {
      const [left, right] = columnIdLists(ms)
      return [...ms, { ...inst, column: left.length <= right.length ? 0 : 1 }]
    })
    setAdding(false)
    if (MODULE_TYPES[type].configurable) setConfigFor(inst.id) // jump straight into setup
  }
  const showModule = (id) => {
    setEnabled(id, true)
    setAdding(false)
  }

  const onDragStart = ({ active }) => {
    setDragId(active.id)
    setDragWidth(active.rect?.current?.initial?.width ?? null)
  }
  const clearDrag = () => {
    setDragId(null)
    setDragWidth(null)
  }

  // Live-move a module into the other column as it's dragged over it, so the two
  // columns behave as independent lists (within-column reordering is handled by
  // the sortable strategy and committed in onDragEnd).
  const onDragOver = ({ active, over }) => {
    if (!over) return
    setModules((ms) => {
      const activeCol = columnOfDragId(ms, active.id)
      const overCol = columnOfDragId(ms, over.id)
      if (activeCol == null || overCol == null || activeCol === overCol) return ms
      const cols = columnIdLists(ms)
      cols[activeCol] = cols[activeCol].filter((id) => id !== active.id)
      const overIsContainer = over.id === 'col-0' || over.id === 'col-1'
      const overIdx = overIsContainer ? cols[overCol].length : cols[overCol].indexOf(over.id)
      const at = overIdx < 0 ? cols[overCol].length : overIdx
      cols[overCol] = [...cols[overCol].slice(0, at), active.id, ...cols[overCol].slice(at)]
      return rebuildModules(ms, cols[0], cols[1])
    })
  }

  const onDragEnd = ({ active, over }) => {
    clearDrag()
    if (!over) return
    setModules((ms) => {
      const activeCol = columnOfDragId(ms, active.id)
      const overCol = columnOfDragId(ms, over.id)
      if (activeCol == null || overCol == null || activeCol !== overCol) return ms
      const cols = columnIdLists(ms)
      const arr = cols[activeCol]
      const from = arr.indexOf(active.id)
      const overIsContainer = over.id === 'col-0' || over.id === 'col-1'
      const to = overIsContainer ? arr.length - 1 : arr.indexOf(over.id)
      if (from === -1 || to === -1 || from === to) return ms
      cols[activeCol] = arrayMove(arr, from, to)
      return rebuildModules(ms, cols[0], cols[1])
    })
  }

  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const visible = editing ? modules : modules.filter((m) => m.enabled)
  const configModule = modules.find((m) => m.id === configFor) || null

  const renderCard = (m, handleProps) => {
    const meta = MODULE_TYPES[m.type]
    const body = m.enabled ? (
      <ModuleBody module={m} />
    ) : (
      <p className="text-sm text-gray-500">Hidden — toggle to show this on your dashboard.</p>
    )
    // The Traffic module opens its full page when tapped (works even if the
    // Traffic page isn't in the menu); `m` identifies which route to show.
    const onOpen =
      m.type === 'traffic' && m.enabled ? () => navigate(`/traffic?m=${m.id}`) : undefined
    return (
      <ModuleCard
        title={moduleTitle(m)}
        enabled={m.enabled}
        editing={editing}
        hasConfig={meta.configurable}
        canRemove={meta.multi}
        dragHandleProps={handleProps}
        onToggle={(on) => setEnabled(m.id, on)}
        onConfigure={() => setConfigFor(m.id)}
        onRemove={() => removeModule(m.id)}
        onOpen={onOpen}
      >
        {body}
      </ModuleCard>
    )
  }

  // Two independent columns. Each is its own ordered list, so a module slots
  // into the exact position in whichever column it's dragged to (no waterfall
  // from one column into the next). The live view and Customize mode share the
  // same layout, so what you arrange is what you get.
  const moduleById = new Map(visible.map((m) => [m.id, m]))
  const columns = columnIdLists(visible)

  const columnContent = (ids, interactive) =>
    ids.map((id) =>
      interactive ? (
        <SortableModule key={id} id={id}>
          {(handle) => renderCard(moduleById.get(id), handle)}
        </SortableModule>
      ) : (
        <div key={id}>{renderCard(moduleById.get(id), null)}</div>
      ),
    )

  const grid = editing ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={clearDrag}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {[0, 1].map((col) => (
          <DroppableColumn key={col} id={`col-${col}`}>
            <SortableContext items={columns[col]} strategy={verticalListSortingStrategy}>
              {columnContent(columns[col], true)}
            </SortableContext>
          </DroppableColumn>
        ))}
      </div>
      <DragOverlay>
        {dragId ? (
          <div style={{ width: dragWidth ?? undefined }}>{renderCard(moduleById.get(dragId), null)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  ) : (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {[0, 1].map((col) => (
        <div key={col} className="min-w-0 flex-1 space-y-6">
          {columnContent(columns[col], false)}
        </div>
      ))}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Home" subtitle={today}>
        <div className="flex items-center gap-2">
          {editing && (
            <Button variant="ghost" onClick={() => setAdding(true)}>
              <span className="flex items-center gap-2">
                <PlusIcon className="h-5 w-5" /> Add Module
              </span>
            </Button>
          )}
          <Button variant={editing ? 'primary' : 'ghost'} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Customize'}
          </Button>
        </div>
      </PageHeader>

      {editing && (
        <p className="mb-4 text-sm text-gray-500">
          Drag <GripIcon className="inline h-4 w-4" /> to reorder, toggle to show/hide, tap{' '}
          <GearIcon className="inline h-4 w-4" /> to configure, and use <span className="text-gray-300">Add Module</span> for
          more.
        </p>
      )}

      {visible.length === 0 ? (
        <Card className="text-center text-gray-500">
          All modules are hidden. Tap <span className="text-accent">Customize</span> to add some.
        </Card>
      ) : (
        grid
      )}

      {/* Per-module configuration */}
      <Modal
        open={!!configModule}
        onClose={() => setConfigFor(null)}
        title={configModule ? `Configure ${moduleTitle(configModule)}` : ''}
        footer={<Button onClick={() => setConfigFor(null)}>Done</Button>}
      >
        {configModule && (
          <ModuleConfig module={configModule} onPatch={(patch) => patchSettings(configModule.id, patch)} />
        )}
      </Modal>

      {/* Add a module */}
      <AddModuleModal
        open={adding}
        onClose={() => setAdding(false)}
        modules={modules}
        onShow={showModule}
        onAdd={addInstance}
      />
    </div>
  )
}
