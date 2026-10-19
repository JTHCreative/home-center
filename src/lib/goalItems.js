// Goal checklist helpers shared by the Goals page and the Home dashboard
// module. A goal's `children` are sub-items; each sub-item may hold its own
// `children` (one more level down). Per-week checks for both levels live in
// the same `wp.children` map, keyed by id, so they follow the goal's week
// binding exactly like first-level sub-items do.

const kidsOf = (c) => c.children || []

// A sub-item with nested sub-items is done when all of them are.
export const subDone = (c, checks) =>
  kidsOf(c).length > 0 ? kidsOf(c).every((g) => checks[g.id]) : !!checks[c.id]

// Completion (0–1) of one sub-item, counting partial nested progress.
const subFraction = (c, checks) =>
  kidsOf(c).length > 0
    ? kidsOf(c).filter((g) => checks[g.id]).length / kidsOf(c).length
    : checks[c.id]
      ? 1
      : 0

// Toggle a sub-item. One with nested sub-items checks (or clears) all of them.
export function toggleSub(checks, c) {
  if (kidsOf(c).length === 0) return { ...checks, [c.id]: !checks[c.id] }
  const next = !subDone(c, checks)
  return { ...checks, ...Object.fromEntries(kidsOf(c).map((g) => [g.id, next])) }
}

// Every sub-item id under a goal, nested ones included.
export const subIds = (item) =>
  (item.children || []).flatMap((c) => [c.id, ...kidsOf(c).map((g) => g.id)])

// Completion (0–1) for an item, using the selected week's progress.
export function itemCompletion(item, wp) {
  const kids = item.children || []
  if (kids.length > 0) {
    return kids.reduce((sum, c) => sum + subFraction(c, wp.children), 0) / kids.length
  }
  if (item.type === 'tally') {
    const checks = wp.items[item.id]?.checks || []
    const done = checks.slice(0, item.target).filter(Boolean).length
    return item.target ? Math.max(0, Math.min(1, done / item.target)) : 0
  }
  return wp.items[item.id]?.done ? 1 : 0
}
