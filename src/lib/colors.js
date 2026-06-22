// Maps the app's old neon/synthetic palette onto the nature-inspired Color
// Design System equivalents. Used to migrate previously-saved member, category,
// and goal-section colors (stored in Firestore/localStorage) on read so they
// pick up the new palette without anyone having to re-pick colors.
//
// Investments intentionally keep their bright saturated red/green for charting
// and status (the --c-gain / --c-loss tokens and the Sparkline), so those hexes
// are deliberately absent from this map.
const LEGACY_COLOR_MAP = {
  '#58a6ff': '#6A9EC0', // blue   → Water
  '#39d353': '#6BAF7A', // green  → Sage
  '#f0883e': '#D4956A', // orange → Ember
  '#bc8cff': '#9B84C0', // purple → Thistle
  '#f85149': '#B87E72', // red    → Dusk
  '#d29922': '#A89060', // gold   → Lichen
  '#2dd4bf': '#5A9090', // teal   → Tide
  '#f778ba': '#A87898', // pink   → Heather
  '#8b949e': '#8C9480', // grey   → Stone
}

/** Map a single hex color to its nature-palette equivalent (idempotent). */
export function remapColor(hex) {
  if (typeof hex !== 'string') return hex
  return LEGACY_COLOR_MAP[hex.toLowerCase()] || hex
}

/**
 * Migrate an array of color-bearing records (members, categories, goal
 * sections, …), remapping each item's `color` field. Idempotent and safe to run
 * on every read: values already in the new palette pass through untouched.
 */
export function migrateColors(arr) {
  if (!Array.isArray(arr)) return arr
  return arr.map((item) =>
    item && typeof item === 'object' && 'color' in item
      ? { ...item, color: remapColor(item.color) }
      : item,
  )
}
