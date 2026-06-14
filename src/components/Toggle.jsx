// Large, tap-friendly on/off switch. No hover dependency.
export default function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-9 w-16 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-accent shadow-glow' : 'bg-border',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-7 w-7 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-8' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
