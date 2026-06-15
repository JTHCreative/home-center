import { useMemo, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import Tabs from '../components/Tabs.jsx'
import { useLocalState } from '../lib/storage.js'
import {
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  SunriseIcon,
  TrashIcon,
} from '../components/Icons.jsx'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOTS = ['Breakfast', 'Lunch', 'Dinner']
const DAY_SET = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

// Each meal slot gets a time-of-day theme: color + icon for its row.
const SLOT_THEME = {
  Breakfast: { color: '#D29922', Icon: SunriseIcon }, // yellow / morning
  Lunch: { color: '#39D353', Icon: SunIcon }, // green / midday
  Dinner: { color: '#58A6FF', Icon: MoonIcon }, // blue / night
}
const TAKEOUT_COLOR = '#F0883E'

// Top-level subpages — cycle the page instead of scrolling (touch-friendly).
const SUBPAGES = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'household', label: 'Household' },
  { id: 'meals', label: 'Meals' },
  { id: 'groceries', label: 'Groceries' },
]

// Household member accent palette (tap to pick when adding/editing a member).
const MEMBER_COLORS = ['#58A6FF', '#39D353', '#F0883E', '#BC8CFF', '#F85149', '#D29922', '#8B949E']

const SEED_MEMBERS = [
  { id: crypto.randomUUID(), name: 'Justin', color: '#58A6FF' },
  { id: crypto.randomUUID(), name: 'Kitty', color: '#F0883E' },
]

// A planned slot is { mealId, providers: [id], guests: [id] }. Older saves
// stored just the mealId string, so read through these helpers to stay compatible.
const slotMealId = (v) => (typeof v === 'string' ? v : v?.mealId || undefined)
const slotProviders = (v) => (typeof v === 'string' ? [] : v?.providers || [])
const slotGuests = (v) => (typeof v === 'string' ? [] : v?.guests || [])

// Initials for a member badge (first two word-initials, uppercased).
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')

// --- Date helpers (local, no library; weeks start Sunday) --------------------
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
  c.setDate(c.getDate() - c.getDay())
  return c
}

// Plans are stored per week: { [weekKey]: { [day]: { [slot]: mealId } } }.
// Older saves were a flat { [day]: { [slot]: mealId } } — fold those into the
// current week so existing plans aren't lost.
function migratePlan(stored) {
  if (!stored || typeof stored !== 'object') return {}
  const keys = Object.keys(stored)
  if (keys.length && keys.some((k) => DAY_SET.has(k))) {
    return { [iso(sundayOf(new Date()))]: stored }
  }
  return stored
}

// A meal is either a custom 'recipe' (with ingredients) or 'takeout' (purchased).
const SEED_MEALS = [
  {
    id: 'r-oats',
    type: 'recipe',
    name: 'Overnight Oats',
    ingredients: ['Rolled oats', 'Milk', 'Chia seeds', 'Honey', 'Blueberries'],
    instructions: 'Combine oats, milk, and chia. Refrigerate overnight. Top with honey and blueberries.',
  },
  {
    id: 'r-tacos',
    type: 'recipe',
    name: 'Chicken Tacos',
    ingredients: ['Chicken breast', 'Tortillas', 'Lime', 'Onion', 'Cilantro', 'Avocado'],
    instructions: 'Season and grill chicken. Warm tortillas. Assemble with onion, cilantro, lime, and avocado.',
  },
]

const mealType = (m) => m.type || 'recipe' // older saved data has no type

// Draft ingredients are {id, qty, text} rows so each gets its own touch-friendly fields.
const emptyMeal = () => ({
  id: crypto.randomUUID(),
  type: 'recipe',
  name: '',
  ingredients: [{ id: crypto.randomUUID(), qty: '', text: '' }],
  instructions: '',
  place: '',
  details: '',
  cost: '',
})

// Normalize a stored ingredient (string from older data, or {name, qty}).
const ingName = (ing) => (typeof ing === 'string' ? ing : ing?.name || '')
const ingQty = (ing) => (typeof ing === 'string' ? '' : ing?.qty || '')

// Grocery list sections, shown as separate columns. 'other' catches anything
// that doesn't match (sauces, grains, seasonings, etc.) so nothing is dropped.
const GROCERY_CATEGORIES = [
  { id: 'produce', label: 'Fruits & Veggies', color: '#39D353' },
  { id: 'meatdairy', label: 'Meats & Dairy', color: '#F85149' },
  { id: 'other', label: 'Other', color: '#8B949E' },
]

// Keyword → category. Produce is checked first so "eggplant" / "butternut
// squash" land in produce before "egg" / "butter" can claim them for meat & dairy.
const CAT_KEYWORDS = {
  produce: ['onion', 'garlic', 'tomato', 'lettuce', 'spinach', 'kale', 'carrot', 'potato',
    'pepper', 'bell', 'broccoli', 'cucumber', 'celery', 'mushroom', 'zucchini', 'avocado',
    'cilantro', 'parsley', 'basil', 'corn', 'beans', 'peas', 'cabbage', 'ginger', 'scallion',
    'leek', 'squash', 'eggplant', 'asparagus', 'jalapeno', 'radish', 'beet', 'chard', 'herb',
    'apple', 'banana', 'berry', 'berries', 'blueberry', 'strawberry', 'raspberry',
    'blackberry', 'grape', 'orange', 'lemon', 'lime', 'mango', 'peach', 'pear', 'pineapple',
    'melon', 'watermelon', 'cantaloupe', 'cherry', 'kiwi', 'plum', 'apricot', 'fig',
    'pomegranate', 'coconut', 'fruit', 'veg'],
  meatdairy: ['chicken', 'beef', 'pork', 'steak', 'bacon', 'sausage', 'turkey', 'ham', 'lamb',
    'fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'crab', 'mince', 'ground beef',
    'ground turkey', 'ground pork', 'ribs', 'chorizo', 'meat', 'filet', 'thigh', 'breast',
    'wing', 'brisket', 'cod', 'tilapia',
    'milk', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'egg', 'mozzarella', 'cheddar',
    'parmesan', 'feta', 'ricotta', 'ghee', 'dairy'],
}
const CAT_ORDER = ['produce', 'meatdairy']
function categorize(name) {
  const n = name.toLowerCase()
  for (const cat of CAT_ORDER) {
    if (CAT_KEYWORDS[cat].some((k) => n.includes(k))) return cat
  }
  return 'other'
}

export default function Meals() {
  const [meals, setMeals] = useLocalState('meals-recipes', SEED_MEALS)
  const [plans, setPlans] = useLocalState('meals-plan', {}, migratePlan)
  const [checkedByWeek, setCheckedByWeek] = useLocalState('meals-grocery-checked', {})
  const [members, setMembers] = useLocalState('meals-members', SEED_MEMBERS)
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))

  const [mealDraft, setMealDraft] = useState(null)
  const [slotDraft, setSlotDraft] = useState(null) // { day, slot, mealId, providers, guests }
  const [memberDraft, setMemberDraft] = useState(null) // { id, name, color }
  const [memberMealsFor, setMemberMealsFor] = useState(null) // member id whose meal list is being edited
  const [mealsTab, setMealsTab] = useState('recipe') // Meals library: 'recipe' | 'takeout'
  const [subpage, setSubpage] = useState('schedule') // Schedule | Household | Meals | Groceries

  const weekKey = iso(weekStart)
  const plan = useMemo(() => plans[weekKey] || {}, [plans, weekKey])
  const checked = checkedByWeek[weekKey] || {}
  const isCurrentWeek = weekKey === iso(sundayOf(new Date()))

  const mealById = useMemo(() => Object.fromEntries(meals.map((m) => [m.id, m])), [meals])
  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const visibleMeals = useMemo(() => meals.filter((m) => mealType(m) === mealsTab), [meals, mealsTab])

  // Auto-generated grocery list: ingredients across all recipes planned for the
  // selected week (takeout has nothing to buy), grouped by name with quantities.
  const grocery = useMemo(() => {
    const map = new Map() // lower name -> { name, qtys: [] }
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const m = mealById[slotMealId(plan[day]?.[slot])]
        if (!m || mealType(m) !== 'recipe') continue
        for (const ing of m.ingredients || []) {
          const name = ingName(ing).trim()
          if (!name) continue
          const key = name.toLowerCase()
          const entry = map.get(key) || { name, qtys: [] }
          const qty = ingQty(ing).trim()
          if (qty) entry.qtys.push(qty)
          map.set(key, entry)
        }
      }
    }
    return [...map.values()]
      .map((e) => ({ name: e.name, label: e.qtys.length ? `${e.qtys.join(' + ')} ${e.name}` : e.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [plan, mealById])

  // Group the grocery list into category columns (meats, veggies, …).
  const groceryByCat = useMemo(() => {
    const groups = {}
    for (const item of grocery) (groups[categorize(item.name)] ||= []).push(item)
    return groups
  }, [grocery])

  // --- Slot assignment (meal + providers + guests) --------------------------
  const openSlot = (day, slot) => {
    const v = plan[day]?.[slot]
    setSlotDraft({
      day,
      slot,
      mealId: slotMealId(v) || null,
      providers: slotProviders(v),
      guests: slotGuests(v),
    })
  }
  const saveSlot = () => {
    const { day, slot, mealId, providers, guests } = slotDraft
    const value = mealId ? { mealId, providers, guests } : undefined
    setPlans((p) => ({
      ...p,
      [weekKey]: { ...p[weekKey], [day]: { ...p[weekKey]?.[day], [slot]: value } },
    }))
    setSlotDraft(null)
  }

  // --- Household member ops --------------------------------------------------
  const saveMember = () => {
    if (!memberDraft.name.trim()) return
    const draft = { ...memberDraft, name: memberDraft.name.trim() }
    setMembers((list) => {
      const exists = list.some((m) => m.id === draft.id)
      return exists ? list.map((m) => (m.id === draft.id ? draft : m)) : [...list, draft]
    })
    setMemberDraft(null)
  }
  // Toggle a meal in a member's personal list (who likes / makes / orders what).
  const toggleMemberMeal = (memberId, mealId) =>
    setMembers((list) =>
      list.map((m) => {
        if (m.id !== memberId) return m
        const cur = m.meals || []
        return { ...m, meals: cur.includes(mealId) ? cur.filter((x) => x !== mealId) : [...cur, mealId] }
      }),
    )

  const deleteMember = (id) => {
    setMembers((list) => list.filter((m) => m.id !== id))
    // Drop the member from every provider/guest list across all weeks.
    setPlans((p) => {
      const next = {}
      for (const [wk, days] of Object.entries(p)) {
        next[wk] = {}
        for (const [day, slots] of Object.entries(days)) {
          next[wk][day] = {}
          for (const [slot, val] of Object.entries(slots)) {
            if (val && typeof val === 'object') {
              next[wk][day][slot] = {
                ...val,
                providers: (val.providers || []).filter((x) => x !== id),
                guests: (val.guests || []).filter((x) => x !== id),
              }
            } else {
              next[wk][day][slot] = val
            }
          }
        }
      }
      return next
    })
  }

  const toggleChecked = (key) =>
    setCheckedByWeek((c) => ({
      ...c,
      [weekKey]: { ...c[weekKey], [key]: !c[weekKey]?.[key] },
    }))

  // Week label, e.g. "Jun 14 – Jun 20"
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

  const saveMeal = () => {
    if (!mealDraft.name.trim()) return
    const base = { id: mealDraft.id, type: mealDraft.type, name: mealDraft.name.trim() }
    const meal =
      mealDraft.type === 'takeout'
        ? {
            ...base,
            place: mealDraft.place.trim(),
            details: mealDraft.details.trim(),
            cost: mealDraft.cost === '' ? null : Number(mealDraft.cost),
          }
        : {
            ...base,
            ingredients: mealDraft.ingredients
              .map((i) => ({ name: i.text.trim(), qty: i.qty.trim() }))
              .filter((i) => i.name),
            instructions: mealDraft.instructions.trim(),
          }
    setMeals((list) => {
      const exists = list.some((m) => m.id === meal.id)
      return exists ? list.map((m) => (m.id === meal.id ? meal : m)) : [...list, meal]
    })
    setMealDraft(null)
  }

  const editMeal = (m) =>
    setMealDraft({
      id: m.id,
      type: mealType(m),
      name: m.name,
      ingredients: (m.ingredients?.length ? m.ingredients : [{ name: '', qty: '' }]).map((ing) => ({
        id: crypto.randomUUID(),
        qty: ingQty(ing),
        text: ingName(ing),
      })),
      instructions: m.instructions || '',
      place: m.place || '',
      details: m.details || '',
      cost: m.cost ?? '',
    })

  // Ingredient-row editing within the recipe draft.
  const addIngredient = () =>
    setMealDraft((d) => ({
      ...d,
      ingredients: [...d.ingredients, { id: crypto.randomUUID(), qty: '', text: '' }],
    }))
  const setIngredient = (id, patch) =>
    setMealDraft((d) => ({ ...d, ingredients: d.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const removeIngredient = (id) =>
    setMealDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== id) }))

  const deleteMeal = (id) => {
    setMeals((list) => list.filter((m) => m.id !== id))
    // Drop the meal from every member's personal list.
    setMembers((list) => list.map((m) => ({ ...m, meals: (m.meals || []).filter((x) => x !== id) })))
    // Clear the meal from every planned slot across all weeks.
    setPlans((p) => {
      const next = {}
      for (const [wk, days] of Object.entries(p)) {
        next[wk] = {}
        for (const [day, slots] of Object.entries(days)) {
          next[wk][day] = {}
          for (const [slot, val] of Object.entries(slots)) next[wk][day][slot] = slotMealId(val) === id ? undefined : val
        }
      }
      return next
    })
  }

  const isEditing = mealDraft && meals.some((m) => m.id === mealDraft.id)

  // Week navigator, shared by the Schedule and Groceries subpages.
  const weekNav = (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
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
          className={[
            'rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
            isCurrentWeek ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-300',
          ].join(' ')}
        >
          This Week
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
      <div className="text-right">
        <div className="text-xl font-bold text-white">{rangeLabel}</div>
        <div className={isCurrentWeek ? 'text-xs text-gray-500' : 'text-xs text-accent'}>
          {relLabel}
        </div>
      </div>
    </div>
  )

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader title="Meals">
        <Tabs tabs={SUBPAGES} active={subpage} onChange={setSubpage} />
      </PageHeader>

      {/* ---- Schedule (fills the available height) ---- */}
      {subpage === 'schedule' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {weekNav}
          <Card className="min-h-0 flex-1 overflow-auto p-0">
        <table className="h-full w-full border-collapse">
          <thead>
            <tr>
              <th className="w-28 border-b border-r border-border p-3 text-left text-sm font-semibold text-gray-500" />
              {DAYS.map((d, i) => (
                <th key={d} className="border-b border-r border-border p-3 text-base font-semibold text-gray-300">
                  <div>{d}</div>
                  <div className="font-mono text-xs font-normal text-gray-600">
                    {addDays(weekStart, i).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => {
              const theme = SLOT_THEME[slot]
              const SlotIcon = theme.Icon
              return (
              <tr key={slot} style={{ height: `${100 / SLOTS.length}%`, backgroundColor: `${theme.color}0D` }}>
                <td
                  className="border-b border-r border-border p-3"
                  style={{ borderLeft: `4px solid ${theme.color}` }}
                >
                  <div className="flex items-center gap-2 text-lg font-semibold" style={{ color: theme.color }}>
                    <SlotIcon className="h-7 w-7" />
                    <span>{slot}</span>
                  </div>
                </td>
                {DAYS.map((day) => {
                  const val = plan[day]?.[slot]
                  const m = mealById[slotMealId(val)]
                  const takeout = m && mealType(m) === 'takeout'
                  const accent = takeout ? TAKEOUT_COLOR : theme.color
                  const providers = slotProviders(val)
                  const guests = slotGuests(val)
                  return (
                    <td key={day} className="h-full border-b border-r border-border p-1.5 align-top">
                      <button
                        type="button"
                        onClick={() => openSlot(day, slot)}
                        className={[
                          'flex h-full min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-lg px-2 py-3 text-center text-base active:scale-[0.98]',
                          m ? 'font-semibold shadow-glow' : 'bg-white/5 text-gray-600',
                        ].join(' ')}
                        style={m ? { backgroundColor: `${accent}26`, color: accent, border: `1.5px solid ${accent}` } : undefined}
                      >
                        {m ? (
                          <>
                            <span className="line-clamp-2 leading-tight">{m.name}</span>
                            <span className="text-[11px] uppercase opacity-70">
                              {takeout ? 'Takeout' : 'Homecooked'}
                            </span>
                            {(providers.length > 0 || guests.length > 0) && (
                              <MemberRow
                                providers={providers}
                                guests={guests}
                                memberById={memberById}
                              />
                            )}
                          </>
                        ) : (
                          <PlusIcon className="h-7 w-7" />
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
              )
            })}
            </tbody>
          </table>
          </Card>
        </div>
      )}

      {/* ---- Household: one card per member, each with their own meals ---- */}
      {subpage === 'household' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Assign the meals & takeout each person likes to make or order.
            </p>
            <Button
              className="px-4 py-2"
              onClick={() => setMemberDraft({ id: crypto.randomUUID(), name: '', color: MEMBER_COLORS[0] })}
            >
              <span className="flex items-center gap-2"><PlusIcon className="h-4 w-4" /> Member</span>
            </Button>
          </div>
          {members.length === 0 ? (
            <Card className="text-sm text-gray-500">Add household members to get started.</Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((mem) => {
                const memMeals = (mem.meals || []).map((id) => mealById[id]).filter(Boolean)
                return (
                  <Card key={mem.id} style={{ borderColor: `${mem.color}66` }}>
                    <div className="mb-3 flex items-center gap-3 border-b border-border pb-3">
                      <MemberBadge member={mem} size={34} />
                      <h3 className="flex-1 truncate text-lg font-bold" style={{ color: mem.color }}>
                        {mem.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setMemberDraft({ ...mem })}
                        aria-label={`Edit ${mem.name}`}
                        className="rounded-lg bg-white/5 p-2 text-gray-300 active:scale-95"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <ul className="mb-3 space-y-1.5">
                      {memMeals.length === 0 && (
                        <li className="text-sm text-gray-500">No meals assigned yet.</li>
                      )}
                      {memMeals.map((m) => {
                        const takeout = mealType(m) === 'takeout'
                        return (
                          <li key={m.id} className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: takeout ? TAKEOUT_COLOR : 'rgb(var(--c-accent))' }}
                            />
                            <span className="flex-1 truncate text-gray-200">{m.name}</span>
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                              style={{
                                color: takeout ? TAKEOUT_COLOR : 'rgb(var(--c-accent))',
                                backgroundColor: takeout ? '#F0883E22' : 'rgb(var(--c-accent) / 0.15)',
                              }}
                            >
                              {takeout ? 'Takeout' : 'Recipe'}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleMemberMeal(mem.id, m.id)}
                              aria-label={`Remove ${m.name} from ${mem.name}`}
                              className="rounded p-1 text-gray-600 active:scale-95 active:text-loss"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setMemberMealsFor(mem.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-sm font-semibold text-gray-300 active:scale-95"
                    >
                      <PlusIcon className="h-4 w-4" /> Assign meals
                    </button>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Meals library: Recipe / Takeout tabs ---- */}
      {subpage === 'meals' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-300">Meals</h2>
              <Tabs
                tabs={[
                  { id: 'recipe', label: 'Recipe' },
                  { id: 'takeout', label: 'Takeout' },
                ]}
                active={mealsTab}
                onChange={setMealsTab}
              />
            </div>
            <Button
              className="px-4 py-2"
              onClick={() =>
                setMealDraft(mealsTab === 'takeout' ? { ...emptyMeal(), type: 'takeout' } : emptyMeal())
              }
            >
              <span className="flex items-center gap-2">
                <PlusIcon className="h-4 w-4" /> {mealsTab === 'takeout' ? 'Takeout' : 'Recipe'}
              </span>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleMeals.length === 0 && (
              <Card className="text-sm text-gray-500">No {mealsTab} meals yet.</Card>
            )}
            {visibleMeals.map((m) => {
              const takeout = mealType(m) === 'takeout'
              return (
                <Card key={m.id}>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white">{m.name}</h3>
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={
                          takeout
                            ? { backgroundColor: '#F0883E22', color: '#F0883E' }
                            : { backgroundColor: 'rgb(var(--c-accent) / 0.15)', color: 'rgb(var(--c-accent))' }
                        }
                      >
                        {takeout ? 'Takeout' : 'Recipe'}
                      </span>
                    </div>
                    {takeout ? (
                      <p className="mt-1 text-xs text-gray-400">
                        {m.place ? `from ${m.place}` : 'Takeout'}
                        {m.cost != null && m.cost !== '' ? ` · $${Number(m.cost).toFixed(2)}` : ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-400">{(m.ingredients || []).length} ingredients</p>
                    )}
                    {(takeout ? m.details : m.instructions) && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                        {takeout ? m.details : m.instructions}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => editMeal(m)}
                      aria-label={`Edit ${m.name}`}
                      className="flex flex-1 items-center justify-center rounded-lg bg-white/5 px-3 py-3 text-gray-300 active:scale-95"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMeal(m.id)}
                      aria-label={`Delete ${m.name}`}
                      className="flex flex-1 items-center justify-center rounded-lg bg-loss/15 px-3 py-3 text-loss active:scale-95"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- Groceries (for the selected week) ---- */}
      {subpage === 'groceries' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {weekNav}
          <h2 className="mb-3 text-lg font-semibold text-gray-300">
            Grocery List <span className="font-mono text-sm text-gray-500">({grocery.length})</span>
          </h2>
          {grocery.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500">Plan some recipe meals to build your list automatically.</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {GROCERY_CATEGORIES.filter((cat) => groceryByCat[cat.id]?.length).map((cat) => (
                <Card key={cat.id} style={{ borderColor: `${cat.color}66` }}>
                  <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <h3 className="flex-1 font-bold" style={{ color: cat.color }}>{cat.label}</h3>
                    <span className="font-mono text-xs text-gray-500">{groceryByCat[cat.id].length}</span>
                  </div>
                  <ul className="space-y-1">
                    {groceryByCat[cat.id].map((item) => {
                      const key = item.name.toLowerCase()
                      const isChecked = !!checked[key]
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => toggleChecked(key)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left active:bg-white/5"
                          >
                            <span
                              className={[
                                'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2',
                                isChecked ? 'border-gain bg-gain text-bg' : 'border-border',
                              ].join(' ')}
                            >
                              {isChecked && <CheckIcon className="h-4 w-4" />}
                            </span>
                            <span className={isChecked ? 'text-gray-500 line-through' : 'text-gray-200'}>
                              {item.label}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Slot editor: pick a meal, then assign providers & guests */}
      <SlotModal
        draft={slotDraft}
        setDraft={setSlotDraft}
        onClose={() => setSlotDraft(null)}
        onSave={saveSlot}
        meals={meals}
        members={members}
      />

      {/* Add / edit meal */}
      <Modal
        open={!!mealDraft}
        onClose={() => setMealDraft(null)}
        title={isEditing ? 'Edit Meal' : 'New Meal'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMealDraft(null)}>Cancel</Button>
            <Button onClick={saveMeal}>Save</Button>
          </>
        }
      >
        {mealDraft && (
          <div className="space-y-4">
            {/* Type toggle */}
            <div className="flex gap-2">
              {[
                { id: 'recipe', label: 'Recipe' },
                { id: 'takeout', label: 'Takeout' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMealDraft({ ...mealDraft, type: t.id })}
                  className={[
                    'flex-1 rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
                    mealDraft.type === t.id ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <input
              autoFocus
              className={fieldClass}
              placeholder={mealDraft.type === 'takeout' ? 'Meal name (e.g. Burrito Bowl)' : 'Recipe name'}
              value={mealDraft.name}
              onChange={(e) => setMealDraft({ ...mealDraft, name: e.target.value })}
            />

            {mealDraft.type === 'takeout' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Place</label>
                    <input
                      className={fieldClass}
                      placeholder="e.g. Chipotle"
                      value={mealDraft.place}
                      onChange={(e) => setMealDraft({ ...mealDraft, place: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Cost (optional)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className={fieldClass}
                      placeholder="0.00"
                      value={mealDraft.cost}
                      onChange={(e) => setMealDraft({ ...mealDraft, cost: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Details</label>
                  <textarea
                    rows={7}
                    className={fieldClass}
                    placeholder="What you ordered…"
                    value={mealDraft.details}
                    onChange={(e) => setMealDraft({ ...mealDraft, details: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Ingredients</label>
                  <div className="space-y-2">
                    {mealDraft.ingredients.map((ing) => (
                      <div key={ing.id} className="flex items-center gap-2">
                        <input
                          className={`${fieldClass} w-24 flex-shrink-0`}
                          placeholder="Qty"
                          value={ing.qty}
                          onChange={(e) => setIngredient(ing.id, { qty: e.target.value })}
                        />
                        <input
                          className={fieldClass}
                          placeholder="Ingredient (e.g. eggs)"
                          value={ing.text}
                          onChange={(e) => setIngredient(ing.id, { text: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => removeIngredient(ing.id)}
                          aria-label="Remove ingredient"
                          className="rounded-lg bg-loss/15 p-3 text-loss active:scale-95"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addIngredient}
                      className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-300 active:scale-95"
                    >
                      <PlusIcon className="h-4 w-4" /> Add ingredient
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Instructions</label>
                  <textarea
                    rows={7}
                    className={fieldClass}
                    placeholder="Steps…"
                    value={mealDraft.instructions}
                    onChange={(e) => setMealDraft({ ...mealDraft, instructions: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add / edit household member */}
      <MemberModal
        draft={memberDraft}
        setDraft={setMemberDraft}
        onClose={() => setMemberDraft(null)}
        onSave={saveMember}
        onDelete={() => {
          deleteMember(memberDraft.id)
          setMemberDraft(null)
        }}
        isExisting={memberDraft && members.some((m) => m.id === memberDraft.id)}
      />

      {/* Assign meals to a household member */}
      <MemberMealsModal
        member={members.find((m) => m.id === memberMealsFor) || null}
        meals={meals}
        onToggle={(mealId) => toggleMemberMeal(memberMealsFor, mealId)}
        onClose={() => setMemberMealsFor(null)}
      />
    </div>
  )
}

function MemberMealsModal({ member, meals, onToggle, onClose }) {
  if (!member) return null
  const selected = member.meals || []
  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title={`${member.name}'s meals`}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {meals.length === 0 ? (
        <p className="text-sm text-gray-500">No meals or takeout in the library yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {meals.map((m) => {
            const takeout = mealType(m) === 'takeout'
            const on = selected.includes(m.id)
            const color = takeout ? TAKEOUT_COLOR : '#58A6FF'
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggle(m.id)}
                className={[
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                  on ? 'shadow-glow' : 'bg-white/5',
                ].join(' ')}
                style={on ? { backgroundColor: `${color}22`, outline: `2px solid ${color}` } : undefined}
              >
                <span
                  className={[
                    'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2',
                    on ? 'text-bg' : 'border-border',
                  ].join(' ')}
                  style={on ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  {on && <CheckIcon className="h-4 w-4" />}
                </span>
                <span className="flex-1">
                  <span className="block font-medium text-white">{m.name}</span>
                  <span className="font-mono text-[10px] uppercase" style={{ color }}>
                    {takeout ? 'Takeout' : 'Recipe'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

// Small circular badge showing a member's initials in their color.
function MemberBadge({ member, size = 18, ring = false }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full font-mono font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: ring ? 'transparent' : member.color,
        color: ring ? member.color : '#0D1117',
        border: ring ? `1.5px solid ${member.color}` : 'none',
      }}
      title={member.name}
    >
      {initials(member.name)}
    </span>
  )
}

// Provider (filled) and guest (ringed) badges shown on a planner cell.
function MemberRow({ providers, guests, memberById }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {providers.map((id) => memberById[id] && <MemberBadge key={`p${id}`} member={memberById[id]} size={26} />)}
      {guests.map((id) => memberById[id] && <MemberBadge key={`g${id}`} member={memberById[id]} size={26} ring />)}
    </div>
  )
}

// Multi-select row of member chips for picking providers/guests.
function MemberPicker({ members, selected, onToggle }) {
  if (members.length === 0) {
    return <p className="text-xs text-gray-600">No household members yet — add some above.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((mem) => {
        const on = selected.includes(mem.id)
        return (
          <button
            key={mem.id}
            type="button"
            onClick={() => onToggle(mem.id)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold active:scale-95"
            style={{
              backgroundColor: on ? `${mem.color}22` : 'rgba(255,255,255,0.05)',
              color: on ? mem.color : '#8B949E',
              outline: on ? `2px solid ${mem.color}` : 'none',
            }}
          >
            <MemberBadge member={mem} ring={!on} />
            {mem.name}
          </button>
        )
      })}
    </div>
  )
}

function SlotModal({ draft, setDraft, onClose, onSave, meals, members }) {
  if (!draft) return null
  const toggleIn = (key, id) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id],
    }))
  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={`${draft.day} · ${draft.slot}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave}>Save</Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Meal selection */}
        <div>
          <label className="mb-2 block text-xs text-gray-500">Meal</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, mealId: null }))}
              className={[
                'rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                draft.mealId == null ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
              ].join(' ')}
            >
              <div className="font-medium">None</div>
              <div className="font-mono text-[10px] uppercase opacity-70">Empty slot</div>
            </button>
            {meals.map((m) => {
              const takeout = mealType(m) === 'takeout'
              const on = draft.mealId === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, mealId: m.id }))}
                  className={[
                    'rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                    on ? 'shadow-glow' : 'bg-white/5',
                  ].join(' ')}
                  style={on ? { backgroundColor: `${takeout ? TAKEOUT_COLOR : '#58A6FF'}22`, outline: `2px solid ${takeout ? TAKEOUT_COLOR : '#58A6FF'}` } : undefined}
                >
                  <div className="font-medium text-white">{m.name}</div>
                  <div
                    className="font-mono text-[10px] uppercase"
                    style={{ color: takeout ? TAKEOUT_COLOR : 'rgb(var(--c-accent))' }}
                  >
                    {takeout ? 'Takeout' : 'Recipe'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Providers & guests only make sense once a meal is chosen */}
        {draft.mealId && (
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs text-gray-500">Providers (cooking / bringing)</label>
              <MemberPicker
                members={members}
                selected={draft.providers}
                onToggle={(id) => toggleIn('providers', id)}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs text-gray-500">Guests (eating)</label>
              <MemberPicker
                members={members}
                selected={draft.guests}
                onToggle={(id) => toggleIn('guests', id)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function MemberModal({ draft, setDraft, onClose, onSave, onDelete, isExisting }) {
  if (!draft) return null
  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={isExisting ? 'Edit Member' : 'Add Member'}
      footer={
        <>
          {isExisting && (
            <Button variant="danger" onClick={onDelete}>
              <TrashIcon className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
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
            placeholder="Member name (e.g. Justin)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-2 block text-xs text-gray-500">Color</label>
          <div className="flex flex-wrap gap-3">
            {MEMBER_COLORS.map((c) => (
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
