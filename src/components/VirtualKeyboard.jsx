import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CloseIcon } from './Icons.jsx'

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

const LETTER_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]
const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

export default function VirtualKeyboard() {
  const [target, setTarget] = useState(null)
  const [shift, setShift] = useState(false)

  useEffect(() => {
    // Only raise the keyboard when the field was reached by touch (or pen), so a
    // mouse + physical keyboard on a mini PC isn't interrupted by it.
    let touchInput = false
    const onPointerDown = (e) => {
      touchInput = e.pointerType === 'touch' || e.pointerType === 'pen'
    }
    const onFocusIn = (e) => {
      if (TOUCH_ONLY && !touchInput) return setTarget(null)
      setTarget(classify(e.target) ? e.target : null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])

  const mode = classify(target)
  if (!target || !mode) return null

  // Keep the field focused; act on the stored element.
  const act = (fn) => {
    fn(target)
    target.focus()
  }
  const type = (ch) => act((el) => insertText(el, ch))
  const close = () => {
    target.blur()
    setTarget(null)
  }

  return (
    // Prevent mousedown from blurring the active field when tapping keys.
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-surface/95 p-3 backdrop-blur"
    >
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
    <div className="mx-auto max-w-xl space-y-3">
      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {pad.map((k) => (
          <Key key={k} label={k} onClick={() => onKey(k)} className="!h-14 !text-2xl" />
        ))}
        <Key label="⌫" onClick={onBackspace} className="!h-14 !text-2xl" />
      </div>

      {/* Big left/right steppers */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="flex h-16 flex-1 items-center justify-center gap-2 rounded-xl bg-accent/15 text-2xl font-bold text-accent active:scale-95"
        >
          <ChevronLeft className="h-8 w-8" /> −1
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          className="flex h-16 flex-1 items-center justify-center gap-2 rounded-xl bg-accent/15 text-2xl font-bold text-accent active:scale-95"
        >
          +1 <ChevronRight className="h-8 w-8" />
        </button>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-bg active:scale-95"
      >
        <CloseIcon className="h-5 w-5" /> Done
      </button>
    </div>
  )
}
