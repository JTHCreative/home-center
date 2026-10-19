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

// Toggle a sub-item in a week's progress. One with nested sub-items checks (or
// clears) all of them. Check-off times are kept in `childrenAt`.
export function toggleSub(wk, c) {
  const ids = kidsOf(c).length > 0 ? kidsOf(c).map((g) => g.id) : [c.id]
  const next = !subDone(c, wk.children)
  const children = { ...wk.children }
  const childrenAt = { ...wk.childrenAt }
  const now = Date.now()
  for (const id of ids) {
    children[id] = next
    if (next) childrenAt[id] = now
    else delete childrenAt[id]
  }
  return { ...wk, children, childrenAt }
}

// When a sub-item was checked off: its own time, or for one with nested
// sub-items, when the last of them was checked.
export function subDoneAt(c, wp) {
  const at = wp.childrenAt || {}
  if (kidsOf(c).length === 0) return at[c.id]
  const times = kidsOf(c).map((g) => at[g.id])
  return times.every(Boolean) ? Math.max(...times) : undefined
}

// A goal's progress entry with its checkbox set, stamping when it was checked.
export const withDone = (entry, done) => ({
  ...entry,
  done,
  doneAt: done ? Date.now() : undefined,
})

// A goal's progress entry with new tally `checks`, stamping box `index`.
export function withChecks(entry, checks, index) {
  const checksAt = [...(entry?.checksAt || [])]
  checksAt[index] = checks[index] ? Date.now() : null
  return { ...entry, checks, checksAt }
}

// "Checked off Mon, Oct 19 at 8:42 AM" for a check-off timestamp.
export const checkedAtLabel = (ts) =>
  ts
    ? `Checked off ${new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : null

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
