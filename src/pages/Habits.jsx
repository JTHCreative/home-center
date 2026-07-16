import { useMemo, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import { MemberBadge } from '../components/Member.jsx'
import TallyBoxes from '../components/TallyBoxes.jsx'
import { useLocalState } from '../lib/storage.js'
import { migrateColors } from '../lib/colors.js'
import { GOALS_SEED, SEED_MEMBERS } from '../lib/seeds.js'
import {
  balanceOf as balanceIn,
  entryPoints,
  habitItemsOf,
  habitsFor as habitsIn,
  poolBalance,
  totalEarned,
  weekPoints,
} from '../lib/habits.js'
import {
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloseIcon,
  GiftIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  UsersIcon,
} from '../components/Icons.jsx'

// --- Date helpers (same Sunday-start week scheme as Goals) -------------------
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

// Starter shop — fully editable (add/edit/delete) from the Reward Shop card.
const REWARDS_SEED = [
  { id: 'rw-sf-trip', title: 'Trip to San Francisco', cost: 10 },
  { id: 'rw-movie-pick', title: 'Pick the movie night film', cost: 5 },
  { id: 'rw-dessert', title: 'Dessert of your choice', cost: 3 },
]

export default function Habits() {
  const [sections] = useLocalState('goals-sections', GOALS_SEED, migrateColors) // read-only, shared with Goals
  const [members] = useLocalState('meals-members', SEED_MEMBERS, migrateColors) // read-only, shared household
  const [roster, setRoster] = useLocalState('habits-roster', []) // member ids shown on this page
  const [progress, setProgress] = useLocalState('habits-progress', {}) // weekKey -> memberId -> itemId -> { done | checks }
  const [rewards, setRewards] = useLocalState('habits-rewards', REWARDS_SEED)
  // Purchases carry either memberId (personal redemption) or poolId (redeemed
  // together from a point pool).
  const [purchases, setPurchases] = useLocalState('habits-purchases', [])
  // Point pools: shared stashes members chip into and redeem from together.
  const [pools, setPools] = useLocalState('habits-pools', []) // [{ id, title, contributions: [{ id, memberId, amount, date }] }]
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [addOpen, setAddOpen] = useState(false)
  const [rewardDraft, setRewardDraft] = useState(null) // reward being added/edited
  const [redeeming, setRedeeming] = useState(null) // reward being redeemed
  const [poolDraft, setPoolDraft] = useState(null) // new pool being named
  const [chipIn, setChipIn] = useState(null) // { poolId, memberId, amount }

  const weekKey = iso(weekStart)
  const wp = progress[weekKey] || {}
  const isCurrentWeek = weekKey === iso(sundayOf(new Date()))

  // Members on the board, resolved against the shared household list (drops
  // any that were deleted in Settings).
  const rosterMembers = useMemo(
    () => roster.map((id) => members.find((m) => m.id === id)).filter(Boolean),
    [roster, members],
  )
  const offRoster = members.filter((m) => !roster.includes(m.id))

  // Habit items configured on the Goals page, carrying their list's color.
  const habitItems = useMemo(() => habitItemsOf(sections), [sections])
  const habitsFor = (memberId) => habitsIn(habitItems, memberId)

  // Spendable balance = lifetime points earned across all weeks, minus shop
  // spending, minus points chipped into pools. Lifetime earned is shown
  // separately (it never goes down).
  const balanceOf = (memberId) => balanceIn(progress, purchases, memberId, pools)
  const weekPointsOf = (memberId) => weekPoints(wp, memberId)

  // --- Progress mutations (per habit, for the selected week) -----------------
  // A habit is shared by its assigned members (no assignment = everyone on the
  // board). One member's check mirrors the displayed state (done/checks) to
  // every sharer's list — and re-syncs any that drifted — but only the acting
  // member is marked `earned`, so the point goes to whoever actually did it.
  // Unchecking clears the display and the earned credit for the whole group.
  const sharedWith = (itemId) => {
    const assigned = habitItems.find((it) => it.id === itemId)?.habitMembers || []
    return assigned.length === 0 ? roster : assigned
  }
  const toggleCheckbox = (memberId, itemId) =>
    setProgress((p) => {
      const week = p[weekKey] || {}
      const done = !week[memberId]?.[itemId]?.done
      const next = { ...week }
      for (const mid of new Set([memberId, ...sharedWith(itemId)])) {
        const e = next[mid]?.[itemId] || {}
        next[mid] = { ...(next[mid] || {}), [itemId]: { ...e, done, earned: done && mid === memberId } }
      }
      return { ...p, [weekKey]: next }
    })
  const toggleTally = (memberId, itemId, index, target) =>
    setProgress((p) => {
      const week = p[weekKey] || {}
      const actor = week[memberId]?.[itemId] || {}
      const on = !actor.checks?.[index]
      const next = { ...week }
      for (const mid of new Set([memberId, ...sharedWith(itemId)])) {
        const e = next[mid]?.[itemId] || {}
        const checks = Array.from({ length: target }, (_, i) =>
          i === index ? on : actor.checks?.[i] || false,
        )
        // Entries from before attribution existed earned their own checks.
        const base = Array.isArray(e.earned) ? e.earned : e.checks || []
        const earned = Array.from({ length: target }, (_, i) =>
          i === index ? on && mid === memberId : !!base[i] && checks[i],
        )
        next[mid] = { ...(next[mid] || {}), [itemId]: { ...e, checks, earned } }
      }
      return { ...p, [weekKey]: next }
    })

  // --- Roster ops (history is kept when a member is removed from the board) --
  const addToRoster = (id) => setRoster((r) => (r.includes(id) ? r : [...r, id]))
  const removeFromRoster = (id) => setRoster((r) => r.filter((m) => m !== id))

  // --- Shop ops ---------------------------------------------------------------
  const saveReward = () => {
    if (!rewardDraft.title.trim()) return
    const reward = {
      ...rewardDraft,
      title: rewardDraft.title.trim(),
      cost: Math.max(1, Number(rewardDraft.cost) || 1),
    }
    setRewards((list) => {
      const exists = list.some((r) => r.id === reward.id)
      return exists ? list.map((r) => (r.id === reward.id ? reward : r)) : [...list, reward]
    })
    setRewardDraft(null)
  }
  const removeReward = (id) => {
    setRewards((list) => list.filter((r) => r.id !== id))
    setRewardDraft(null)
  }
  // Redeem for one member ({ memberId }) or together from a pool ({ poolId }).
  const redeem = (reward, target) => {
    setPurchases((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        ...target,
        title: reward.title,
        cost: reward.cost,
        date: iso(new Date()),
      },
    ])
    setRedeeming(null)
  }
  // Undo a redemption — refunds the points (to the member or the pool).
  const removePurchase = (id) => setPurchases((list) => list.filter((p) => p.id !== id))

  // --- Pool ops ---------------------------------------------------------------
  const savePool = () => {
    if (!poolDraft.title.trim()) return
    setPools((list) => [
      ...list,
      { id: poolDraft.id, title: poolDraft.title.trim(), contributions: [] },
    ])
    setPoolDraft(null)
  }
  // Deleting a pool hands every contribution back to its member, so it's only
  // offered (see below) while nothing has been redeemed from the pool.
  const removePool = (id) => setPools((list) => list.filter((p) => p.id !== id))
  const saveChipIn = () => {
    const amount = Math.min(
      Math.max(1, Number(chipIn.amount) || 0),
      Math.max(0, balanceOf(chipIn.memberId)),
    )
    if (amount < 1) return
    setPools((list) =>
      list.map((p) =>
        p.id === chipIn.poolId
          ? {
              ...p,
              contributions: [
                ...(p.contributions || []),
                { id: crypto.randomUUID(), memberId: chipIn.memberId, amount, date: iso(new Date()) },
              ],
            }
          : p,
      ),
    )
    setChipIn(null)
  }

  // Week label, e.g. "Jun 8 – Jun 14" (mirrors the Goals navigator).
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

  const recentPurchases = [...purchases].reverse().slice(0, 8)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Habits" subtitle="Check habits, earn points, spend them in the shop">
        <Button onClick={() => setAddOpen(true)}>
          <span className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" /> Add Member
          </span>
        </Button>
      </PageHeader>

      {/* Week navigator — same interaction as Goals: arrows step, tap the
          range to jump back to this week. */}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {rosterMembers.length === 0 && (
          <Card className="lg:col-span-2">
            <p className="text-sm text-gray-400">
              No one&apos;s on the board yet. Tap <span className="font-semibold text-gray-200">Add Member</span> to
              bring in a household member, then mark goals as{' '}
              <span className="font-semibold text-gray-200">Habits</span> on the Goals page to start
              earning points.
            </p>
          </Card>
        )}

        {rosterMembers.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            habits={habitsFor(member.id)}
            entries={wp[member.id] || {}}
            balance={balanceOf(member.id)}
            lifetime={totalEarned(progress, member.id)}
            weekPoints={weekPointsOf(member.id)}
            onToggleCheckbox={(itemId) => toggleCheckbox(member.id, itemId)}
            onToggleTally={(itemId, index, target) => toggleTally(member.id, itemId, index, target)}
            onRemove={() => removeFromRoster(member.id)}
          />
        ))}

        {/* Reward shop — customizable prizes bought with habit points. */}
        <Card className={rosterMembers.length % 2 === 0 ? 'lg:col-span-2' : ''}>
          <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
            <GiftIcon className="h-5 w-5 text-accent" />
            <h2 className="flex-1 text-lg font-bold text-white">Reward Shop</h2>
            <button
              type="button"
              onClick={() => setRewardDraft({ id: crypto.randomUUID(), title: '', cost: 5 })}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-gray-300 active:scale-95"
            >
              <PlusIcon className="h-4 w-4" /> Reward
            </button>
          </div>

          {rewards.length === 0 ? (
            <p className="text-sm text-gray-500">No rewards yet — add one to give points a purpose.</p>
          ) : (
            <ul className="space-y-2">
              {rewards.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
                  <span className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 font-mono text-sm font-bold text-accent">
                    <StarIcon className="h-4 w-4" /> {r.cost}
                  </span>
                  <span className="flex-1 truncate text-gray-100">{r.title}</span>
                  <button
                    type="button"
                    onClick={() => setRewardDraft({ ...r })}
                    aria-label={`Edit ${r.title}`}
                    className="rounded-lg p-2 text-gray-500 active:scale-95 active:text-gray-200"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <Button
                    className="!px-4 !py-2 !text-sm"
                    onClick={() => setRedeeming(r)}
                    disabled={rosterMembers.length === 0}
                  >
                    Redeem
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {/* Redemption history — trash a row to undo and refund the points. */}
          {recentPurchases.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Redeemed
              </h3>
              <ul className="space-y-1">
                {recentPurchases.map((p) => {
                  const member = members.find((m) => m.id === p.memberId)
                  const pool = pools.find((pl) => pl.id === p.poolId)
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-1.5">
                      {member ? (
                        <MemberBadge member={member} size={22} />
                      ) : pool ? (
                        <span
                          title={pool.title}
                          className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
                        >
                          <UsersIcon className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="h-[22px] w-[22px] flex-shrink-0 rounded-full bg-white/10" />
                      )}
                      <span className="flex-1 truncate text-sm text-gray-300">
                        {p.title}
                        {pool && <span className="text-gray-500"> · {pool.title}</span>}
                      </span>
                      <span className="font-mono text-xs text-loss">-{p.cost}★</span>
                      <span className="w-14 flex-shrink-0 text-right font-mono text-xs text-gray-500">
                        {p.date?.slice(5).replace('-', '/')}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePurchase(p.id)}
                        aria-label={`Undo ${p.title}`}
                        title="Undo (refund points)"
                        className="rounded p-1.5 text-gray-600 active:scale-95 active:text-loss"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Card>

        {/* Point pools — shared stashes members chip into and redeem together. */}
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
            <UsersIcon className="h-5 w-5 text-accent" />
            <h2 className="flex-1 text-lg font-bold text-white">Point Pools</h2>
            <button
              type="button"
              onClick={() => setPoolDraft({ id: crypto.randomUUID(), title: '' })}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-gray-300 active:scale-95"
            >
              <PlusIcon className="h-4 w-4" /> Pool
            </button>
          </div>

          {pools.length === 0 ? (
            <p className="text-sm text-gray-500">
              No pools yet — create one to save up for a shared reward together.
            </p>
          ) : (
            <ul className="space-y-2">
              {pools.map((pool) => {
                const bal = poolBalance(pool, purchases)
                const hasRedemptions = purchases.some((p) => p.poolId === pool.id)
                // Per-member totals, in household order, for the breakdown chips.
                const shares = members
                  .map((m) => ({
                    member: m,
                    amount: (pool.contributions || []).reduce(
                      (s, c) => (c.memberId === m.id ? s + c.amount : s),
                      0,
                    ),
                  }))
                  .filter((s) => s.amount > 0)
                return (
                  <li key={pool.id} className="rounded-xl bg-white/5 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1 font-mono text-sm font-bold text-accent">
                        <StarIcon className="h-4 w-4" /> {bal}
                      </span>
                      <span className="min-w-0 flex-1 break-words font-semibold text-gray-100">
                        {pool.title}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setChipIn({ poolId: pool.id, memberId: rosterMembers[0]?.id, amount: 1 })
                        }
                        disabled={rosterMembers.length === 0}
                        className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-gray-300 active:scale-95 disabled:opacity-50"
                      >
                        <PlusIcon className="h-4 w-4" /> Chip In
                      </button>
                      {/* Deleting refunds every contribution, so it's only
                          offered before anything has been redeemed. */}
                      {!hasRedemptions && (
                        <button
                          type="button"
                          onClick={() => removePool(pool.id)}
                          aria-label={`Delete ${pool.title}`}
                          title="Delete pool (refunds all contributions)"
                          className="rounded p-1.5 text-gray-600 active:scale-95 active:text-loss"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {shares.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {shares.map(({ member, amount }) => (
                          <span
                            key={member.id}
                            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-xs text-gray-300"
                          >
                            <MemberBadge member={member} size={18} />
                            <span className="font-semibold" style={{ color: member.color }}>
                              {member.name}
                            </span>
                            <span className="font-mono text-gray-400">{amount}★</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Add a household member to the board */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Member"
        size="narrow"
        footer={
          <Button variant="ghost" onClick={() => setAddOpen(false)}>
            Done
          </Button>
        }
      >
        {offRoster.length === 0 ? (
          <p className="text-sm text-gray-400">
            Everyone&apos;s already on the board. Household members are managed on the Settings page.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {offRoster.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addToRoster(m.id)}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold active:scale-95"
                style={{ color: m.color }}
              >
                <MemberBadge member={m} />
                {m.name}
                <PlusIcon className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Add/edit a shop reward */}
      {rewardDraft && (
        <Modal
          open={!!rewardDraft}
          onClose={() => setRewardDraft(null)}
          title="Reward"
          size="narrow"
          footer={
            <>
              {rewards.some((r) => r.id === rewardDraft.id) && (
                <Button variant="danger" onClick={() => removeReward(rewardDraft.id)}>
                  <TrashIcon className="h-5 w-5" />
                </Button>
              )}
              <Button variant="ghost" onClick={() => setRewardDraft(null)}>
                Cancel
              </Button>
              <Button onClick={saveReward}>Save</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs text-gray-500">Reward</label>
              <input
                autoFocus
                className={fieldClass}
                placeholder="e.g. Trip to SF"
                value={rewardDraft.title}
                onChange={(e) => setRewardDraft({ ...rewardDraft, title: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs text-gray-500">Cost (points)</label>
              <input
                type="number"
                min={1}
                className={fieldClass}
                value={rewardDraft.cost}
                onChange={(e) => setRewardDraft({ ...rewardDraft, cost: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Redeem: pick who's spending their points */}
      {redeeming && (
        <Modal
          open={!!redeeming}
          onClose={() => setRedeeming(null)}
          title={`Redeem: ${redeeming.title}`}
          size="narrow"
          footer={
            <Button variant="ghost" onClick={() => setRedeeming(null)}>
              Cancel
            </Button>
          }
        >
          <p className="mb-4 text-sm text-gray-400">
            Costs <span className="font-mono font-bold text-accent">{redeeming.cost}★</span> —
            who&apos;s redeeming?
          </p>
          <div className="space-y-2">
            {rosterMembers.map((m) => {
              const balance = balanceOf(m.id)
              const canAfford = balance >= redeeming.cost
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!canAfford}
                  onClick={() => redeem(redeeming, { memberId: m.id })}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                    canAfford ? 'bg-white/5' : 'cursor-not-allowed bg-white/[0.02] opacity-50',
                  ].join(' ')}
                >
                  <MemberBadge member={m} size={28} />
                  <span className="flex-1 font-semibold" style={{ color: m.color }}>
                    {m.name}
                  </span>
                  <span className="font-mono text-sm text-gray-400">
                    {balance}★ {!canAfford && '· not enough'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Or redeem together from a point pool */}
          {pools.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Pools
              </h3>
              <div className="space-y-2">
                {pools.map((pool) => {
                  const bal = poolBalance(pool, purchases)
                  const canAfford = bal >= redeeming.cost
                  return (
                    <button
                      key={pool.id}
                      type="button"
                      disabled={!canAfford}
                      onClick={() => redeem(redeeming, { poolId: pool.id })}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                        canAfford ? 'bg-white/5' : 'cursor-not-allowed bg-white/[0.02] opacity-50',
                      ].join(' ')}
                    >
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <UsersIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-gray-100">
                        {pool.title}
                      </span>
                      <span className="font-mono text-sm text-gray-400">
                        {bal}★ {!canAfford && '· not enough'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Name a new point pool */}
      {poolDraft && (
        <Modal
          open={!!poolDraft}
          onClose={() => setPoolDraft(null)}
          title="New Pool"
          size="narrow"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPoolDraft(null)}>
                Cancel
              </Button>
              <Button onClick={savePool}>Create</Button>
            </>
          }
        >
          <label className="mb-2 block text-xs text-gray-500">Pool name</label>
          <input
            autoFocus
            className={fieldClass}
            placeholder="e.g. Disneyland Fund"
            value={poolDraft.title}
            onChange={(e) => setPoolDraft({ ...poolDraft, title: e.target.value })}
          />
        </Modal>
      )}

      {/* Chip points from a member's stash into a pool */}
      {chipIn && (
        <Modal
          open={!!chipIn}
          onClose={() => setChipIn(null)}
          title={`Chip In: ${pools.find((p) => p.id === chipIn.poolId)?.title || ''}`}
          size="narrow"
          footer={
            <>
              <Button variant="ghost" onClick={() => setChipIn(null)}>
                Cancel
              </Button>
              <Button
                onClick={saveChipIn}
                disabled={
                  !chipIn.memberId ||
                  balanceOf(chipIn.memberId) < 1 ||
                  Math.max(1, Number(chipIn.amount) || 0) > balanceOf(chipIn.memberId)
                }
              >
                Add Points
              </Button>
            </>
          }
        >
          <label className="mb-2 block text-xs text-gray-500">Who&apos;s chipping in?</label>
          <div className="mb-5 space-y-2">
            {rosterMembers.map((m) => {
              const balance = balanceOf(m.id)
              const selected = chipIn.memberId === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setChipIn({ ...chipIn, memberId: m.id, amount: 1 })}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.98]',
                    selected ? 'bg-accent/15 shadow-glow' : 'bg-white/5',
                  ].join(' ')}
                >
                  <MemberBadge member={m} size={28} />
                  <span className="flex-1 font-semibold" style={{ color: m.color }}>
                    {m.name}
                  </span>
                  <span className="font-mono text-sm text-gray-400">{balance}★ available</span>
                </button>
              )
            })}
          </div>

          <label className="mb-2 block text-xs text-gray-500">Points to add</label>
          <div className="flex items-center gap-3">
            <div className="flex flex-shrink-0 items-center rounded-xl border border-border bg-bg p-1">
              <button
                type="button"
                onClick={() =>
                  setChipIn({ ...chipIn, amount: Math.max(1, (Number(chipIn.amount) || 1) - 1) })
                }
                aria-label="Fewer points"
                className="rounded-lg p-2.5 text-gray-300 active:scale-95 active:bg-white/5"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
              <span className="w-10 text-center font-mono text-lg font-bold text-white">
                {Math.max(1, Number(chipIn.amount) || 1)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setChipIn({
                    ...chipIn,
                    amount: Math.min(
                      Math.max(1, balanceOf(chipIn.memberId)),
                      (Number(chipIn.amount) || 1) + 1,
                    ),
                  })
                }
                aria-label="More points"
                className="rounded-lg p-2.5 text-gray-300 active:scale-95 active:bg-white/5"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                setChipIn({ ...chipIn, amount: Math.max(1, balanceOf(chipIn.memberId)) })
              }
              className="rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-gray-300 active:scale-95"
            >
              All ({Math.max(0, balanceOf(chipIn.memberId))}★)
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// One member's board: score header + their habit list for the selected week.
// The big chip is the member's spendable balance (earned minus redeemed); the
// small subline tracks this week's checks and their lifetime total earned.
function MemberCard({ member, habits, entries, balance, lifetime, weekPoints, onToggleCheckbox, onToggleTally, onRemove }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
        <MemberBadge member={member} size={34} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold" style={{ color: member.color }}>
            {member.name}
          </h2>
          <div className="truncate font-mono text-xs text-gray-500">
            {weekPoints > 0 ? `+${weekPoints} this week` : 'None this week yet'}
            <span className="text-gray-600"> · {lifetime}★ lifetime</span>
          </div>
        </div>
        <div
          className={[
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-lg font-bold',
            balance < 0 ? 'bg-loss/15 text-loss' : 'bg-accent/15 text-accent',
          ].join(' ')}
          title="Spendable points (lifetime earned minus rewards redeemed)"
        >
          <StarIcon className="h-5 w-5" /> {balance}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${member.name} from Habits`}
          title="Remove from this page (points are kept)"
          className="rounded-lg p-2 text-gray-600 active:scale-95 active:text-loss"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {habits.length === 0 ? (
        <p className="px-1 py-2 text-sm text-gray-500">
          No habits yet — edit a goal on the Goals page and turn on{' '}
          <span className="text-gray-300">Track as Habit</span>.
        </p>
      ) : (
        <ul className="space-y-1">
          {habits.map((it) => (
            <HabitRow
              key={it.id}
              item={it}
              color={member.color}
              entry={entries[it.id] || {}}
              onToggle={() => onToggleCheckbox(it.id)}
              onToggleBox={(index) => onToggleTally(it.id, index, it.target)}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

// A single habit line: the same interaction as the Goals page — checkbox for
// simple habits; for tally habits a read-only count badge with a chevron that
// folds the tally boxes onto a row beneath. Titles wrap instead of truncating.
// The accent chip shows the points this habit has earned in the selected week.
function HabitRow({ item, color, entry, onToggle, onToggleBox }) {
  // `points` is what THIS member earned; the badge and strikethrough follow
  // the displayed state, which a shared habit mirrors across all sharers.
  const points = entryPoints(entry)
  const isTally = item.type === 'tally'
  const checks = entry.checks || []
  const filled = checks.slice(0, item.target).filter(Boolean).length
  const done = !!entry.done
  const complete = isTally ? filled >= item.target && item.target > 0 : done
  const [open, setOpen] = useState(false)

  return (
    <li className="rounded-lg px-1 py-1.5">
      <div className="flex items-center gap-3">
        {isTally ? (
          // Read-only progress badge — checks happen on the row beneath.
          <span
            className="flex h-7 min-w-[2.75rem] flex-shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {filled}/{item.target}
          </span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-label={`Toggle ${item.title}`}
            className={[
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border-2 active:scale-95',
              done ? 'text-bg' : 'border-border',
            ].join(' ')}
            style={done ? { backgroundColor: color, borderColor: color } : undefined}
          >
            {done && <CheckIcon className="h-5 w-5" />}
          </button>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Dot in the source list's color ties the habit back to Goals. */}
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: item.listColor }}
          />
          <span
            className={[
              'min-w-0 break-words text-sm sm:text-base',
              complete ? 'text-gray-500 line-through' : 'text-gray-100',
            ].join(' ')}
          >
            {item.title}
          </span>
        </div>

        {points > 0 && (
          <span className="flex-shrink-0 font-mono text-xs font-bold text-accent">+{points}★</span>
        )}

        {isTally && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${item.title}`}
            aria-expanded={open}
            className="flex-shrink-0 rounded-md bg-white/5 p-1.5 text-gray-400 active:scale-95"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Tally boxes, on their own row so long habit names keep full width */}
      {isTally && open && (
        <div className="ml-10 mt-2">
          <TallyBoxes
            checks={checks}
            target={item.target}
            color={color}
            onToggle={onToggleBox}
            daily={!!item.daily}
          />
        </div>
      )}
    </li>
  )
}
