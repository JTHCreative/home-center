import { useEffect, useRef, useState } from 'react'
import { readStored, useLocalState, writeStored } from '../lib/storage.js'
import { primeAudio, resumeAudio, startAlarm, stopAlarm } from '../lib/soundscapes.js'
import { useKeepAwake } from '../lib/wakeLock.js'
import { ALARM_ICONS, fmt12 } from '../lib/alarms.js'
import { Button } from './Modal.jsx'

const pad = (n) => String(n).padStart(2, '0')
const SNOOZE_MS = 5 * 60 * 1000
const MINUTE_MS = 60 * 1000
// How far back to look for alarms we slept through. Long enough to cover an
// overnight sleep, short enough that a screen left off for days doesn't ring
// yesterday's alarms when it comes back.
const CATCH_UP_MS = 12 * 60 * 60 * 1000

// Device-local clock bookmark, so an alarm missed while the tab was discarded
// (iOS drops background tabs and reloads them) still rings on the next load.
const LAST_CHECK_KEY = 'alarm-last-check'
const BOOKMARK_EVERY_MS = 30 * 1000

const minuteStart = (ms) => Math.floor(ms / MINUTE_MS) * MINUTE_MS

// App-wide alarm engine: watches the clock, rings matching alarms with a chime,
// and shows a dismiss/snooze popup over everything. Mounted once in App.
//
// Sleeping screens: while "keep this screen awake" is on (Alarms page) the
// device is held awake so alarms ring on time. A page can't power a sleeping
// iPad back on, so if the screen does go off — manual lock, another app in the
// foreground, the setting turned off — timers freeze and alarms are missed.
// When the page becomes visible again we replay the minutes we slept through
// and ring anything scheduled in them, flagged as late.
export default function AlarmManager() {
  const [alarms] = useLocalState('alarms', [])
  const [ringing, setRinging] = useState([]) // [{ key, alarmId, name, time, icon, late }]
  // Applies the device's "keep this screen awake" preference for the whole app.
  useKeepAwake(true)

  // Refs so the 1s interval always sees the latest data without re-subscribing.
  const alarmsRef = useRef(alarms)
  alarmsRef.current = alarms
  const firedRef = useRef(new Set()) // minute keys already fired (dedupe)
  const snoozesRef = useRef([]) // [{ alarmId, snapshot, fireAt }]
  const lastCheckRef = useRef(0)
  if (!lastCheckRef.current) {
    const saved = readStored(LAST_CHECK_KEY, 0)
    lastCheckRef.current = Number.isFinite(saved) && saved > 0 ? saved : Date.now()
  }
  const savedAtRef = useRef(0)

  useEffect(() => {
    const fire = (a, key, late) => {
      if (!a) return
      setRinging((r) =>
        r.some((x) => x.key === key)
          ? r
          : [
              ...r,
              { key, alarmId: a.id, name: a.name || 'Alarm', time: a.time, icon: a.icon, late },
            ],
      )
      startAlarm()
    }

    // Ring every enabled alarm scheduled for the given minute (once each).
    const fireMinute = (ms, late) => {
      const d = new Date(ms)
      const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      const day = d.getDay()
      const minuteKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`

      for (const a of alarmsRef.current || []) {
        if (!a || a.enabled === false) continue
        if (!Array.isArray(a.days) || !a.days.includes(day)) continue
        if (a.time !== hhmm) continue
        const key = `${a.id}@${minuteKey}`
        if (firedRef.current.has(key)) continue
        firedRef.current.add(key)
        fire(a, key, late)
      }
    }

    const check = () => {
      const nowMs = Date.now()
      const since = lastCheckRef.current
      lastCheckRef.current = nowMs
      // Persist the bookmark occasionally (not every tick — it's a disk write).
      if (nowMs - savedAtRef.current > BOOKMARK_EVERY_MS) {
        savedAtRef.current = nowMs
        writeStored(LAST_CHECK_KEY, nowMs)
      }

      // Usually this is just the current minute. After a sleep (or a suspended
      // background tab) it walks every minute we missed, so the alarm rings the
      // moment the screen comes back instead of being skipped entirely.
      const current = minuteStart(nowMs)
      const from = minuteStart(Math.max(since, nowMs - CATCH_UP_MS))
      for (let t = from; t <= current; t += MINUTE_MS) fireMinute(t, t < current)

      if (snoozesRef.current.length) {
        const due = snoozesRef.current.filter((s) => s.fireAt <= nowMs)
        if (due.length) {
          snoozesRef.current = snoozesRef.current.filter((s) => s.fireAt > nowMs)
          for (const s of due) {
            const a = (alarmsRef.current || []).find((x) => x.id === s.alarmId) || s.snapshot
            fire(a, `${s.alarmId}@snooze-${s.fireAt}`, s.fireAt < nowMs - MINUTE_MS)
          }
        }
      }
    }

    const id = setInterval(check, 1000)

    // Coming back from a sleeping/locked screen: catch up immediately rather
    // than waiting on the interval, and un-suspend the audio so it's audible.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      resumeAudio()
      check()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Save the bookmark before the tab is frozen or discarded.
    const bookmark = () => writeStored(LAST_CHECK_KEY, Date.now())
    window.addEventListener('pagehide', bookmark)
    // Unlock audio on the first touch so an alarm hours later can make noise.
    window.addEventListener('pointerdown', primeAudio, { once: true })

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', bookmark)
      window.removeEventListener('pointerdown', primeAudio)
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
              {item.late && (
                <div className="mt-2 text-xs text-gray-500">
                  Missed while the screen was off
                </div>
              )}
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
