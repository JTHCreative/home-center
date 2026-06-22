// Maps older category/member/section colors onto the current "happy medium"
// palette — a blend sitting between the original neon palette (too saturated)
// and the muted nature palette (too washed out). Applied on read so previously
// saved colors adopt the current palette without anyone re-picking them.
//
// Two generations are remapped: the original neon hexes, and the interim muted
// nature hexes. Investments intentionally keep their bright saturated red/green
// for charting and status, so those hexes are deliberately absent here.
const LEGACY_COLOR_MAP = {
  // Original neon palette → medium
  '#58a6ff': '#61A2E0', // blue   → Water
  '#39d353': '#52C167', // green  → Sage
  '#f0883e': '#E28F54', // orange → Ember
  '#bc8cff': '#AC88E0', // purple → Thistle
  '#f85149': '#D8685E', // red    → Dusk
  '#d29922': '#BD9541', // gold   → Lichen
  '#2dd4bf': '#44B2A8', // teal   → Tide
  '#f778ba': '#D078A9', // pink   → Heather
  '#8b949e': '#8C948F', // grey   → Stone
  // Interim muted nature palette → medium
  '#d4956a': '#E28F54', // Ember
  '#6baf7a': '#52C167', // Sage
  '#6a9ec0': '#61A2E0', // Water
  '#9b84c0': '#AC88E0', // Thistle
  '#c4a882': '#CDA86C', // Sand
  '#9dc49f': '#8FC992', // Fern
  '#b87e72': '#D8685E', // Dusk
  '#8aaabb': '#82B0C8', // Fog
  '#a89060': '#BD9541', // Lichen
  '#a87898': '#D078A9', // Heather
  '#8c9480': '#8C948F', // Stone
  '#5a9090': '#44B2A8', // Tide
}

/** Map a single hex color to its current-palette equivalent (idempotent). */
export function remapColor(hex) {
  if (typeof hex !== 'string') return hex
  return LEGACY_COLOR_MAP[hex.toLowerCase()] || hex
}

/**
 * Migrate an array of color-bearing records (members, categories, goal
 * sections, …), remapping each item's `color` field. Idempotent and safe to run
 * on every read: values already in the current palette pass through untouched.
 */
export function migrateColors(arr) {
  if (!Array.isArray(arr)) return arr
  return arr.map((item) =>
    item && typeof item === 'object' && 'color' in item
      ? { ...item, color: remapColor(item.color) }
      : item,
  )
}
