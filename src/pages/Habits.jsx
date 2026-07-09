import { useMemo, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import { MemberBadge } from '../components/Member.jsx'
import { useLocalState } from '../lib/storage.js'
import { migrateColors } from '../lib/colors.js'
import { GOALS_SEED, SEED_MEMBERS } from '../lib/seeds.js'
import {
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  CloseIcon,
  GiftIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
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

// Points held in one habit entry: 1 for a done checkbox, 1 per filled tally
// box. Unchecking removes the point automatically since scores are computed
// from the stored checks, never accumulated separately.
const entryPoints = (e) =>
  (e?.done ? 1 : 0) + (Array.isArray(e?.checks) ? e.checks.filter(Boolean).length : 0)

// Sum every point a member has earned in a progress map (all weeks). Entries
// for habits that were later deleted or un-flagged still count — points, once
// earned, stay earned.
const totalEarned = (progress, memberId) =>
  Object.values(progress || {}).reduce((sum, week) => {
    const mem = week?.[memberId]
    if (!mem) return sum
    return sum + Object.values(mem).reduce((s, e) => s + entryPoints(e), 0)
  }, 0)

export default function Habits() {
  const [sections] = useLocalState('goals-sections', GOALS_SEED, migrateColors) // read-only, shared with Goals
  const [members] = useLocalState('meals-members', SEED_MEMBERS, migrateColors) // read-only, shared household
  const [roster, setRoster] = useLocalState('habits-roster', []) // member ids shown on this page
  const [progress, setProgress] = useLocalState('habits-progress', {}) // weekKey -> memberId -> itemId -> { done | checks }
  const [rewards, setRewards] = useLocalState('habits-rewards', REWARDS_SEED)
  const [purchases, setPurchases] = useLocalState('habits-purchases', []) // [{ id, memberId, title, cost, date }]
  const [weekStart, setWeekStart] = useState(() => sundayOf(new Date()))
  const [addOpen, setAddOpen] = useState(false)
  const [rewardDraft, setRewardDraft] = useState(null) // reward being added/edited
  const [redeeming, setRedeeming] = useState(null) // reward being redeemed

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
  const habitItems = useMemo(
    () =>
      sections.flatMap((s) =>
        (s.items || []).filter((it) => it.habit).map((it) => ({ ...it, listColor: s.color })),
      ),
    [sections],
  )
  // A habit with no assigned members belongs to everyone on the board.
  const habitsFor = (memberId) =>
    habitItems.filter(
      (it) => (it.habitMembers || []).length === 0 || it.habitMembers.includes(memberId),
    )

  // Lifetime score = every point earned across all weeks, minus shop spending.
  const spentBy = (memberId) =>
    purchases.reduce((sum, p) => (p.memberId === memberId ? sum + p.cost : sum), 0)
  const balanceOf = (memberId) => totalEarned(progress, memberId) - spentBy(memberId)
  const weekPointsOf = (memberId) =>
    Object.values(wp[memberId] || {}).reduce((s, e) => s + entryPoints(e), 0)

  // --- Progress mutations (per member, per habit, for the selected week) -----
  const editEntry = (memberId, itemId, fn) =>
    setProgress((p) => {
      const week = p[weekKey] || {}
      const mem = week[memberId] || {}
      return {
        ...p,
        [weekKey]: { ...week, [memberId]: { ...mem, [itemId]: fn(mem[itemId] || {}) } },
      }
    })
  const toggleCheckbox = (memberId, itemId) =>
    editEntry(memberId, itemId, (e) => ({ ...e, done: !e.done }))
  const toggleTally = (memberId, itemId, index, target) =>
    editEntry(memberId, itemId, (e) => {
      const checks = Array.from({ length: target }, (_, i) => e.checks?.[i] || false)
      checks[index] = !checks[index]
      return { ...e, checks }
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
  const redeem = (reward, memberId) => {
    setPurchases((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        memberId,
        title: reward.title,
        cost: reward.cost,
        date: iso(new Date()),
      },
    ])
    setRedeeming(null)
  }
  // Undo a redemption — refunds the points.
  const removePurchase = (id) => setPurchases((list) => list.filter((p) => p.id !== id))

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
                  return (
                    <li key={p.id} className="flex items-center gap-3 py-1.5">
                      {member ? (
                        <MemberBadge member={member} size={22} />
                      ) : (
                        <span className="h-[22px] w-[22px] flex-shrink-0 rounded-full bg-white/10" />
                      )}
                      <span className="flex-1 truncate text-sm text-gray-300">{p.title}</span>
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
                  onClick={() => redeem(redeeming, m.id)}
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
        </Modal>
      )}
    </div>
  )
}

// One member's board: score header + their habit list for the selected week.
function MemberCard({ member, habits, entries, balance, weekPoints, onToggleCheckbox, onToggleTally, onRemove }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-3">
        <MemberBadge member={member} size={34} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold" style={{ color: member.color }}>
            {member.name}
          </h2>
          <div className="font-mono text-xs text-gray-500">
            {weekPoints > 0 ? `+${weekPoints} this week` : 'No points this week yet'}
          </div>
        </div>
        <div
          className={[
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-lg font-bold',
            balance < 0 ? 'bg-loss/15 text-loss' : 'bg-accent/15 text-accent',
          ].join(' ')}
          title="Total points (all-time earned minus rewards redeemed)"
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

// A single habit line: the same checkbox / tally-box interaction as Goals,
// plus the points this habit has earned in the selected week.
function HabitRow({ item, color, entry, onToggle, onToggleBox }) {
  const points = entryPoints(entry)
  const isTally = item.type === 'tally'
  const checks = entry.checks || []
  const done = !!entry.done
  const complete = isTally ? points >= item.target && item.target > 0 : done

  return (
    <li className="rounded-lg px-1 py-1.5">
      <div className="flex items-center gap-3">
        {isTally ? (
          <div className="flex flex-shrink-0 flex-wrap gap-1.5">
            {Array.from({ length: item.target }, (_, i) => {
              const filled = !!checks[i]
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onToggleBox(i)}
                  aria-label={`Toggle box ${i + 1}`}
                  className="flex h-7 w-7 items-center justify-center rounded border-2 active:scale-90"
                  style={
                    filled
                      ? { backgroundColor: color, borderColor: color, color: '#0D1117' }
                      : { borderColor: '#30363D' }
                  }
                >
                  {filled && <CheckIcon className="h-4 w-4" />}
                </button>
              )
            })}
          </div>
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

        <div className="flex flex-1 items-center gap-2 truncate">
          {/* Dot in the source list's color ties the habit back to Goals. */}
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: item.listColor }}
          />
          <span className={complete ? 'truncate text-gray-500 line-through' : 'truncate text-gray-100'}>
            {item.title}
          </span>
          {isTally && (
            <span className="font-mono text-xs text-gray-500">
              {points}/{item.target}
            </span>
          )}
        </div>

        {points > 0 && (
          <span className="flex-shrink-0 font-mono text-xs font-bold text-accent">+{points}★</span>
        )}
      </div>
    </li>
  )
}
