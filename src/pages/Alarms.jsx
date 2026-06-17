import { useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import Toggle from '../components/Toggle.jsx'
import { PlusIcon, TrashIcon } from '../components/Icons.jsx'
import { useLocalState } from '../lib/storage.js'
import { ALARM_ICONS, ALARM_ICON_NAMES, DAYS, daysSummary, fmt12 } from '../lib/alarms.js'

const newAlarm = () => ({
  id: crypto.randomUUID(),
  name: '',
  time: '07:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  icon: 'bell',
  enabled: true,
})

export default function Alarms() {
  const [alarms, setAlarms] = useLocalState('alarms', [])
  const [draft, setDraft] = useState(null)

  const sorted = [...(alarms || [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const saveDraft = () => {
    if (!draft.time) return
    const next = { ...draft, name: draft.name.trim() || 'Alarm' }
    setAlarms((list) => {
      const exists = list.some((a) => a.id === next.id)
      return exists ? list.map((a) => (a.id === next.id ? next : a)) : [...list, next]
    })
    setDraft(null)
  }
  const removeAlarm = (id) => {
    setAlarms((list) => list.filter((a) => a.id !== id))
    setDraft(null)
  }
  const toggleEnabled = (id) =>
    setAlarms((list) => list.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)))

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Alarms" subtitle="Gentle chime + reminder for any day of the week">
        <Button onClick={() => setDraft(newAlarm())}>
          <span className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5" /> Add Alarm
          </span>
        </Button>
      </PageHeader>

      {sorted.length === 0 ? (
        <Card className="text-sm text-gray-500">
          No alarms yet. Tap “Add Alarm” to set one — give it a name, a time, an icon, and the days
          it should repeat.
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => {
            const Icon = ALARM_ICONS[a.icon] || ALARM_ICONS.bell
            const off = a.enabled === false
            return (
              <Card key={a.id} className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setDraft({ ...a })}
                  className="flex min-w-0 flex-1 items-center gap-4 text-left active:opacity-70"
                >
                  <span
                    className={[
                      'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl',
                      off ? 'bg-white/5 text-gray-600' : 'bg-accent/15 text-accent',
                    ].join(' ')}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={[
                          'font-mono text-2xl font-bold',
                          off ? 'text-gray-500' : 'text-white',
                        ].join(' ')}
                      >
                        {fmt12(a.time)}
                      </span>
                      <span className="truncate text-base text-gray-300">{a.name}</span>
                    </div>
                    <div className="text-xs text-gray-500">{daysSummary(a.days)}</div>
                  </div>
                </button>
                <Toggle
                  checked={!off}
                  label={`Enable ${a.name}`}
                  onChange={() => toggleEnabled(a.id)}
                />
                <button
                  type="button"
                  onClick={() => removeAlarm(a.id)}
                  aria-label={`Delete ${a.name}`}
                  className="rounded-lg bg-loss/15 p-2.5 text-loss active:scale-95"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <AlarmModal
        draft={draft}
        setDraft={setDraft}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
        onDelete={() => removeAlarm(draft.id)}
        isExisting={draft && alarms.some((a) => a.id === draft.id)}
      />
    </div>
  )
}

const PRESETS = [
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Weekends', days: [0, 6] },
]

function AlarmModal({ draft, setDraft, onClose, onSave, onDelete, isExisting }) {
  if (!draft) return null
  const set = (patch) => setDraft({ ...draft, ...patch })
  const toggleDay = (d) =>
    set({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d] })
  const sameDays = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={isExisting ? 'Edit Alarm' : 'New Alarm'}
      footer={
        <>
          {isExisting && (
            <Button variant="danger" onClick={onDelete}>
              <TrashIcon className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Name</label>
            <input
              autoFocus
              className={fieldClass}
              placeholder="e.g. Wake up, Take meds"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Time</label>
            <input
              type="time"
              className={fieldClass}
              value={draft.time}
              onChange={(e) => set({ time: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs text-gray-500">Icon</label>
            <div className="flex flex-wrap gap-2">
              {ALARM_ICON_NAMES.map((name) => {
                const Icon = ALARM_ICONS[name]
                const on = draft.icon === name
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => set({ icon: name })}
                    aria-label={`Icon ${name}`}
                    className={[
                      'flex h-11 w-11 items-center justify-center rounded-xl active:scale-90',
                      on ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
                    ].join(' ')}
                    style={on ? { outline: '2px solid rgb(var(--c-accent))' } : undefined}
                  >
                    <Icon className="h-6 w-6" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs text-gray-500">Repeat</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {DAYS.map((label, d) => {
              const on = draft.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={[
                    'h-11 w-11 rounded-full text-sm font-semibold active:scale-90',
                    on ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
                  ].join(' ')}
                  style={on ? { outline: '2px solid rgb(var(--c-accent))' } : undefined}
                >
                  {label[0]}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ days: p.days })}
                className={[
                  'rounded-xl px-3 py-2 text-xs font-semibold active:scale-95',
                  sameDays(draft.days, p.days) ? 'bg-accent/15 text-accent' : 'bg-white/5 text-gray-400',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">{daysSummary(draft.days)}</p>
        </div>
      </div>
    </Modal>
  )
}
