import { Fragment, useEffect, useMemo, useState } from 'react'
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
import { useLocalState } from '../lib/storage.js'
import {
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  CloseIcon,
  FilterIcon,
  GripIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  SunriseIcon,
  TrashIcon,
} from '../components/Icons.jsx'
import { SEED_MEALS, SEED_MEMBERS } from '../lib/seeds.js'
import { MEMBER_COLORS, MemberBadge, MemberModal, MemberPicker } from '../components/Member.jsx'

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
  { id: 'meals', label: 'Meals' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'household', label: 'Household' },
]

// A planned slot is { mealId, providers: [id], guests: [id] }. Older saves
// stored just the mealId string, so read through these helpers to stay compatible.
const slotMealId = (v) => (typeof v === 'string' ? v : v?.mealId || undefined)
const slotProviders = (v) => (typeof v === 'string' ? [] : v?.providers || [])
const slotGuests = (v) => (typeof v === 'string' ? [] : v?.guests || [])

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

const mealType = (m) => m.type || 'recipe' // older saved data has no type

// Draft ingredients are {id, qty, text} rows so each gets its own touch-friendly fields.
const emptyMeal = () => ({
  id: crypto.randomUUID(),
  type: 'recipe',
  name: '',
  ingredients: [{ id: crypto.randomUUID(), qty: '', text: '' }],
  instructions: '',
  place: '',
  mapsUrl: '',
  details: '',
  cost: '',
})

// Normalize a stored ingredient (string from older data, or {name, qty}).
const ingName = (ing) => (typeof ing === 'string' ? ing : ing?.name || '')
const ingQty = (ing) => (typeof ing === 'string' ? '' : ing?.qty || '')

// Grocery list sections, shown as separate columns. 'other' catches anything
// that doesn't match (grains, baking staples, etc.) so nothing is dropped.
const GROCERY_CATEGORIES = [
  { id: 'meatdairy', label: 'Meats & Dairy', color: '#F85149' },
  { id: 'produce', label: 'Fruits & Veggies', color: '#39D353' },
  { id: 'saucesseasonings', label: 'Sauces & Seasonings', color: '#D29922' },
  { id: 'other', label: 'Other', color: '#8B949E' },
]

// Older saves used separate 'sauces'/'seasonings' columns — fold any saved
// category overrides into the combined column.
const LEGACY_CAT = { sauces: 'saucesseasonings', seasonings: 'saucesseasonings' }

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
  saucesseasonings: ['sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'sriracha', 'salsa',
    'pesto', 'marinara', 'gravy', 'dressing', 'vinegar', 'honey', 'syrup', 'jam', 'jelly',
    'broth', 'stock', 'hoisin', 'teriyaki', 'worcestershire', 'tahini', 'hummus', 'guacamole',
    'chutney', 'relish', 'aioli', 'vinaigrette', 'paste',
    'salt', 'cumin', 'paprika', 'oregano', 'thyme', 'rosemary', 'cinnamon', 'nutmeg',
    'turmeric', 'curry', 'cayenne', 'coriander', 'seasoning', 'spice', 'bay leaf', 'cardamom',
    'clove', 'sage', 'dill', 'fennel', 'allspice', 'vanilla', 'peppercorn', 'masala', 'chili',
    'chilli', 'garam'],
}
const CAT_ORDER = ['produce', 'meatdairy', 'saucesseasonings']
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
  // Grocery drag-and-drop state (global, keyed by lowercased ingredient name so
  // it survives the weekly auto-rebuild): category overrides + custom order.
  const [groceryCat, setGroceryCat] = useLocalState('meals-grocery-cat', {}) // { name: catId }
  const [groceryOrder, setGroceryOrder] = useLocalState('meals-grocery-order', []) // [name, …]
  const [grocerySort, setGrocerySort] = useLocalState('meals-grocery-sort', 'custom') // custom|az|za
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))

  const [mealDraft, setMealDraft] = useState(null)
  // When a meal is created from the slot editor, auto-select it back into the slot on save.
  const [pendingSlotSelect, setPendingSlotSelect] = useState(false)
  const [slotDraft, setSlotDraft] = useState(null) // { day, slot, mealId, providers, guests }
  const [memberDraft, setMemberDraft] = useState(null) // { id, name, color }
  const [memberMealsFor, setMemberMealsFor] = useState(null) // member id whose meal list is being edited
  const [mealsTab, setMealsTab] = useState('recipe') // Meals library: 'recipe' | 'takeout'
  const [subpage, setSubpage] = useState('schedule') // Schedule | Household | Meals | Groceries

  // Schedule filter: highlight matching meals, fade the rest.
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterProviders, setFilterProviders] = useState([]) // member ids
  const [filterType, setFilterType] = useState('all') // 'all' | 'recipe' | 'takeout'

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

  // Group the grocery list into category columns, honoring user category
  // overrides (drag between columns) and the chosen sort (custom / A–Z / Z–A).
  const groceryBoard = useMemo(() => {
    const cols = Object.fromEntries(GROCERY_CATEGORIES.map((c) => [c.id, []]))
    for (const item of grocery) {
      const key = item.name.toLowerCase()
      const saved = groceryCat[key]
      const cat = (saved && (LEGACY_CAT[saved] || saved)) || categorize(item.name)
      ;(cols[cat] || cols.other).push({ ...item, key })
    }
    const orderIndex = new Map(groceryOrder.map((n, i) => [n, i]))
    const byName = (a, b) => a.name.localeCompare(b.name)
    for (const id of Object.keys(cols)) {
      if (grocerySort === 'az') cols[id].sort(byName)
      else if (grocerySort === 'za') cols[id].sort((a, b) => byName(b, a))
      else
        cols[id].sort((a, b) => {
          const ia = orderIndex.has(a.key) ? orderIndex.get(a.key) : Infinity
          const ib = orderIndex.has(b.key) ? orderIndex.get(b.key) : Infinity
          return ia - ib || byName(a, b)
        })
    }
    return cols
  }, [grocery, groceryCat, groceryOrder, grocerySort])

  // Persist the result of a drag: refresh category overrides for the moved
  // items, and (only in custom mode) record the new ordering.
  const commitGroceryBoard = (cols) => {
    setGroceryCat((prev) => {
      const next = { ...prev }
      for (const cat of GROCERY_CATEGORIES) {
        for (const name of cols[cat.id] || []) {
          const key = name.toLowerCase()
          if (categorize(name) === cat.id) delete next[key]
          else next[key] = cat.id
        }
      }
      return next
    })
    if (grocerySort === 'custom') {
      setGroceryOrder((prev) => {
        const order = []
        for (const cat of GROCERY_CATEGORIES) for (const name of cols[cat.id] || []) order.push(name.toLowerCase())
        const seen = new Set(order)
        return [...order, ...prev.filter((n) => !seen.has(n))]
      })
    }
  }

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
            mapsUrl: mealDraft.mapsUrl.trim(),
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
    // If we opened the meal editor from the slot, drop the new meal into that slot.
    if (pendingSlotSelect) {
      setSlotDraft((d) =>
        d
          ? { ...d, mealId: meal.id, providers: members.filter((mem) => (mem.meals || []).includes(meal.id)).map((mem) => mem.id) }
          : d,
      )
    }
    setMealDraft(null)
    setPendingSlotSelect(false)
  }

  // Open the meal editor from the slot picker, prefilled to the chosen type.
  const createMealForSlot = (type) => {
    setPendingSlotSelect(true)
    setMealDraft({ ...emptyMeal(), type })
  }
  const closeMealDraft = () => {
    setMealDraft(null)
    setPendingSlotSelect(false)
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
      mapsUrl: m.mapsUrl || '',
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

  // --- Schedule filter ------------------------------------------------------
  const filterActive = filterProviders.length > 0 || filterType !== 'all'
  const toggleFilterProvider = (id) =>
    setFilterProviders((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const clearFilter = () => {
    setFilterProviders([])
    setFilterType('all')
  }
  // A planned slot matches when it has a meal of the chosen type AND at least
  // one of the chosen providers (each active facet must be satisfied).
  const slotMatchesFilter = (val, meal) => {
    if (!filterActive) return true
    if (!meal) return false
    if (filterType !== 'all' && mealType(meal) !== filterType) return false
    if (filterProviders.length > 0 && !filterProviders.some((id) => slotProviders(val).includes(id)))
      return false
    return true
  }

  // Week navigator, shared by the Schedule and Groceries subpages.
  const weekNav = (
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
  )

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader title="Meals">
        <Tabs tabs={SUBPAGES} active={subpage} onChange={setSubpage} />
      </PageHeader>

      {/* ---- Schedule (fills the available height) ---- */}
      {subpage === 'schedule' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative">
            {weekNav}
            {/* Filter sits top-right, where the old "This Week" button was.
                Centered via flex (not a transform) so the popover's fixed
                backdrop actually covers the viewport and isn't trapped in a
                transformed stacking context behind the schedule grid. */}
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                aria-label="Filter schedule"
                className={[
                  'flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
                  filterActive ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-300',
                ].join(' ')}
              >
                <FilterIcon className="h-5 w-5" />
                <span>Filter</span>
                {filterActive && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-bg">
                    {filterProviders.length + (filterType !== 'all' ? 1 : 0)}
                  </span>
                )}
              </button>
              {filterOpen && (
                <ScheduleFilter
                  members={members}
                  filterProviders={filterProviders}
                  filterType={filterType}
                  onToggleProvider={toggleFilterProvider}
                  onSetType={setFilterType}
                  onClear={clearFilter}
                  onClose={() => setFilterOpen(false)}
                />
              )}
            </div>
          </div>
          <Card className="min-h-0 flex-1 overflow-auto p-0">
        {/* CSS grid (not a <table>) so the meal rows are guaranteed equal
            height — tables dump leftover vertical space into the first row,
            which made Breakfast taller than Lunch/Dinner. */}
        <div
          className="grid h-full min-w-[720px]"
          style={{
            gridTemplateColumns: 'max-content repeat(7, minmax(0, 1fr))',
            gridTemplateRows: `auto repeat(${SLOTS.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Header row: empty corner + day labels */}
          <div className="border-b border-r border-border p-3" />
          {DAYS.map((d, i) => (
            <div key={d} className="border-b border-r border-border p-3 text-center text-base font-semibold text-gray-300">
              <div>{d}</div>
              <div className="font-mono text-xs font-normal text-gray-600">
                {addDays(weekStart, i).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
          {/* One equal-height row per slot */}
          {SLOTS.map((slot) => {
            const theme = SLOT_THEME[slot]
            const SlotIcon = theme.Icon
            return (
              <Fragment key={slot}>
                <div
                  className="flex items-center border-b border-r border-border p-3"
                  style={{ borderLeft: `4px solid ${theme.color}`, backgroundColor: `${theme.color}0D` }}
                >
                  <div className="flex items-center gap-2 text-lg font-semibold" style={{ color: theme.color }}>
                    <SlotIcon className="h-7 w-7" />
                    <span>{slot}</span>
                  </div>
                </div>
                {DAYS.map((day) => {
                  const val = plan[day]?.[slot]
                  const m = mealById[slotMealId(val)]
                  const takeout = m && mealType(m) === 'takeout'
                  const accent = takeout ? TAKEOUT_COLOR : theme.color
                  const providers = slotProviders(val)
                  const guests = slotGuests(val)
                  const faded = filterActive && !slotMatchesFilter(val, m)
                  return (
                    <div
                      key={day}
                      className="min-h-0 border-b border-r border-border p-1.5"
                      style={{ backgroundColor: `${theme.color}0D` }}
                    >
                      <button
                        type="button"
                        onClick={() => openSlot(day, slot)}
                        className={[
                          'flex h-full min-h-[88px] w-full flex-col items-center gap-1.5 overflow-hidden rounded-lg px-2 py-2 text-center text-base transition-opacity active:scale-[0.98]',
                          // Filled cells anchor to the top so the meal name is never
                          // pushed out of view by the member badges; empty cells center the +.
                          m ? 'justify-start font-semibold' : 'justify-center bg-white/5 text-gray-600',
                          faded ? 'opacity-25' : '',
                        ].join(' ')}
                        // Glow tracks the slot/takeout color instead of the fixed blue accent.
                        style={
                          m
                            ? {
                                backgroundColor: `${accent}26`,
                                color: accent,
                                border: `1.5px solid ${accent}`,
                                boxShadow: `0 0 0 1px ${accent}66, 0 0 16px ${accent}40`,
                              }
                            : undefined
                        }
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
                    </div>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
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
                    <ul className="mb-3 space-y-2">
                      {memMeals.length === 0 && (
                        <li className="text-sm text-gray-500">No meals assigned yet.</li>
                      )}
                      {memMeals.map((m) => {
                        const takeout = mealType(m) === 'takeout'
                        return (
                          <li key={m.id} className="flex items-center gap-2 rounded-lg bg-white/5 py-1.5 pl-2.5 pr-1.5">
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
                              className="flex-shrink-0 rounded-lg bg-loss/15 p-2.5 text-loss active:scale-95"
                            >
                              <TrashIcon className="h-5 w-5" />
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
                        {m.place ? 'from ' : 'Takeout'}
                        {m.place && (
                          m.mapsUrl ? (
                            <a
                              href={m.mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold underline decoration-dotted underline-offset-2"
                              style={{ color: TAKEOUT_COLOR }}
                            >
                              {m.place}
                            </a>
                          ) : (
                            m.place
                          )
                        )}
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-300">
              Grocery List <span className="font-mono text-sm text-gray-500">({grocery.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Sort</span>
              <Tabs
                tabs={[
                  { id: 'custom', label: 'Custom' },
                  { id: 'az', label: 'A–Z' },
                  { id: 'za', label: 'Z–A' },
                ]}
                active={grocerySort}
                onChange={setGrocerySort}
              />
            </div>
          </div>
          {grocery.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500">Plan some recipe meals to build your list automatically.</p>
            </Card>
          ) : (
            <GroceryBoard
              categories={GROCERY_CATEGORIES}
              board={groceryBoard}
              checked={checked}
              onToggleChecked={toggleChecked}
              onCommit={commitGroceryBoard}
            />
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
        onCreateMeal={createMealForSlot}
      />

      {/* Add / edit meal */}
      <Modal
        open={!!mealDraft}
        onClose={closeMealDraft}
        title={isEditing ? 'Edit Meal' : 'New Meal'}
        footer={
          <>
            <Button variant="ghost" onClick={closeMealDraft}>Cancel</Button>
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
                    <label className="mb-1 block text-xs text-gray-500">Google Maps link (optional)</label>
                    <input
                      type="url"
                      inputMode="url"
                      className={fieldClass}
                      placeholder="https://maps.google.com/…"
                      value={mealDraft.mapsUrl}
                      onChange={(e) => setMealDraft({ ...mealDraft, mapsUrl: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Cost (optional)</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">$</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={`${fieldClass} pl-7`}
                        placeholder="0.00"
                        value={mealDraft.cost}
                        onChange={(e) => setMealDraft({ ...mealDraft, cost: e.target.value })}
                      />
                    </div>
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
                          className={`${fieldClass} !w-16 flex-none px-2 text-center`}
                          placeholder="Qty"
                          value={ing.qty}
                          onChange={(e) => setIngredient(ing.id, { qty: e.target.value })}
                        />
                        <input
                          className={`${fieldClass} min-w-0 flex-1`}
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
  const [tab, setTab] = useState('recipe') // 'recipe' | 'takeout'
  if (!member) return null
  const selected = member.meals || []
  const tabMeals = meals.filter((m) => mealType(m) === tab)
  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title={`${member.name}'s meals`}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="mb-4">
        <Tabs
          tabs={[
            { id: 'recipe', label: 'Recipe' },
            { id: 'takeout', label: 'Takeout' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>
      {tabMeals.length === 0 ? (
        <p className="text-sm text-gray-500">No {tab === 'takeout' ? 'takeout' : 'recipes'} in the library yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tabMeals.map((m) => {
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

// Drag-and-drop grocery board: items can be reordered within a category or
// dragged into another one. A blue line shows where a dragged item will land.
function GroceryBoard({ categories, board, checked, onToggleChecked, onCommit }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [cols, setCols] = useState(board)
  const [activeId, setActiveId] = useState(null)
  const [overId, setOverId] = useState(null)

  // Re-sync from the derived board whenever it changes — but not mid-drag, so a
  // live cross-column move isn't clobbered by a re-render.
  useEffect(() => {
    if (!activeId) setCols(board)
  }, [board, activeId])

  const itemByKey = useMemo(() => {
    const map = {}
    for (const list of Object.values(cols)) for (const it of list) map[it.key] = it
    return map
  }, [cols])

  const findColumn = (id) => {
    if (cols[id]) return id // a column id
    return Object.keys(cols).find((c) => cols[c].some((it) => it.key === id))
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
      const item = prev[from].find((it) => it.key === active.id)
      if (!item) return prev
      const overItems = prev[to]
      let idx = overItems.findIndex((it) => it.key === over.id)
      if (idx === -1) idx = overItems.length
      return {
        ...prev,
        [from]: prev[from].filter((it) => it.key !== active.id),
        [to]: [...overItems.slice(0, idx), item, ...overItems.slice(idx)],
      }
    })
  }

  const onDragEnd = ({ active, over }) => {
    let next = cols
    const from = findColumn(active.id)
    const to = over ? findColumn(over.id) : from
    if (from && to && from === to) {
      const list = cols[from]
      const oldIdx = list.findIndex((it) => it.key === active.id)
      const newIdx = list.findIndex((it) => it.key === over.id)
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        next = { ...cols, [from]: arrayMove(list, oldIdx, newIdx) }
      }
    }
    setCols(next)
    setActiveId(null)
    setOverId(null)
    onCommit(Object.fromEntries(Object.entries(next).map(([c, list]) => [c, list.map((it) => it.name)])))
  }

  // While dragging, also show empty categories as drop targets.
  // Always show every category (even empty ones) so the columns stay put.
  const visibleCats = categories

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleCats.map((cat) => (
          <GroceryColumn key={cat.id} cat={cat} items={cols[cat.id] || []} overId={overId}>
            {(cols[cat.id] || []).map((item) => (
              <GroceryItem
                key={item.key}
                item={item}
                isChecked={!!checked[item.key]}
                onToggle={() => onToggleChecked(item.key)}
                showLine={overId === item.key && activeId !== item.key}
              />
            ))}
          </GroceryColumn>
        ))}
      </div>
      <DragOverlay>
        {activeId && itemByKey[activeId] ? (
          <ItemRow item={itemByKey[activeId]} isChecked={!!checked[activeId]} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function GroceryColumn({ cat, items, overId, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: cat.id })
  const empty = items.length === 0
  // Highlight when hovering the column itself or any item inside it.
  const active = isOver || items.some((it) => it.key === overId)
  return (
    <Card style={{ borderColor: active ? cat.color : `${cat.color}66` }}>
      <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
        <h3 className="flex-1 font-bold" style={{ color: cat.color }}>{cat.label}</h3>
        <span className="font-mono text-xs text-gray-500">{items.length}</span>
      </div>
      <SortableContext items={items.map((it) => it.key)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="min-h-[2.5rem] space-y-1">
          {empty ? (
            <li
              className={[
                'rounded-lg border border-dashed py-3 text-center text-xs',
                isOver ? 'border-accent text-accent' : 'border-border text-gray-600',
              ].join(' ')}
            >
              {isOver ? 'Drop here' : 'Empty'}
            </li>
          ) : (
            children
          )}
        </ul>
      </SortableContext>
    </Card>
  )
}

function GroceryItem({ item, isChecked, onToggle, showLine }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <li ref={setNodeRef} style={style}>
      {/* Drop indicator line. */}
      <div className={['h-0.5 rounded-full', showLine ? 'bg-accent' : 'bg-transparent'].join(' ')} />
      <ItemRow item={item} isChecked={isChecked} onToggle={onToggle} dragHandleProps={{ ...attributes, ...listeners }} />
    </li>
  )
}

// Shared row markup, reused by the live list and the drag overlay.
function ItemRow({ item, isChecked, onToggle, dragHandleProps, dragging }) {
  return (
    <div
      className={[
        'flex items-center gap-2 rounded-lg px-1 py-1',
        dragging ? 'bg-surface shadow-glow' : '',
      ].join(' ')}
    >
      <button
        type="button"
        {...dragHandleProps}
        aria-label={`Reorder ${item.name}`}
        style={{ touchAction: 'none' }}
        className="flex-shrink-0 cursor-grab rounded-md p-1 text-gray-600 active:cursor-grabbing active:text-gray-300"
      >
        <GripIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left active:bg-white/5"
      >
        <span
          className={[
            'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border-2',
            isChecked ? 'border-gain bg-gain text-bg' : 'border-border',
          ].join(' ')}
        >
          {isChecked && <CheckIcon className="h-4 w-4" />}
        </span>
        <span className={isChecked ? 'text-gray-500 line-through' : 'text-gray-200'}>{item.label}</span>
      </button>
    </div>
  )
}

// Popover for filtering the schedule by provider and/or meal type.
function ScheduleFilter({ members, filterProviders, filterType, onToggleProvider, onSetType, onClear, onClose }) {
  const active = filterProviders.length > 0 || filterType !== 'all'
  return (
    <>
      {/* Click-away backdrop. */}
      <button
        type="button"
        aria-label="Close filter"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-border bg-surface p-4 text-left shadow-glow">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Filter schedule</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 active:scale-90"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-2 block text-xs text-gray-500">Meal type</label>
        <div className="mb-4">
          <Tabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'recipe', label: 'Homecooked' },
              { id: 'takeout', label: 'Takeout' },
            ]}
            active={filterType}
            onChange={onSetType}
          />
        </div>

        <label className="mb-2 block text-xs text-gray-500">Provider</label>
        <MemberPicker members={members} selected={filterProviders} onToggle={onToggleProvider} />

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

// Provider (filled) and guest (ringed) badges shown on a planner cell.
function MemberRow({ providers, guests, memberById }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {providers.map((id) => memberById[id] && <MemberBadge key={`p${id}`} member={memberById[id]} size={22} />)}
      {guests.map((id) => memberById[id] && <MemberBadge key={`g${id}`} member={memberById[id]} size={22} ring />)}
    </div>
  )
}

function SlotModal({ draft, setDraft, onClose, onSave, meals, members, onCreateMeal }) {
  const [tab, setTab] = useState('recipe') // 'recipe' | 'takeout'
  if (!draft) return null
  const tabMeals = meals.filter((m) => mealType(m) === tab)
  const toggleIn = (key, id) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id],
    }))
  // Picking a meal auto-fills providers with the members who have that meal
  // assigned to them (who makes / orders it). Re-clicking the same meal is a
  // no-op so re-opening a saved slot never clobbers manual edits.
  const selectMeal = (mealId) =>
    setDraft((d) => {
      if (d.mealId === mealId) return d
      const assigned = mealId
        ? members.filter((mem) => (mem.meals || []).includes(mealId)).map((mem) => mem.id)
        : []
      return { ...d, mealId, providers: assigned }
    })
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
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-xs text-gray-500">Meal</label>
            <Tabs
              tabs={[
                { id: 'recipe', label: 'Homecooked' },
                { id: 'takeout', label: 'Takeout' },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => selectMeal(null)}
              className={[
                'rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                draft.mealId == null ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
              ].join(' ')}
            >
              <div className="font-medium">None</div>
              <div className="font-mono text-[10px] uppercase opacity-70">Empty slot</div>
            </button>
            {tabMeals.map((m) => {
              const takeout = mealType(m) === 'takeout'
              const on = draft.mealId === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMeal(m.id)}
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
            {/* Create a new meal of the current type without leaving the planner. */}
            <button
              type="button"
              onClick={() => onCreateMeal(tab)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-gray-400 active:scale-[0.98]"
            >
              <PlusIcon className="h-5 w-5" /> New {tab === 'takeout' ? 'takeout' : 'homecooked'}
            </button>
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

