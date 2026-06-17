import { useEffect, useRef, useState } from 'react'
import { useLocalState } from '../lib/storage.js'
import { startAlarm, stopAlarm } from '../lib/soundscapes.js'
import { ALARM_ICONS, fmt12 } from '../lib/alarms.js'
import { Button } from './Modal.jsx'

const pad = (n) => String(n).padStart(2, '0')
const SNOOZE_MS = 5 * 60 * 1000

// App-wide alarm engine: watches the clock, rings matching alarms with a chime,
// and shows a dismiss/snooze popup over everything. Mounted once in App.
export default function AlarmManager() {
  const [alarms] = useLocalState('alarms', [])
  const [ringing, setRinging] = useState([]) // [{ key, alarmId, name, time, icon }]

  // Refs so the 1s interval always sees the latest data without re-subscribing.
  const alarmsRef = useRef(alarms)
  alarmsRef.current = alarms
  const firedRef = useRef(new Set()) // minute keys already fired (dedupe)
  const snoozesRef = useRef([]) // [{ alarmId, snapshot, fireAt }]

  useEffect(() => {
    const fire = (a, key) => {
      if (!a) return
      setRinging((r) =>
        r.some((x) => x.key === key)
          ? r
          : [...r, { key, alarmId: a.id, name: a.name || 'Alarm', time: a.time, icon: a.icon }],
      )
      startAlarm()
    }

    const id = setInterval(() => {
      const now = new Date()
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
      const day = now.getDay()
      const minuteKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${hhmm}`

      for (const a of alarmsRef.current || []) {
        if (!a || a.enabled === false) continue
        if (!Array.isArray(a.days) || !a.days.includes(day)) continue
        if (a.time !== hhmm) continue
        const key = `${a.id}@${minuteKey}`
        if (firedRef.current.has(key)) continue
        firedRef.current.add(key)
        fire(a, key)
      }

      if (snoozesRef.current.length) {
        const nowMs = Date.now()
        const due = snoozesRef.current.filter((s) => s.fireAt <= nowMs)
        if (due.length) {
          snoozesRef.current = snoozesRef.current.filter((s) => s.fireAt > nowMs)
          for (const s of due) {
            const a = (alarmsRef.current || []).find((x) => x.id === s.alarmId) || s.snapshot
            fire(a, `${s.alarmId}@snooze-${s.fireAt}`)
          }
        }
      }
    }, 1000)
    return () => {
      clearInterval(id)
      stopAlarm()
    }
  }, [])

  const dismiss = (key) =>
    setRinging((r) => {
      const next = r.filter((x) => x.key !== key)
      if (next.length === 0) stopAlarm()
      return next
    })

  const snooze = (item) => {
    snoozesRef.current.push({
      alarmId: item.alarmId,
      snapshot: { id: item.alarmId, name: item.name, time: item.time, icon: item.icon },
      fireAt: Date.now() + SNOOZE_MS,
    })
    dismiss(item.key)
  }

  if (ringing.length === 0) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        {ringing.map((item) => {
          const Icon = ALARM_ICONS[item.icon] || ALARM_ICONS.bell
          return (
            <div
              key={item.key}
              className="rounded-3xl border border-border bg-surface p-8 text-center shadow-glow"
            >
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Icon className="h-10 w-10 animate-pulse" />
              </div>
              <div className="font-mono text-5xl font-bold text-white">{fmt12(item.time)}</div>
              <div className="mt-2 text-lg text-gray-300">{item.name}</div>
              <div className="mt-6 flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => snooze(item)}>
                  Snooze 5 min
                </Button>
                <Button className="flex-1" onClick={() => dismiss(item.key)}>
                  Turn off
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
