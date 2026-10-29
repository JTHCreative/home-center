import { CheckIcon } from './Icons.jsx'
import { HoverTip } from './NoteHint.jsx'
import { PriorityMark } from './Priority.jsx'
import { checkedAtLabel, subDone, subDoneAt } from '../lib/goalItems.js'

// A goal's sub-item checklist (Goals page and dashboard). Sub-items with their
// own nested sub-items show those indented beneath, with a count; checking the
// parent checks (or clears) all of them. Hover (or press and hold) a checked
// box to see when it was checked off. `wp` is the week's goal progress.
export default function SubItemTree({ kids, wp, color, onToggle, small = false, nested = false }) {
  const box = small ? 'h-5 w-5' : 'h-6 w-6'
  const tick = small ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const checks = wp.children
  return (
    <ul
      className={[
        'space-y-1 border-l border-border pl-3',
        nested ? 'ml-2.5 mt-1' : small ? 'ml-7 mt-1' : 'ml-9 mt-1',
      ].join(' ')}
    >
      {kids.map((c) => {
        const grand = c.children || []
        const cdone = subDone(c, checks)
        return (
          <li key={c.id}>
            <div className="flex items-center gap-2.5">
              <HoverTip tip={cdone ? checkedAtLabel(subDoneAt(c, wp)) : null} className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onToggle(c)}
                  aria-label={`Toggle ${c.title}`}
                  className={[
                    `flex ${box} flex-shrink-0 items-center justify-center rounded border-2 active:scale-95`,
                    cdone ? 'text-bg' : 'border-border',
                  ].join(' ')}
                  style={cdone ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  {cdone && <CheckIcon className={tick} />}
                </button>
              </HoverTip>
              <span className={cdone ? 'text-sm text-gray-500 line-through' : 'text-sm text-gray-200'}>
                {c.title}
              </span>
              <PriorityMark node={c} />
              {grand.length > 0 && (
                <span className="font-mono text-xs text-gray-500">
                  {grand.filter((g) => checks[g.id]).length}/{grand.length}
                </span>
              )}
            </div>
            {grand.length > 0 && (
              <SubItemTree kids={grand} wp={wp} color={color} onToggle={onToggle} small={small} nested />
            )}
          </li>
        )
      })}
    </ul>
  )
}
