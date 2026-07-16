import { CheckIcon } from './Icons.jsx'

// Day-of-week labels for daily goals (week starts Sunday, matching the
// Sunday-start week scheme used by Goals/Habits).
const DAY_LABELS = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa']

// Row of tappable tally boxes. Each box toggles independently. Regular tally
// boxes show a check mark when filled; daily goals label each box with its
// day of the week instead. Shared by the Goals page, the dashboard Goals
// module, and the Habits page so tally goals feel the same everywhere.
export default function TallyBoxes({ checks, target, color, onToggle, daily = false }) {
  return (
    <div className="flex flex-shrink-0 flex-wrap gap-1.5">
      {Array.from({ length: target }, (_, i) => {
        const filled = !!checks[i]
        const label = daily ? DAY_LABELS[i % 7] : null
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            aria-label={`Toggle box ${i + 1}`}
            className="flex h-7 w-7 items-center justify-center rounded border-2 active:scale-90"
            style={
              filled
                ? { backgroundColor: color, borderColor: color, color: '#0D1117' }
                : { borderColor: '#30363D' }
            }
          >
            {label ? (
              <span className={`font-mono text-[10px] font-bold ${filled ? '' : 'text-gray-500'}`}>
                {label}
              </span>
            ) : (
              filled && <CheckIcon className="h-4 w-4" />
            )}
          </button>
        )
      })}
    </div>
  )
}
