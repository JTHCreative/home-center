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

// Trim sub-item titles and drop blank ones, one nested level included.
export const trimKids = (list) =>
  (list || [])
    .map((c) => ({
      id: c.id,
      title: c.title.trim(),
      ...(c.copyOf ? { copyOf: c.copyOf } : {}),
      ...(c.priority ? { priority: c.priority } : {}),
      ...(c.children ? { children: trimKids(c.children) } : {}),
    }))
    .filter((c) => c.title)

// Move the given ids' entries in each per-week progress map (checks and their
// check-off times) from week `from` to week `to`. `keys` maps a progress map
// name ('items', 'children', 'childrenAt') to the ids to carry.
export function carryProgress(progress, from, to, keys) {
  const src = progress[from]
  if (!src || from === to) return progress
  const dst = progress[to] || { items: {}, children: {} }
  const left = { ...src }
  const moved = { ...dst }
  for (const [key, ids] of Object.entries(keys)) {
    const a = { ...(src[key] || {}) }
    const b = { ...(dst[key] || {}) }
    for (const id of ids) {
      if (id in a) {
        b[id] = a[id]
        delete a[id]
      }
    }
    left[key] = a
    moved[key] = b
  }
  return { ...progress, [from]: left, [to]: moved }
}

// A goal (or sub-item) and its copies in other weeks share one root id.
const rootOf = (x) => x.copyOf || x.id

// Sub-items with the one at `path` ([subId] or [subId, nestedId]) removed.
const removeAt = (kids, [first, nested]) =>
  nested
    ? kids.map((c) => (c.id === first ? { ...c, children: kidsOf(c).filter((g) => g.id !== nested) } : c))
    : kids.filter((c) => c.id !== first)

// Move one sub-item of a one-off goal to another week. Only that sub-item
// (with its own nested sub-items) moves; the goal above it, and for a nested
// sub-item its parent too, are duplicated into the target week — or reused
// when a copy of them already lives there (moving back reuses the original).
//   items: the section's goals · goal: the goal as edited (may be unsaved)
//   path: [subId] or [subId, nestedId] · toWeek: target week key
// Returns the section's new goals, the edited goal's remaining sub-items, and
// the moved ids (whose checks should follow via carryProgress).
export function moveSubItem({ items, goal, path, toWeek }) {
  const parent = path.length === 2 ? (goal.children || []).find((c) => c.id === path[0]) : null
  const moved = parent
    ? kidsOf(parent).find((g) => g.id === path[1])
    : (goal.children || []).find((c) => c.id === path[0])
  const [movedClean] = trimKids([moved])

  // The goal's home in the target week: an existing copy, or a new duplicate.
  const existing = items.find(
    (it) =>
      it.id !== goal.id &&
      it.week === toWeek &&
      it.repeats === false &&
      !it.habit &&
      rootOf(it) === rootOf(goal),
  )
  const target = existing
    ? { ...existing, children: [...(existing.children || [])] }
    : {
        ...goal,
        id: crypto.randomUUID(),
        title: goal.title.trim(),
        copyOf: rootOf(goal),
        week: toWeek,
        repeats: false,
        habit: false,
        children: [],
      }

  if (parent) {
    // Nested: drop it under the parent's copy in the target goal.
    const idx = target.children.findIndex((c) => rootOf(c) === rootOf(parent))
    const host =
      idx === -1
        ? { id: crypto.randomUUID(), title: parent.title.trim(), copyOf: rootOf(parent), children: [] }
        : target.children[idx]
    const nextHost = { ...host, children: [...kidsOf(host), movedClean] }
    target.children =
      idx === -1
        ? [...target.children, nextHost]
        : target.children.map((c, i) => (i === idx ? nextHost : c))
  } else {
    target.children = [...target.children, movedClean]
  }

  const nextItems = items.map((it) => {
    if (it.id === goal.id) return { ...it, children: removeAt(it.children || [], path) }
    if (existing && it.id === existing.id) return target
    return it
  })
  return {
    items: existing ? nextItems : [...nextItems, target],
    remaining: removeAt(goal.children || [], path),
    movedIds: [moved.id, ...kidsOf(moved).map((g) => g.id)],
  }
}

// --- Priority ---------------------------------------------------------------
// Goals and sub-items can be flagged low / medium / high. A parent shows the
// highest priority among itself and everything under it, so flagging a
// sub-item lifts the goal (and a nested item lifts its parent sub-item).
export const PRIORITY_LEVELS = { low: 1, medium: 2, high: 3 }
export const PRIORITY_NAMES = ['', 'low', 'medium', 'high']

// { level: 0–3, inherited } — inherited when a child sets a level above the
// item's own.
export function effectivePriority(node) {
  const own = PRIORITY_LEVELS[node.priority] || 0
  const fromKids = Math.max(0, ...kidsOf(node).map((c) => effectivePriority(c).level))
  return { level: Math.max(own, fromKids), inherited: fromKids > own }
}

// Copies of `list` ordered high → low priority (unflagged last), keeping the
// custom order among equals; sub-items are ordered the same way.
export function sortByPriority(list) {
  return (list || [])
    .map((it, i) => ({ it, i, level: effectivePriority(it).level }))
    .sort((a, b) => b.level - a.level || a.i - b.i)
    .map(({ it }) => (kidsOf(it).length ? { ...it, children: sortByPriority(it.children) } : it))
}
