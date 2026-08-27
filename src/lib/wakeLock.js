import { useEffect, useState } from 'react'
import { readStored, writeStored } from './storage.js'

// Screen Wake Lock — keeps the display (iPad, tablet, kiosk monitor) from
// dimming and auto-locking while Home Center is open, so alarms ring on a lit
// screen instead of into a sleeping device.
//
// A web page can't power a sleeping device back on — there is no API for it on
// iPadOS or anywhere else. The only thing that actually works is stopping it
// from falling asleep in the first place, which is what this does. If the
// screen does go off anyway (manual lock, another app in the foreground),
// AlarmManager catches up and rings the moment the page is visible again.
//
// Safari 16.4+ (iPadOS 16.4+) and Chromium support `navigator.wakeLock`. The
// lock is only grantable while the page is visible, and the browser drops it
// whenever the page is hidden — so we re-request on every visibility change and
// on the next touch.

const PREF_KEY = 'alarm-keep-awake' // device-local: it's a per-screen setting

export const wakeLockSupported =
  typeof navigator !== 'undefined' && 'wakeLock' in navigator

let sentinel = null // the active WakeLockSentinel, if any
let acquiring = false // a request is in flight (don't start a second one)
let wanted = false // does the app currently want the screen kept awake?
// 'unsupported' | 'off' | 'active' | 'blocked' (wanted, but the browser said no
// — usually because the page is in the background)
let status = wakeLockSupported ? 'off' : 'unsupported'
const statusListeners = new Set()
let listening = false

function setStatus(next) {
  if (status === next) return
  status = next
  statusListeners.forEach((fn) => {
    try {
      fn(status)
    } catch {
      /* a bad listener shouldn't break the rest */
    }
  })
}

async function acquire() {
  if (!wakeLockSupported || !wanted || sentinel || acquiring) return
  if (document.visibilityState !== 'visible') {
    setStatus('blocked')
    return
  }
  acquiring = true
  try {
    const lock = await navigator.wakeLock.request('screen')
    // The request is async, so re-check: we may have been switched off (or
    // already hold a lock) while it was in flight.
    if (!wanted || sentinel) {
      lock.release().catch(() => {})
      return
    }
    sentinel = lock
    lock.addEventListener('release', () => {
      if (sentinel !== lock) return
      sentinel = null
      // The browser released it (page hidden / screen locked). Keep the intent
      // so the visibility + touch handlers below can take it back.
      setStatus(wanted ? 'blocked' : 'off')
    })
    setStatus('active')
  } catch {
    // Safari rejects when the page isn't visible or lacks recent activation.
    sentinel = null
    setStatus('blocked')
  } finally {
    acquiring = false
  }
}

function releaseLock() {
  const lock = sentinel
  sentinel = null
  setStatus('off')
  if (lock) lock.release().catch(() => {})
}

function startListening() {
  if (listening || !wakeLockSupported) return
  listening = true
  const retry = () => {
    if (wanted && !sentinel) acquire()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retry()
    else if (wanted) setStatus('blocked')
  })
  // Safari can refuse a lock requested without recent user activation; the next
  // tap on the dashboard is a free chance to get it back.
  window.addEventListener('pointerdown', retry)
  window.addEventListener('focus', retry)
}

/** Turn the screen wake lock on or off (idempotent). */
export function setKeepAwake(on) {
  wanted = !!on
  if (!wakeLockSupported) return
  startListening()
  if (wanted) acquire()
  else releaseLock()
}

export function wakeLockStatus() {
  return status
}

export function subscribeWakeLock(fn) {
  statusListeners.add(fn)
  fn(status)
  return () => statusListeners.delete(fn)
}

/** Read the stored preference (device-local, on by default). */
export function keepAwakePref() {
  return readStored(PREF_KEY, true) !== false
}

// The Alarms page toggles the preference and the app-wide AlarmManager applies
// it, so both need to hear about changes on this device.
const prefListeners = new Set()

export function setKeepAwakePref(on) {
  writeStored(PREF_KEY, !!on)
  prefListeners.forEach((fn) => {
    try {
      fn(!!on)
    } catch {
      /* ignore */
    }
  })
}

/**
 * useKeepAwake — the "keep this screen awake" preference plus the live lock
 * status. Reading it is free; only the AlarmManager (`apply`) drives the lock.
 */
export function useKeepAwake(apply = false) {
  const [on, setOn] = useState(keepAwakePref)
  const [lockStatus, setLockStatus] = useState(wakeLockStatus)

  useEffect(() => {
    prefListeners.add(setOn)
    return () => prefListeners.delete(setOn)
  }, [])
  useEffect(() => subscribeWakeLock(setLockStatus), [])
  useEffect(() => {
    if (!apply) return undefined
    setKeepAwake(on)
    return () => setKeepAwake(false)
  }, [apply, on])

  return { on, setOn: setKeepAwakePref, status: lockStatus, supported: wakeLockSupported }
}
