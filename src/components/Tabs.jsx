// Segmented tab control. `tabs` is an array of { id, label }.
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-border bg-surface p-1">
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              'rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors active:scale-[0.97]',
              isActive
                ? 'bg-accent/15 text-accent shadow-glow'
                : 'text-gray-400',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
