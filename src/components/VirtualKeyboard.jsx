import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloseIcon,
  KeyboardIcon,
} from './Icons.jsx'

// On-screen keyboard for the touchscreen kiosk. Mounted once (in App). It tracks
// the focused input/textarea and writes through the native value setter so React
// controlled components still fire onChange.

const TEXT_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password']

// When true, the keyboard only appears for touch/pen input (so a mouse +
// physical keyboard isn't interrupted). Temporarily false to allow testing the
// keyboard with a mouse on a non-touch machine.
const TOUCH_ONLY = false

// Which keyboard (if any) a focused element should get.
function classify(el) {
  if (!el || el.disabled || el.readOnly) return null
  if (el.tagName === 'TEXTAREA') return 'text'
  if (el.tagName !== 'INPUT') return null
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  if (type === 'number') return 'numeric'
  if (type === 'tel') return 'numeric'
  if (TEXT_TYPES.includes(type)) {
    const im = (el.inputMode || '').toLowerCase()
    return im === 'numeric' || im === 'decimal' ? 'numeric' : 'text'
  }
  return null // date, time, range, checkbox, etc. — use native UI
}

// Set a value on a controlled input/textarea and notify React.
function setNativeValue(el, value) {
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function insertText(el, text) {
  if (el.type === 'number') {
    setNativeValue(el, el.value + text) // number inputs don't support selection
    return
  }
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end))
  const pos = start + text.length
  try {
    el.setSelectionRange(pos, pos)
  } catch {
    /* some input types disallow selection ranges */
  }
}

function backspace(el) {
  if (el.type === 'number') {
    setNativeValue(el, el.value.slice(0, -1))
    return
  }
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  if (start === 0 && start === end) return
  const from = start === end ? start - 1 : start
  setNativeValue(el, el.value.slice(0, from) + el.value.slice(end))
  try {
    el.setSelectionRange(from, from)
  } catch {
    /* ignore */
  }
}

function step(el, dir) {
  try {
    if (dir > 0) el.stepUp()
    else el.stepDown()
    el.dispatchEvent(new Event('input', { bubbles: true }))
  } catch {
    /* ignore non-steppable inputs */
  }
}

// --- Word prediction ---------------------------------------------------------
// A small base vocabulary, augmented by whatever the user has already typed
// across the app (recipes, goals, events…) so suggestions get more relevant
// over time. No network/dictionary file needed.
const BASE_WORDS =
  `the and for with you your this that have from they will what when your
   today tomorrow morning night week month water milk eggs flour sugar butter
   chicken onion garlic pepper salt olive cheese bread rice pasta tomato lemon
   honey breakfast lunch dinner recipe grocery clean laundry workout water
   meeting call email doctor dentist birthday family budget savings invest
   review plan finish start buy pay read write practice stretch meditate`
    .split(/\s+/)
    .filter(Boolean)

function buildDictionary() {
  const freq = new Map()
  const add = (w) => {
    const k = w.toLowerCase()
    if (k.length > 1) freq.set(k, (freq.get(k) || 0) + 1)
  }
  BASE_WORDS.forEach(add)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('home-center:')) continue
      const words = (localStorage.getItem(key) || '').match(/[A-Za-z']{2,}/g) || []
      // Weight user words above the base vocabulary.
      words.forEach((w) => {
        add(w)
        add(w)
      })
    }
  } catch {
    /* localStorage unavailable */
  }
  return freq
}

// The partial word immediately before the caret.
function currentWord(el) {
  if (el.type === 'number') return ''
  const pos = el.selectionStart ?? el.value.length
  const m = el.value.slice(0, pos).match(/[A-Za-z']+$/)
  return m ? m[0] : ''
}

function replaceWord(el, word) {
  const pos = el.selectionStart ?? el.value.length
  const before = el.value.slice(0, pos)
  const m = before.match(/[A-Za-z']+$/)
  const start = m ? pos - m[0].length : pos
  const insert = word + ' '
  setNativeValue(el, el.value.slice(0, start) + insert + el.value.slice(pos))
  const caret = start + insert.length
  try {
    el.setSelectionRange(caret, caret)
  } catch {
    /* ignore */
  }
}

function predict(dict, word, n = 3) {
  if (!dict || word.length < 1) return []
  const lw = word.toLowerCase()
  const cap = word[0] !== word[0].toLowerCase()
  const matches = []
  for (const [w, f] of dict) {
    if (w !== lw && w.startsWith(lw)) matches.push([w, f])
  }
  matches.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
  return matches.slice(0, n).map(([w]) => (cap ? w[0].toUpperCase() + w.slice(1) : w))
}

const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]
const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

// Sets the global --kb variable (px) that pages/modals use to reserve space so
// the keyboard never covers the focused field. 0 when hidden/collapsed.
function setKbHeight(px) {
  document.documentElement.style.setProperty('--kb', `${px}px`)
}

export default function VirtualKeyboard() {
  const [target, setTarget] = useState(null)
  const [shift, setShift] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const panelRef = useRef(null)
  const dictRef = useRef(null)

  useEffect(() => {
    // Only raise the keyboard when the field was reached by touch (or pen), so a
    // mouse + physical keyboard on a mini PC isn't interrupted by it.
    let touchInput = false
    const onPointerDown = (e) => {
      touchInput = e.pointerType === 'touch' || e.pointerType === 'pen'
    }
    const onFocusIn = (e) => {
      if (TOUCH_ONLY && !touchInput) return setTarget(null)
      const next = classify(e.target) ? e.target : null
      setTarget(next)
      if (next) setCollapsed(false) // re-show on each new field
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  const mode = classify(target)
  const open = !!target && !!mode && !collapsed

  // Publish the keyboard height for keyboard-avoidance, and scroll the focused
  // field into the remaining space. Reset to 0 whenever it's not open.
  useLayoutEffect(() => {
    if (!open) {
      setKbHeight(0)
      return
    }
    const update = () => setKbHeight(panelRef.current?.offsetHeight ?? 0)
    update()
    const ro = new ResizeObserver(update)
    if (panelRef.current) ro.observe(panelRef.current)
    const id = setTimeout(() => {
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
    return () => {
      ro.disconnect()
      clearTimeout(id)
    }
  }, [open, mode, target])

  useEffect(() => () => setKbHeight(0), [])

  // Rebuild the prediction dictionary (and seed suggestions) when a text field
  // opens, so it includes the latest data the user has entered.
  useEffect(() => {
    if (!open || mode !== 'text') {
      setSuggestions([])
      return
    }
    dictRef.current = buildDictionary()
    setSuggestions(predict(dictRef.current, currentWord(target)))
  }, [open, mode, target])

  if (!target || !mode) return null

  const refresh = () => setSuggestions(predict(dictRef.current, currentWord(target)))

  // Keep the field focused; act on the stored element, then refresh predictions.
  const act = (fn) => {
    fn(target)
    target.focus()
    refresh()
  }
  const type = (ch) => act((el) => insertText(el, ch))
  const applySuggestion = (w) => act((el) => replaceWord(el, w))
  const close = () => {
    target.blur()
    setTarget(null)
  }

  // Collapsed: just a floating "show keyboard" pill.
  if (!open) {
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-bg shadow-glow active:scale-95"
      >
        <KeyboardIcon className="h-6 w-6" />
        <ChevronUp className="h-5 w-5" />
      </button>
    )
  }

  return (
    // Prevent mousedown from blurring the active field when tapping keys.
    <div
      ref={panelRef}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-surface/95 px-3 pb-3 backdrop-blur"
    >
      {/* Hide handle */}
      <div className="flex justify-center py-1">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide keyboard"
          className="flex items-center gap-2 rounded-full bg-white/5 px-6 py-1.5 text-sm font-medium text-gray-400 active:scale-95"
        >
          <ChevronDown className="h-5 w-5" /> Hide
        </button>
      </div>

      {/* Word predictions (text fields only) */}
      {mode === 'text' && suggestions.length > 0 && (
        <div className="mx-auto mb-2 flex max-w-4xl gap-2">
          {suggestions.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => applySuggestion(w)}
              className="flex-1 truncate rounded-lg bg-accent/15 px-4 py-2.5 text-base font-semibold text-accent active:scale-95"
            >
              {w}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto max-w-4xl">
        {mode === 'numeric' ? (
          <NumericPad
            onKey={type}
            onBackspace={() => act(backspace)}
            onStep={(d) => act((el) => step(el, d))}
            onDone={close}
          />
        ) : (
          <TextPad
            shift={shift}
            onShift={() => setShift((s) => !s)}
            onKey={(ch) => {
              type(shift ? ch.toUpperCase() : ch)
            }}
            onBackspace={() => act(backspace)}
            onSpace={() => type(' ')}
            onEnter={() => (target.tagName === 'TEXTAREA' ? type('\n') : close())}
            onDone={close}
          />
        )}
      </div>
    </div>
  )
}

const keyClass =
  'flex h-14 items-center justify-center rounded-xl bg-bg text-xl font-medium text-white active:scale-95 active:bg-accent/20 select-none'

function Key({ label, onClick, className = '', flex = 1 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ flex }}
      className={`${keyClass} ${className}`}
    >
      {label}
    </button>
  )
}

function TextPad({ shift, onShift, onKey, onBackspace, onSpace, onEnter, onDone }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {NUMBER_ROW.map((k) => (
          <Key key={k} label={k} onClick={() => onKey(k)} />
        ))}
      </div>
      <div className="flex gap-1.5">
        {LETTER_ROWS[0].map((k) => (
          <Key key={k} label={shift ? k.toUpperCase() : k} onClick={() => onKey(k)} />
        ))}
      </div>
      <div className="flex gap-1.5 px-7">
        {LETTER_ROWS[1].map((k) => (
          <Key key={k} label={shift ? k.toUpperCase() : k} onClick={() => onKey(k)} />
        ))}
      </div>
      <div className="flex gap-1.5">
        <Key
          label="⇧"
          onClick={onShift}
          flex={1.5}
          className={shift ? '!bg-accent/30 text-accent shadow-glow' : ''}
        />
        {LETTER_ROWS[2].map((k) => (
          <Key key={k} label={shift ? k.toUpperCase() : k} onClick={() => onKey(k)} />
        ))}
        <Key label="⌫" onClick={onBackspace} flex={1.5} />
      </div>
      <div className="flex gap-1.5">
        <Key label="," onClick={() => onKey(',')} />
        <Key label="space" onClick={onSpace} flex={5} />
        <Key label="." onClick={() => onKey('.')} />
        <Key label="↵" onClick={onEnter} flex={1.5} />
        <Key label="Done" onClick={onDone} flex={2} className="!bg-accent !text-bg font-semibold" />
      </div>
    </div>
  )
}

function NumericPad({ onKey, onBackspace, onStep, onDone }) {
  const pad = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0']
  return (
    // Keypad and controls side by side to use the width and keep the height low.
    <div className="flex gap-3">
      <div className="grid flex-1 grid-cols-3 gap-2">
        {pad.map((k) => (
          <Key key={k} label={k} onClick={() => onKey(k)} className="!h-14 !text-2xl" />
        ))}
        <Key label="⌫" onClick={onBackspace} className="!h-14 !text-2xl" />
      </div>

      {/* Right column: large steppers + Done, filling the keypad height. */}
      <div className="flex w-2/5 flex-col gap-2">
        <div className="flex flex-1 gap-2">
          <button
            type="button"
            onClick={() => onStep(-1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent/15 text-2xl font-bold text-accent active:scale-95"
          >
            <ChevronLeft className="h-7 w-7" /> −1
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent/15 text-2xl font-bold text-accent active:scale-95"
          >
            +1 <ChevronRight className="h-7 w-7" />
          </button>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-bg active:scale-95"
        >
          <CloseIcon className="h-5 w-5" /> Done
        </button>
      </div>
    </div>
  )
}
