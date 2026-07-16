import { CheckIcon } from './Icons.jsx'

// Row of tappable tally boxes. Each box toggles independently and shows a
// check mark. Shared by the Goals page, the dashboard Goals module, and the
// Habits page so tally goals feel the same everywhere.
export default function TallyBoxes({ checks, target, color, onToggle }) {
  return (
    <div className="flex flex-shrink-0 flex-wrap gap-1.5">
      {Array.from({ length: target }, (_, i) => {
        const filled = !!checks[i]
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
            {filled && <CheckIcon className="h-4 w-4" />}
          </button>
        )
      })}
    </div>
  )
}
