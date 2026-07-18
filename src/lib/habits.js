// Habit scoring helpers shared by the Habits page and the Home dashboard
// module. Kept in a plain module (no components) so both sides import one
// source of truth without tripping React Fast Refresh's "components only" rule.

// Points held in one habit entry: 1 for a done checkbox, 1 per filled tally
// box. Unchecking removes the point automatically since scores are computed
// from the stored checks, never accumulated separately.
//
// Shared habits mirror their displayed state (done/checks) to every sharing
// member, but only the member who actually tapped earns the point — the
// `earned` field (boolean for checkboxes, per-box array for tallies) carries
// that attribution. Entries written before `earned` existed score from the
// displayed state, so old points are preserved.
export const entryPoints = (e) => {
  if (!e) return 0
  const donePts = e.done ? (typeof e.earned === 'boolean' ? (e.earned ? 1 : 0) : 1) : 0
  const boxPts = Array.isArray(e.earned)
    ? e.earned.filter(Boolean).length
    : Array.isArray(e.checks)
      ? e.checks.filter(Boolean).length
      : 0
  return donePts + boxPts
}

// Every point a member has earned across all weeks of a progress map
// (weekKey -> memberId -> itemId -> entry). Entries for habits that were later
// deleted or un-flagged still count — points, once earned, stay earned.
export const totalEarned = (progress, memberId) =>
  Object.values(progress || {}).reduce((sum, week) => {
    const mem = week?.[memberId]
    if (!mem) return sum
    return sum + Object.values(mem).reduce((s, e) => s + entryPoints(e), 0)
  }, 0)

// Points a member has spent in the reward shop.
export const totalSpent = (purchases, memberId) =>
  (purchases || []).reduce((sum, p) => (p.memberId === memberId ? sum + p.cost : sum), 0)

// Points a member has moved from their personal stash into point pools.
export const totalContributed = (pools, memberId) =>
  (pools || []).reduce(
    (sum, pool) =>
      sum +
      (pool.contributions || []).reduce((s, c) => (c.memberId === memberId ? s + c.amount : s), 0),
    0,
  )

// Points remaining in a pool: contributions minus rewards redeemed from it.
export const poolBalance = (pool, purchases) =>
  (pool?.contributions || []).reduce((s, c) => s + c.amount, 0) -
  (purchases || []).reduce((s, p) => (p.poolId === pool?.id ? s + p.cost : s), 0)

// Spendable balance: lifetime earned minus shop spending minus pool contributions.
export const balanceOf = (progress, purchases, memberId, pools = []) =>
  totalEarned(progress, memberId) - totalSpent(purchases, memberId) - totalContributed(pools, memberId)

// Points a member has earned in one week's slice of the progress map.
export const weekPoints = (weekProgress, memberId) =>
  Object.values(weekProgress?.[memberId] || {}).reduce((s, e) => s + entryPoints(e), 0)

// Habit items configured on the Goals page, carrying their list's color.
export const habitItemsOf = (sections) =>
  (sections || []).flatMap((s) =>
    (s.items || []).filter((it) => it.habit).map((it) => ({ ...it, listColor: s.color })),
  )

// A habit with no assigned members belongs to everyone on the Habits board.
export const habitsFor = (items, memberId) =>
  (items || []).filter(
    (it) => (it.habitMembers || []).length === 0 || it.habitMembers.includes(memberId),
  )

// --- Goals <-> Habits sync ---------------------------------------------------
// A goal flagged as a habit tracks the same act in two stores: goals-progress
// (one shared entry per item) and habits-progress (per member). Checking on
// either page mirrors into the other for the same week.

// Members a habit belongs to (no assignment = everyone on the board).
export const habitSharers = (item, roster) =>
  (item?.habitMembers || []).length > 0 ? item.habitMembers : roster || []

// Push a Goals-page change into one week of habits progress. The displayed
// state (done/checks) mirrors to every sharer. The point (earned) goes to
// change.credit when set (the member picked in the "Who did it?" dialog),
// else to the habit's single member when that's unambiguous, else to no one.
// change: { kind: 'checkbox', done } | { kind: 'tally', checks, index, on },
// optionally with credit: memberId.
export const applyGoalToHabits = (weekSlice, item, roster, change) => {
  const sharers = habitSharers(item, roster)
  const credit =
    'credit' in change ? change.credit : sharers.length === 1 ? sharers[0] : null
  const next = { ...(weekSlice || {}) }
  for (const mid of sharers) {
    const e = next[mid]?.[item.id] || {}
    let patch
    if (change.kind === 'checkbox') {
      patch = { done: change.done, earned: change.done && mid === credit }
    } else {
      const base = Array.isArray(e.earned) ? e.earned : e.checks || []
      const earned = change.checks.map((c, i) =>
        i === change.index ? change.on && mid === credit : !!base[i] && !!c,
      )
      patch = { checks: change.checks, earned }
    }
    next[mid] = { ...(next[mid] || {}), [item.id]: { ...e, ...patch } }
  }
  return next
}

// Maximum points a set of habits can earn in one week (1 per checkbox, the
// target count per tally habit).
export const weekTarget = (items) =>
  (items || []).reduce((s, it) => s + (it.type === 'tally' ? it.target || 1 : 1), 0)
