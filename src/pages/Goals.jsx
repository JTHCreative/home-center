import { useEffect, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Tabs from '../components/Tabs.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { useLocalState } from '../lib/storage.js'
import { CheckIcon, PlusIcon, TrashIcon } from '../components/Icons.jsx'

const PERIODS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

// --- Period key helpers: identify which period a goal currently belongs to. ---
function currentPeriodKey(period, now = new Date()) {
  if (period === 'monthly') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  if (period === 'weekly') {
    // Week starts Monday.
    const offset = (now.getDay() + 6) % 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - offset)
    return `W-${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  }
  // daily
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Reset a goal's progress if its stored period has rolled over.
function withResets(goals) {
  let changed = false
  const next = goals.map((g) => {
    const key = currentPeriodKey(g.period)
    if (g.periodKey === key) return g
    changed = true
    return { ...g, periodKey: key, done: false, value: 0 }
  })
  return changed ? next : goals
}

const emptyGoal = (period) => ({
  id: crypto.randomUUID(),
  period,
  type: 'checkbox',
  title: '',
  target: 10,
  value: 0,
  done: false,
  periodKey: currentPeriodKey(period),
})

function completion(goal) {
  if (goal.type === 'checkbox') return goal.done ? 1 : 0
  if (!goal.target) return 0
  return Math.max(0, Math.min(1, goal.value / goal.target))
}

export default function Goals() {
  const [period, setPeriod] = useState('daily')
  const [goals, setGoals] = useLocalState('goals', [])
  const [draft, setDraft] = useState(null)

  // Apply period resets on mount and every minute (covers midnight rollover
  // while the kiosk stays open).
  useEffect(() => {
    setGoals((g) => withResets(g))
    const id = setInterval(() => setGoals((g) => withResets(g)), 60_000)
    return () => clearInterval(id)
  }, [setGoals])

  const visible = goals.filter((g) => g.period === period)
  const summary =
    visible.length === 0
      ? 0
      : (visible.reduce((sum, g) => sum + completion(g), 0) / visible.length) * 100

  const saveDraft = () => {
    if (!draft.title.trim()) return
    const goal = { ...draft, title: draft.title.trim(), target: Number(draft.target) || 1 }
    setGoals((list) => {
      const exists = list.some((g) => g.id === goal.id)
      return exists ? list.map((g) => (g.id === goal.id ? goal : g)) : [...list, goal]
    })
    setDraft(null)
  }

  const patchGoal = (id, patch) =>
    setGoals((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  const removeGoal = (id) => setGoals((list) => list.filter((g) => g.id !== id))

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Goals" subtitle="Resets daily, every Monday, and on the 1st">
        <div className="flex items-center gap-3">
          <Tabs tabs={PERIODS} active={period} onChange={setPeriod} />
        </div>
      </PageHeader>

      {/* Summary ring */}
      <Card className="mb-6 flex items-center gap-6" glow>
        <ProgressRing value={summary} label="complete" />
        <div>
          <div className="text-sm text-gray-400">
            {PERIODS.find((p) => p.id === period).label} progress
          </div>
          <div className="font-mono text-2xl font-bold text-white">
            {visible.filter((g) => completion(g) >= 1).length}/{visible.length} done
          </div>
        </div>
        <div className="flex-1" />
        <Button onClick={() => setDraft(emptyGoal(period))}>
          <span className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" /> Add Goal
          </span>
        </Button>
      </Card>

      {/* Goals list */}
      <div className="space-y-3">
        {visible.length === 0 && (
          <Card className="text-center text-gray-500">
            No {period} goals yet — add one to get started.
          </Card>
        )}
        {visible.map((g) => (
          <Card key={g.id} className="flex items-center gap-4">
            {g.type === 'checkbox' ? (
              <button
                type="button"
                onClick={() => patchGoal(g.id, { done: !g.done })}
                aria-label={`Toggle ${g.title}`}
                className={[
                  'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border-2 active:scale-95',
                  g.done ? 'border-gain bg-gain text-bg shadow-glow-gain' : 'border-border',
                ].join(' ')}
              >
                {g.done && <CheckIcon className="h-7 w-7" />}
              </button>
            ) : (
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 font-mono text-sm font-bold text-accent">
                {Math.round(completion(g) * 100)}%
              </div>
            )}

            <div className="flex-1">
              <div
                className={[
                  'text-lg font-semibold',
                  completion(g) >= 1 ? 'text-gray-400 line-through' : 'text-white',
                ].join(' ')}
              >
                {g.title}
              </div>

              {g.type === 'progress' && (
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between font-mono text-xs text-gray-400">
                    <span>
                      {g.value} / {g.target}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-gain transition-all"
                      style={{ width: `${completion(g) * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => patchGoal(g.id, { value: Math.max(0, g.value - 1) })}
                      className="rounded-lg bg-white/5 px-4 py-2 font-mono text-lg text-gray-300 active:scale-95"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patchGoal(g.id, { value: Math.min(g.target, g.value + 1) })
                      }
                      className="rounded-lg bg-white/5 px-4 py-2 font-mono text-lg text-gray-300 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeGoal(g.id)}
              aria-label={`Delete ${g.title}`}
              className="rounded-lg bg-loss/15 p-3 text-loss active:scale-95"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </Card>
        ))}
      </div>

      {/* Add goal */}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title="New Goal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveDraft}>Save</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <input
              autoFocus
              className={fieldClass}
              placeholder="Goal title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />

            <div>
              <label className="mb-2 block text-xs text-gray-500">Type</label>
              <div className="flex gap-2">
                {[
                  { id: 'checkbox', label: 'Checkbox' },
                  { id: 'progress', label: 'Progress bar' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, type: t.id })}
                    className={[
                      'flex-1 rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
                      draft.type === t.id
                        ? 'bg-accent/15 text-accent shadow-glow'
                        : 'bg-white/5 text-gray-400',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {draft.type === 'progress' && (
              <div>
                <label className="mb-1 block text-xs text-gray-500">Target</label>
                <input
                  type="number"
                  min={1}
                  className={fieldClass}
                  value={draft.target}
                  onChange={(e) => setDraft({ ...draft, target: e.target.value })}
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs text-gray-500">Resets</label>
              <div className="flex gap-2">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, period: p.id, periodKey: currentPeriodKey(p.id) })
                    }
                    className={[
                      'flex-1 rounded-xl px-4 py-3 text-sm font-semibold active:scale-95',
                      draft.period === p.id
                        ? 'bg-accent/15 text-accent shadow-glow'
                        : 'bg-white/5 text-gray-400',
                    ].join(' ')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
