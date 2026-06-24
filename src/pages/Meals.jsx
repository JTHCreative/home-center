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
import ScrollTabs from '../components/ScrollTabs.jsx'
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
  SearchIcon,
  SunIcon,
  SunriseIcon,
  TagIcon,
  TrashIcon,
} from '../components/Icons.jsx'
import { SEED_MEALS, SEED_MEMBERS } from '../lib/seeds.js'
import { migrateColors } from '../lib/colors.js'
import { MemberBadge, MemberPicker } from '../components/Member.jsx'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOTS = ['Breakfast', 'Lunch', 'Dinner']
const DAY_SET = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

// Each meal slot gets a time-of-day theme: color + icon for its row.
const SLOT_THEME = {
  Breakfast: { color: '#BD9541', Icon: SunriseIcon }, // Lichen / morning
  Lunch: { color: '#52C167', Icon: SunIcon }, // Sage / midday
  Dinner: { color: '#61A2E0', Icon: MoonIcon }, // Water / night
}
const TAKEOUT_COLOR = '#E28F54' // Ember

// Nature-inspired palette (Color Design System) for meal categories —
// auto-assigned (cycled) as categories are created, and offered in the recolor
// picker. Shared with Calendar/Goals/Members for a consistent feel.
const CATEGORY_COLORS = [
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
// Sentinel used to group meals that have no (or a since-deleted) category.
const NO_CATEGORY = '__none__'

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
  categoryId: null, // organizing category (null = No Category)
  members: [], // household member ids this meal is assigned to (who makes / orders it)
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
  { id: 'meatdairy', label: 'Meats & Dairy', color: '#D8685E' }, // Dusk (was red)
  { id: 'produce', label: 'Fruits & Veggies', color: '#52C167' }, // Sage (was green)
  { id: 'saucesseasonings', label: 'Sauces & Seasonings', color: '#BD9541' }, // Lichen (was gold)
  { id: 'other', label: 'Other', color: '#8C948F' }, // Stone (was grey)
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
  const [categories, setCategories] = useLocalState('meals-categories', [], migrateColors) // [{ id, name, color }]
  const [plans, setPlans] = useLocalState('meals-plan', {}, migratePlan)
  const [checkedByWeek, setCheckedByWeek] = useLocalState('meals-grocery-checked', {})
  const [members, setMembers] = useLocalState('meals-members', SEED_MEMBERS, migrateColors)
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
  const [memberMealsFor, setMemberMealsFor] = useState(null) // member id whose meal list is being edited
  const [mealsTab, setMealsTab] = useState('recipe') // Meals library: 'recipe' | 'takeout'
  const [mealsSearch, setMealsSearch] = useState('') // Meals library name search
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false) // edit/recolor/delete categories
  const [categoryToDelete, setCategoryToDelete] = useState(null) // category id pending deletion
  const [mealCatName, setMealCatName] = useState(null) // in-progress new category typed inside the meal editor
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
  // mealId -> [member]: who that meal is assigned to (makes / orders it).
  const membersForMeal = useMemo(() => {
    const map = {}
    for (const mem of members) for (const id of mem.meals || []) (map[id] ||= []).push(mem)
    return map
  }, [members])
  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  // Meals library filter (by household member), mirrors the schedule filter.
  const [mealsFilterOpen, setMealsFilterOpen] = useState(false)
  const [mealsFilterMembers, setMealsFilterMembers] = useState([]) // member ids
  const [mealsCategoryTab, setMealsCategoryTab] = useState('all') // 'all' | NO_CATEGORY | categoryId
  const toggleMealsFilterMember = (id) =>
    setMealsFilterMembers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const visibleMeals = useMemo(() => {
    const q = mealsSearch.trim().toLowerCase()
    let list = meals.filter((m) => mealType(m) === mealsTab)
    if (q) list = list.filter((m) => m.name.toLowerCase().includes(q))
    if (mealsFilterMembers.length > 0)
      list = list.filter((m) =>
        (membersForMeal[m.id] || []).some((mem) => mealsFilterMembers.includes(mem.id)),
      )
    return list
  }, [meals, mealsTab, mealsSearch, mealsFilterMembers, membersForMeal])

  // The category-navigator tab acts as a single-select category filter above the
  // grid. Fall back to "All" if the selected category was deleted.
  const activeCategoryTab =
    mealsCategoryTab === 'all' || mealsCategoryTab === NO_CATEGORY || categoryById[mealsCategoryTab]
      ? mealsCategoryTab
      : 'all'
  const gridMeals = useMemo(() => {
    if (activeCategoryTab === 'all') return visibleMeals
    return visibleMeals.filter((m) => {
      const key = m.categoryId && categoryById[m.categoryId] ? m.categoryId : NO_CATEGORY
      return key === activeCategoryTab
    })
  }, [visibleMeals, activeCategoryTab, categoryById])

  // Tabs for the category navigator: All, every category, then No Category.
  const categoryTabs = useMemo(
    () => [
      { id: 'all', label: 'All' },
      ...categories.map((c) => ({ id: c.id, label: c.name, color: c.color })),
      { id: NO_CATEGORY, label: 'No Category' },
    ],
    [categories],
  )

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

  // Household members are added/edited/removed globally in Settings → Household;
  // here we only assign which meals each member makes/orders.
  const toggleMemberMeal = (memberId, mealId) =>
    setMembers((list) =>
      list.map((m) => {
        if (m.id !== memberId) return m
        const cur = m.meals || []
        return { ...m, meals: cur.includes(mealId) ? cur.filter((x) => x !== mealId) : [...cur, mealId] }
      }),
    )

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

  // Create a category (auto-coloring it) and return its id, or null for a blank name.
  const createCategory = (name) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const id = crypto.randomUUID()
    const color = CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]
    setCategories((list) => [...list, { id, name: trimmed, color }])
    return id
  }
  // Create the category typed inline in the meal editor and select it on the draft.
  const commitMealCategory = () => {
    const id = createCategory(mealCatName || '')
    if (id) setMealDraft((d) => (d ? { ...d, categoryId: id } : d))
    setMealCatName(null)
  }
  // Delete a category, reassigning every meal in it to `targetId` (null = No Category).
  const deleteCategory = (id, targetId = null) => {
    setMeals((list) => list.map((m) => (m.categoryId === id ? { ...m, categoryId: targetId } : m)))
    setCategories((list) => list.filter((c) => c.id !== id))
    setCategoryToDelete(null)
  }
  // Recolor a category (chosen from the palette in the category manager).
  const setCategoryColor = (id, color) =>
    setCategories((list) => list.map((c) => (c.id === id ? { ...c, color } : c)))

  const saveMeal = () => {
    if (!mealDraft.name.trim()) return
    const base = {
      id: mealDraft.id,
      type: mealDraft.type,
      name: mealDraft.name.trim(),
      categoryId: mealDraft.categoryId || null,
    }
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
    // Reconcile which members this meal is assigned to (edited in the meal form):
    // add the meal to chosen members, remove it from the rest.
    const wanted = mealDraft.members || []
    setMembers((list) =>
      list.map((mem) => {
        const has = (mem.meals || []).includes(meal.id)
        const want = wanted.includes(mem.id)
        if (has === want) return mem
        const cur = mem.meals || []
        return { ...mem, meals: want ? [...cur, meal.id] : cur.filter((x) => x !== meal.id) }
      }),
    )
    // If we opened the meal editor from the slot, drop the new meal into that slot.
    if (pendingSlotSelect) {
      setSlotDraft((d) => (d ? { ...d, mealId: meal.id, providers: wanted } : d))
    }
    setMealDraft(null)
    setPendingSlotSelect(false)
    setMealCatName(null)
  }

  // Open the meal editor from the slot picker, prefilled to the chosen type.
  const createMealForSlot = (type) => {
    setPendingSlotSelect(true)
    setMealDraft({ ...emptyMeal(), type })
  }
  const closeMealDraft = () => {
    setMealDraft(null)
    setPendingSlotSelect(false)
    setMealCatName(null)
  }

  const editMeal = (m) =>
    setMealDraft({
      id: m.id,
      type: mealType(m),
      name: m.name,
      categoryId: m.categoryId || null,
      members: members.filter((mem) => (mem.meals || []).includes(m.id)).map((mem) => mem.id),
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

  // Toggle a household member on the meal being edited (assigned = makes / orders it).
  const toggleDraftMember = (id) =>
    setMealDraft((d) => ({
      ...d,
      members: (d.members || []).includes(id)
        ? d.members.filter((x) => x !== id)
        : [...(d.members || []), id],
    }))

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
          {/* On phones the navigator and filter stack; at sm+ the filter pins to
              the top-right corner beside the centered navigator. */}
          <div className="flex flex-col items-center gap-2 sm:relative sm:block">
            {weekNav}
            {/* Filter sits top-right, where the old "This Week" button was.
                Centered via flex (not a transform) so the popover's fixed
                backdrop actually covers the viewport and isn't trapped in a
                transformed stacking context behind the schedule grid. */}
            <div className="relative flex items-center sm:absolute sm:inset-y-0 sm:right-0">
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
                      // `container-type: inline-size` lets the cell's contents
                      // size themselves in cqi units (1cqi = 1% of cell width),
                      // so text/icons scale with the column and never clip on
                      // narrower screens like an iPad.
                      className="min-h-0 border-b border-r border-border p-1.5 [container-type:inline-size]"
                      style={{ backgroundColor: `${theme.color}0D` }}
                    >
                      <button
                        type="button"
                        onClick={() => openSlot(day, slot)}
                        className={[
                          'flex h-full min-h-[88px] w-full flex-col items-center gap-1.5 overflow-hidden rounded-lg px-2 py-2 text-center transition-opacity active:scale-[0.98]',
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
                            <span
                              className="line-clamp-2 leading-tight"
                              style={{ fontSize: 'clamp(0.625rem, 12cqi, 1rem)' }}
                            >
                              {m.name}
                            </span>
                            <span
                              className="uppercase opacity-70"
                              style={{ fontSize: 'clamp(0.5rem, 8cqi, 0.6875rem)' }}
                            >
                              {takeout ? 'Takeout' : 'Homecooked'}
                            </span>
                            {(providers.length > 0 || guests.length > 0) && (
                              <MemberRow
                                providers={providers}
                                guests={guests}
                                memberById={memberById}
                                size="clamp(14px, 20cqi, 22px)"
                              />
                            )}
                          </>
                        ) : (
                          <PlusIcon style={{ width: 'clamp(1rem, 24cqi, 1.75rem)', height: 'clamp(1rem, 24cqi, 1.75rem)' }} />
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
          <div className="mb-6">
            <p className="text-sm text-gray-500">
              Assign the meals & takeout each person likes to make or order. Add or edit members in{' '}
              <span className="font-semibold text-gray-400">Settings → Household</span>.
            </p>
          </div>
          {members.length === 0 ? (
            <Card className="text-sm text-gray-500">
              No household members yet — add them in Settings → Household.
            </Card>
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
                                backgroundColor: takeout ? '#E28F5422' : 'rgb(var(--c-accent) / 0.15)',
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex flex-wrap items-center gap-2">
              {/* Search the library by meal name. */}
              <SearchField
                value={mealsSearch}
                onChange={setMealsSearch}
                placeholder="Search meals…"
              />
              {/* Filter the library by household member. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMealsFilterOpen((o) => !o)}
                  aria-label="Filter meals"
                  className={[
                    'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95',
                    mealsFilterMembers.length > 0
                      ? 'bg-accent/15 text-accent shadow-glow'
                      : 'bg-white/5 text-gray-300',
                  ].join(' ')}
                >
                  <FilterIcon className="h-5 w-5" />
                  <span>Filter</span>
                  {mealsFilterMembers.length > 0 && (
                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-bg">
                      {mealsFilterMembers.length}
                    </span>
                  )}
                </button>
                {mealsFilterOpen && (
                  <MemberFilterPopover
                    title="Filter meals"
                    members={members}
                    selected={mealsFilterMembers}
                    onToggle={toggleMealsFilterMember}
                    onClear={() => setMealsFilterMembers([])}
                    onClose={() => setMealsFilterOpen(false)}
                  />
                )}
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
          </div>
          {/* Category navigator — a swipeable bar that filters the grid by
              category (All · each category · No Category). Empty slots show a
              "+" that opens the category manager. */}
          {categories.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ScrollTabs
                  tabs={categoryTabs}
                  active={activeCategoryTab}
                  onChange={setMealsCategoryTab}
                  onAdd={() => setCategoryManagerOpen(true)}
                  visible={6}
                  fill
                />
              </div>
              {/* Manage categories — recolor, delete, or add new ones. */}
              <button
                type="button"
                onClick={() => setCategoryManagerOpen(true)}
                aria-label="Edit categories"
                title="Edit categories"
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/5 text-gray-300 active:scale-95"
              >
                <TagIcon className="h-5 w-5" />
              </button>
            </div>
          )}
          {gridMeals.length === 0 ? (
            <Card className="text-sm text-gray-500">
              {mealsSearch.trim() !== ''
                ? `No ${mealsTab} meals match “${mealsSearch.trim()}”.`
                : mealsFilterMembers.length > 0
                  ? `No ${mealsTab} meals assigned to the selected member${mealsFilterMembers.length > 1 ? 's' : ''}.`
                  : activeCategoryTab === NO_CATEGORY
                    ? `No uncategorized ${mealsTab} meals.`
                    : activeCategoryTab !== 'all'
                      ? `No ${mealsTab} meals in this category yet.`
                      : `No ${mealsTab} meals yet.`}
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gridMeals.map((m) => (
                <MealCard
                  key={m.id}
                  meal={m}
                  category={m.categoryId ? categoryById[m.categoryId] : null}
                  assigned={membersForMeal[m.id] || []}
                  onEdit={() => editMeal(m)}
                  onDelete={() => deleteMeal(m.id)}
                />
              ))}
            </div>
          )}
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
        categories={categories}
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

            {/* Organize this meal under a category (create one inline if needed). */}
            <div>
              <label className="mb-2 block text-xs text-gray-500">Category</label>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryChip
                  label="No Category"
                  color="#8C948F"
                  on={!mealDraft.categoryId}
                  onClick={() => setMealDraft({ ...mealDraft, categoryId: null })}
                />
                {categories.map((c) => (
                  <CategoryChip
                    key={c.id}
                    label={c.name}
                    color={c.color}
                    on={mealDraft.categoryId === c.id}
                    onClick={() => setMealDraft({ ...mealDraft, categoryId: c.id })}
                  />
                ))}
                {mealCatName == null ? (
                  <button
                    type="button"
                    onClick={() => setMealCatName('')}
                    className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-sm font-semibold text-gray-400 active:scale-95"
                  >
                    <PlusIcon className="h-4 w-4" /> New
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      className={`${fieldClass} !w-44`}
                      placeholder="Category name"
                      value={mealCatName}
                      onChange={(e) => setMealCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitMealCategory()
                        if (e.key === 'Escape') setMealCatName(null)
                      }}
                    />
                    <button
                      type="button"
                      onClick={commitMealCategory}
                      aria-label="Add category"
                      className="rounded-lg bg-accent/15 p-2.5 text-accent active:scale-95"
                    >
                      <CheckIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMealCatName(null)}
                      aria-label="Cancel new category"
                      className="rounded-lg bg-white/5 p-2.5 text-gray-400 active:scale-95"
                    >
                      <CloseIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Assign this meal to the household members who make / order it. */}
            <div>
              <label className="mb-2 block text-xs text-gray-500">
                Assigned to (who makes or orders this)
              </label>
              <MemberPicker
                members={members}
                selected={mealDraft.members || []}
                onToggle={toggleDraftMember}
                emptyHint="Add household members in Settings → Household."
              />
            </div>

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

      {/* Assign meals to a household member */}
      <MemberMealsModal
        member={members.find((m) => m.id === memberMealsFor) || null}
        meals={meals}
        onToggle={(mealId) => toggleMemberMeal(memberMealsFor, mealId)}
        onClose={() => setMemberMealsFor(null)}
      />

      {/* Manage categories — recolor, delete, or add new ones */}
      <CategoryManagerModal
        open={categoryManagerOpen}
        categories={categories}
        onCreate={(name) => createCategory(name)}
        onSetColor={setCategoryColor}
        onDelete={(id) => setCategoryToDelete(id)}
        onClose={() => setCategoryManagerOpen(false)}
      />

      {/* Delete a category — move its meals to No Category or another category */}
      <DeleteCategoryModal
        category={categories.find((c) => c.id === categoryToDelete) || null}
        categories={categories}
        mealCount={meals.filter((m) => m.categoryId === categoryToDelete).length}
        onConfirm={(targetId) => deleteCategory(categoryToDelete, targetId)}
        onClose={() => setCategoryToDelete(null)}
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
            const color = takeout ? TAKEOUT_COLOR : '#61A2E0'
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

// Popover for filtering a meal list by household member (used by the Meals library).
function MemberFilterPopover({ title, members, selected, onToggle, onClear, onClose }) {
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
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 active:scale-90"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-2 block text-xs text-gray-500">Household member</label>
        <MemberPicker members={members} selected={selected} onToggle={onToggle} />
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="mt-4 w-full rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-gray-300 active:scale-95"
          >
            Clear filter
          </button>
        )}
      </div>
    </>
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
function MemberRow({ providers, guests, memberById, size = 22 }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {providers.map((id) => memberById[id] && <MemberBadge key={`p${id}`} member={memberById[id]} size={size} />)}
      {guests.map((id) => memberById[id] && <MemberBadge key={`g${id}`} member={memberById[id]} size={size} ring />)}
    </div>
  )
}

function SlotModal({ draft, setDraft, onClose, onSave, meals, members, categories, onCreateMeal }) {
  const [tab, setTab] = useState('recipe') // 'recipe' | 'takeout'
  const [search, setSearch] = useState('') // search the meal choices by name
  // Filter the meal list by household member (who makes / orders it) and/or category.
  const [filterMembers, setFilterMembers] = useState([])
  const [filterCats, setFilterCats] = useState([]) // category ids (or NO_CATEGORY)
  const [filterShown, setFilterShown] = useState(false)
  const toggleFilterMember = (id) =>
    setFilterMembers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const toggleFilterCat = (id) =>
    setFilterCats((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  if (!draft) return null
  const q = search.trim().toLowerCase()
  let allTabMeals = meals.filter((m) => mealType(m) === tab)
  if (q) allTabMeals = allTabMeals.filter((m) => m.name.toLowerCase().includes(q))
  // Allowed meal ids when filtering by member: union of the selected members' assigned meals.
  const allowed =
    filterMembers.length > 0
      ? new Set(
          members
            .filter((mem) => filterMembers.includes(mem.id))
            .flatMap((mem) => mem.meals || []),
        )
      : null
  let tabMeals = allowed ? allTabMeals.filter((m) => allowed.has(m.id)) : allTabMeals
  if (filterCats.length > 0) {
    tabMeals = tabMeals.filter((m) => {
      const key = m.categoryId && categories.some((c) => c.id === m.categoryId) ? m.categoryId : NO_CATEGORY
      return filterCats.includes(key)
    })
  }
  const filterCount = filterMembers.length + filterCats.length
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
          {/* Search the meal choices by name. */}
          <div className="mb-2">
            <SearchField value={search} onChange={setSearch} placeholder="Search meals…" full />
          </div>
          {/* Filter the meal choices by household member and/or category. */}
          {(members.length > 0 || categories.length > 0) && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setFilterShown((s) => !s)}
                className={[
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold active:scale-95',
                  filterCount > 0 ? 'bg-accent/15 text-accent' : 'bg-white/5 text-gray-300',
                ].join(' ')}
              >
                <FilterIcon className="h-4 w-4" />
                <span>Filter</span>
                {filterCount > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-bg">
                    {filterCount}
                  </span>
                )}
              </button>
              {filterShown && (
                <div className="mt-2 space-y-3 rounded-xl border border-border bg-bg/40 p-3">
                  {members.length > 0 && (
                    <div>
                      <label className="mb-2 block text-xs text-gray-500">Member</label>
                      <MemberPicker members={members} selected={filterMembers} onToggle={toggleFilterMember} />
                    </div>
                  )}
                  {categories.length > 0 && (
                    <div>
                      <label className="mb-2 block text-xs text-gray-500">Category</label>
                      <div className="flex flex-wrap gap-2">
                        <CategoryChip
                          label="No Category"
                          color="#8C948F"
                          on={filterCats.includes(NO_CATEGORY)}
                          onClick={() => toggleFilterCat(NO_CATEGORY)}
                        />
                        {categories.map((c) => (
                          <CategoryChip
                            key={c.id}
                            label={c.name}
                            color={c.color}
                            on={filterCats.includes(c.id)}
                            onClick={() => toggleFilterCat(c.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {filterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterMembers([])
                        setFilterCats([])
                      }}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-300 active:scale-95"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
                  style={on ? { backgroundColor: `${takeout ? TAKEOUT_COLOR : '#61A2E0'}22`, outline: `2px solid ${takeout ? TAKEOUT_COLOR : '#61A2E0'}` } : undefined}
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

// Compact search input with a leading magnifier and a clear (×) button.
function SearchField({ value, onChange, placeholder = 'Search…', full = false }) {
  return (
    <div className={['relative', full ? 'w-full' : 'w-44 sm:w-56'].join(' ')}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${fieldClass} !py-2.5 pl-9 ${value ? 'pr-9' : ''}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 active:scale-90 active:text-gray-300"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// Selectable category chip (used in the meal editor's category picker).
function CategoryChip({ label, color, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold active:scale-95"
      style={{
        backgroundColor: on ? `${color}22` : 'rgba(255,255,255,0.05)',
        color: on ? color : '#8C948F',
        outline: on ? `2px solid ${color}` : 'none',
      }}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </button>
  )
}

// A single meal card in the Meals library (extracted so it can be reused across
// the category sections).
function MealCard({ meal, category, assigned, onEdit, onDelete }) {
  const takeout = mealType(meal) === 'takeout'
  return (
    <Card>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate font-bold text-white">{meal.name}</h3>
            <span
              className="flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
              style={
                takeout
                  ? { backgroundColor: '#E28F5422', color: '#E28F54' }
                  : { backgroundColor: 'rgb(var(--c-accent) / 0.15)', color: 'rgb(var(--c-accent))' }
              }
            >
              {takeout ? 'Takeout' : 'Recipe'}
            </span>
            {category && (
              <span
                className="flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase"
                style={{ backgroundColor: `${category.color}22`, color: category.color }}
              >
                {category.name}
              </span>
            )}
          </div>
          {/* Who this meal is assigned to (makes / orders it). */}
          {assigned.length > 0 && (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
              {assigned.map((mem) => (
                <MemberBadge key={mem.id} member={mem} size={22} />
              ))}
            </div>
          )}
        </div>
        {takeout ? (
          <p className="mt-1 text-xs text-gray-400">
            {meal.place ? 'from ' : 'Takeout'}
            {meal.place &&
              (meal.mapsUrl ? (
                <a
                  href={meal.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold underline decoration-dotted underline-offset-2"
                  style={{ color: TAKEOUT_COLOR }}
                >
                  {meal.place}
                </a>
              ) : (
                meal.place
              ))}
            {meal.cost != null && meal.cost !== '' ? ` · $${Number(meal.cost).toFixed(2)}` : ''}
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">{(meal.ingredients || []).length} ingredients</p>
        )}
        {(takeout ? meal.details : meal.instructions) && (
          <p className="mt-2 line-clamp-2 text-sm text-gray-400">
            {takeout ? meal.details : meal.instructions}
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${meal.name}`}
          className="flex flex-1 items-center justify-center rounded-lg bg-white/5 px-3 py-3 text-gray-300 active:scale-95"
        >
          <PencilIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${meal.name}`}
          className="flex flex-1 items-center justify-center rounded-lg bg-loss/15 px-3 py-3 text-loss active:scale-95"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
    </Card>
  )
}

// Manage meal categories: recolor, delete (with meal transfer), or add new ones.
function CategoryManagerModal({ open, categories, onCreate, onSetColor, onDelete, onClose }) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const dup = categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())
  const close = () => {
    setName('')
    onClose()
  }
  const add = () => {
    if (!trimmed || dup) return
    onCreate(trimmed)
    setName('')
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Edit Categories"
      size="narrow"
      footer={<Button onClick={close}>Done</Button>}
    >
      <div className="space-y-4">
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500">No categories yet — add one below.</p>
        ) : (
          <div className="space-y-3">
            {categories.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border p-3"
                style={{ borderColor: `${c.color}66` }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="flex-1 truncate font-semibold" style={{ color: c.color }}>
                    {c.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    aria-label={`Delete ${c.name}`}
                    className="rounded-lg bg-loss/15 p-2 text-loss active:scale-95"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                {/* Color palette — tap a swatch to recolor the category. */}
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => onSetColor(c.id, col)}
                      aria-label={`Set ${c.name} color`}
                      className="h-8 w-8 rounded-full active:scale-90"
                      style={{
                        backgroundColor: col,
                        outline: c.color === col ? '3px solid white' : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add a new category. */}
        <div className="border-t border-border pt-4">
          <label className="mb-2 block text-xs text-gray-500">Add category</label>
          <div className="flex items-center gap-2">
            <input
              className={`${fieldClass} min-w-0 flex-1`}
              placeholder="e.g. Breakfast, Quick Dinners, Desserts"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
            />
            <Button onClick={add} className="flex-shrink-0 px-4 py-3">
              <span className="flex items-center gap-2">
                <PlusIcon className="h-4 w-4" /> Add
              </span>
            </Button>
          </div>
          {dup && trimmed !== '' && (
            <p className="mt-2 text-xs text-loss">A category named “{trimmed}” already exists.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}

// Delete a category, choosing where its meals should move (No Category or another).
function DeleteCategoryModal({ category, categories, mealCount, onConfirm, onClose }) {
  const [target, setTarget] = useState(null) // null = No Category
  // Reset the chosen target whenever a different category is opened for deletion.
  useEffect(() => {
    setTarget(null)
  }, [category?.id])
  if (!category) return null
  const others = categories.filter((c) => c.id !== category.id)
  const options = [{ id: null, name: 'No Category', color: '#8C948F' }, ...others]
  return (
    <Modal
      open={!!category}
      onClose={onClose}
      title={`Delete “${category.name}”`}
      size="narrow"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onConfirm(target)}>
            Delete category
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-gray-400">
        {mealCount === 0
          ? 'This category has no meals. It will be removed.'
          : `Move the ${mealCount} meal${mealCount === 1 ? '' : 's'} in this category to:`}
      </p>
      {mealCount > 0 && (
        <div className="space-y-2">
          {options.map((opt) => {
            const on = target === opt.id
            return (
              <button
                key={opt.id ?? 'none'}
                type="button"
                onClick={() => setTarget(opt.id)}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.99]',
                  on ? 'shadow-glow' : 'bg-white/5',
                ].join(' ')}
                style={on ? { backgroundColor: `${opt.color}22`, outline: `2px solid ${opt.color}` } : undefined}
              >
                <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                <span className="flex-1 font-medium text-white">{opt.name}</span>
                {on && <CheckIcon className="h-5 w-5" style={{ color: opt.color }} />}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

