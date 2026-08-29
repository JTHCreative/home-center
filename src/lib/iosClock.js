import { useEffect, useState } from 'react'
import { readStored, writeStored } from './storage.js'
import { DAYS, daysSummary, fmt12 } from './alarms.js'

// Handing an alarm to the iPad's own Clock app.
//
// Neither a web page nor a native third-party app can write to iOS alarms — the
// Clock app's alarm store is private, and EventKit only covers calendars and
// reminders. The Shortcuts app *can* create one, and a shortcut can be launched
// from a link, so Home Center passes the alarm to a small user-built shortcut
// and lets it do the part only Apple's software can. The payoff is a real
// system alarm: it lights a sleeping screen, rings through the mute switch, and
// ignores Focus modes — none of which a web page can do.

const NAME_KEY = 'ipad-clock-shortcut' // device-local: names one iPad's shortcut
export const DEFAULT_SHORTCUT_NAME = 'Home Center Alarm'

/** iPhone/iPad (including iPadOS asking for desktop sites, which reports Mac). */
export function isAppleTouchDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return /Mac/.test(ua) && (navigator.maxTouchPoints || 0) > 1
}

/**
 * The text handed to the shortcut as its input. JSON so "Get Dictionary from
 * Input" can pull out fields, with the pieces Shortcuts is clumsy at deriving
 * (12-hour time, day names) pre-computed.
 */
export function alarmPayload(alarm) {
  const [h, m] = String(alarm?.time || '').split(':').map(Number)
  const days = [...(alarm?.days || [])].sort((a, b) => a - b)
  return JSON.stringify({
    time: alarm?.time || '',
    time12: fmt12(alarm?.time),
    hour: Number.isFinite(h) ? h : 0,
    minute: Number.isFinite(m) ? m : 0,
    label: alarm?.name || 'Alarm',
    days: days.map((d) => DAYS[d]),
    repeat: daysSummary(days),
    repeats: days.length > 0,
  })
}

/** `shortcuts://` URL that runs the named shortcut with the alarm as input. */
export function shortcutUrl(name, alarm) {
  const target = (name || DEFAULT_SHORTCUT_NAME).trim() || DEFAULT_SHORTCUT_NAME
  const params = new URLSearchParams({
    name: target,
    input: 'text',
    text: alarmPayload(alarm),
  })
  return `shortcuts://run-shortcut?${params.toString()}`
}

// The shortcut's name has to match what the user called it on this iPad, so
// it's device-local and editable from the Alarms page.
export function useShortcutName() {
  const [name, setName] = useState(() => {
    const saved = readStored(NAME_KEY, '')
    return typeof saved === 'string' && saved ? saved : DEFAULT_SHORTCUT_NAME
  })
  useEffect(() => {
    writeStored(NAME_KEY, name)
  }, [name])
  return [name, setName]
}
