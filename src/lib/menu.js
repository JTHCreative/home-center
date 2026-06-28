import {
  CalendarIcon,
  CarIcon,
  ChartIcon,
  GoalIcon,
  GridIcon,
  HomeIcon,
  MealIcon,
} from '../components/Icons.jsx'

// Catalog of every page that can live in the sidebar menu. Add future pages
// here and they'll automatically show up in the Settings "Available" pool.
// (Settings is pinned to the bottom of the sidebar and is intentionally not
// part of the configurable menu.)
export const PAGE_CATALOG = [
  { id: 'dashboard', to: '/dashboard', label: 'Home', Icon: GridIcon },
  { id: 'smart-home', to: '/smart-home', label: 'Smart Home', Icon: HomeIcon },
  { id: 'stocks', to: '/stocks', label: 'Investments', Icon: ChartIcon },
  { id: 'calendar', to: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { id: 'meals', to: '/meals', label: 'Meals', Icon: MealIcon },
  { id: 'goals', to: '/goals', label: 'Goals', Icon: GoalIcon },
  { id: 'traffic', to: '/traffic', label: 'Traffic', Icon: CarIcon },
]

export const pageById = Object.fromEntries(PAGE_CATALOG.map((p) => [p.id, p]))

// Default sidebar order on first run: every catalog page, in catalog order.
export const DEFAULT_MENU = PAGE_CATALOG.map((p) => p.id)

// Reconcile a stored menu config against the current catalog so the menu
// survives renames, added pages (land in the pool), and removed pages.
// Shape: { menu: [pageId], pool: [pageId] }.
export function reconcileMenu(stored) {
  const ids = new Set(PAGE_CATALOG.map((p) => p.id))
  const clean = (arr) => (Array.isArray(arr) ? arr : []).filter((id) => ids.has(id))

  let menu
  let pool
  if (!stored || typeof stored !== 'object') {
    menu = [...DEFAULT_MENU]
    pool = []
  } else {
    menu = clean(stored.menu)
    pool = clean(stored.pool).filter((id) => !menu.includes(id))
  }

  // Any catalog page not yet placed (e.g. newly added) goes to the pool.
  const placed = new Set([...menu, ...pool])
  for (const p of PAGE_CATALOG) if (!placed.has(p.id)) pool.push(p.id)

  return { menu, pool }
}
