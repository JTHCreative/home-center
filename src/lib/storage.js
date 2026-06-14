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
 */
export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => readStored(key, initial))

  useEffect(() => {
    writeStored(key, value)
  }, [key, value])

  // Stable setter that also accepts an updater function.
  const set = useCallback((next) => {
    setValue((prev) => (typeof next === 'function' ? next(prev) : next))
  }, [])

  return [value, set]
}
