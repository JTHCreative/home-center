import { HoverTip } from './NoteHint.jsx'
import { PRIORITY_LEVELS, PRIORITY_NAMES, effectivePriority } from '../lib/goalItems.js'

// Low = one green chevron, medium = two yellow, high = three red (stacked).
const PRIORITY_COLORS = ['', '#39D353', '#E3B341', '#F85149']
const LABELS = ['No priority', 'Low priority', 'Medium priority', 'High priority']

// Stacked "^" chevrons, one per level.
export function PriorityIcon({ level, className = 'h-4 w-3' }) {
  if (!level) return null
  // Chevrons 4 units apart, centered vertically in a 12×16 box.
  const top = 8 - (level * 4) / 2 - 1
  return (
    <svg
      viewBox="0 0 12 16"
      className={className}
      fill="none"
      stroke={PRIORITY_COLORS[level]}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {Array.from({ length: level }, (_, i) => (
        <path key={i} d={`M2 ${top + i * 4 + 4}L6 ${top + i * 4}L10 ${top + i * 4 + 4}`} />
      ))}
    </svg>
  )
}

// A goal or sub-item's priority as shown in lists: its own, or the highest
// set on anything beneath it. Hover (or press and hold) for the name.
export function PriorityMark({ node, className = '' }) {
  const { level, inherited } = effectivePriority(node)
  if (!level) return null
  const label = `${LABELS[level]}${inherited ? ' (from a sub-item)' : ''}`
  return (
    <HoverTip tip={label} label={label} blockClick className={`align-middle ${className}`}>
      <PriorityIcon level={level} />
    </HoverTip>
  )
}

// Segmented None / Low / Medium / High picker for the goal editor.
export function PriorityPicker({ value, onChange }) {
  const current = PRIORITY_LEVELS[value] || 0
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3].map((lvl) => (
        <button
          key={lvl}
          type="button"
          onClick={() => onChange(PRIORITY_NAMES[lvl] || undefined)}
          aria-pressed={current === lvl}
          aria-label={LABELS[lvl]}
          className={[
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold active:scale-95',
            current === lvl ? 'bg-accent/15 text-white shadow-glow' : 'bg-white/5 text-gray-400',
          ].join(' ')}
        >
          {lvl ? <PriorityIcon level={lvl} /> : null}
          {['None', 'Low', 'Med', 'High'][lvl]}
        </button>
      ))}
    </div>
  )
}

// Compact button that cycles none → low → medium → high → none (sub-item rows
// in the editor, where there's no room for the full picker).
export function PriorityCycle({ value, onChange, className = '' }) {
  const level = PRIORITY_LEVELS[value] || 0
  const next = (level + 1) % 4
  return (
    <button
      type="button"
      onClick={() => onChange(PRIORITY_NAMES[next] || undefined)}
      aria-label={`${LABELS[level]} — tap for ${LABELS[next].toLowerCase()}`}
      title={`${LABELS[level]} (tap to change)`}
      className={`flex h-8 w-8 items-center justify-center rounded-lg active:scale-90 ${level ? 'bg-white/5' : 'text-gray-600'} ${className}`}
    >
      {level ? (
        <PriorityIcon level={level} />
      ) : (
        <svg viewBox="0 0 12 16" className="h-4 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 10L6 6L10 10" strokeDasharray="2 2" />
        </svg>
      )}
    </button>
  )
}
