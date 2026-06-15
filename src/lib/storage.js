import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'home-center:'

/** Read a JSON value from localStorage, falling back to `fallback`. */
export function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Write a JSON value to localStorage. */
export function writeStored(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or disabled — ignore so the UI keeps working */
  }
}

/**
 * useLocalState — like useState, but persisted to localStorage under `key`.
 * Survives reboots, which is the whole point on a kiosk Pi.
 *
 * An optional `migrate` function runs on the initial stored value, letting a
 * page upgrade an older saved shape before it ever hits state.
 */
export function useLocalState(key, initial, migrate) {
  const [value, setValue] = useState(() => {
    const stored = readStored(key, initial)
    return migrate ? migrate(stored) : stored
  })

  useEffect(() => {
    writeStored(key, value)
  }, [key, value])

  // Stable setter that also accepts an updater function.
  const set = useCallback((next) => {
    setValue((prev) => (typeof next === 'function' ? next(prev) : next))
  }, [])

  return [value, set]
}
