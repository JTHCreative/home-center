import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'

const PREFIX = 'home-center:'

// Firestore collection holding one document per state key. Each document stores
// the value as a JSON string so we don't trip over Firestore's type rules
// (undefined fields, nested arrays, etc.) — the app's shapes vary a lot.
const COLLECTION = 'appState'

/** Read a JSON value from the localStorage cache, falling back to `fallback`. */
export function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Write a JSON value to the localStorage cache. */
export function writeStored(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or disabled — ignore so the UI keeps working */
  }
}

function pushToFirestore(key, value) {
  // Fire-and-forget; offline writes are queued by Firestore and flushed later.
  setDoc(doc(db, COLLECTION, key), { json: JSON.stringify(value) }).catch(() => {
    /* offline / permission error — the localStorage cache still has it */
  })
}

/**
 * useLocalState — like useState, but persisted globally in Firestore and mirrored
 * to a localStorage cache so the UI renders instantly and survives offline.
 *
 * Data is shared across every browser/device pointed at the same Firestore
 * project, and remote changes stream in live via onSnapshot.
 *
 * An optional `migrate` function runs on stored values (cache or remote) so a
 * page can upgrade an older saved shape before it hits state.
 */
export function useLocalState(key, initial, migrate) {
  const apply = useCallback((raw) => (migrate ? migrate(raw) : raw), [migrate])

  const [value, setValueState] = useState(() => apply(readStored(key, initial)))
  const valueRef = useRef(value)
  valueRef.current = value

  // Subscribe to the shared document; remote changes (incl. our own writes)
  // update local state and refresh the cache. We never write back from here, so
  // there's no echo loop.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, COLLECTION, key), (snap) => {
      const data = snap.data()
      if (!snap.exists() || data?.json == null) return
      try {
        const next = apply(JSON.parse(data.json))
        valueRef.current = next
        writeStored(key, next)
        setValueState(next)
      } catch {
        /* malformed remote value — keep what we have */
      }
    })
    return unsub
  }, [key, apply])

  // Stable setter that also accepts an updater function. Writes through to the
  // cache immediately and pushes to Firestore for every other client.
  const set = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? next(valueRef.current) : next
      valueRef.current = resolved
      setValueState(resolved)
      writeStored(key, resolved)
      pushToFirestore(key, resolved)
    },
    [key],
  )

  return [value, set]
}
