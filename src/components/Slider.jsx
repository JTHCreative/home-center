// Touch-friendly range slider with a large thumb. Value 0–100.
export default function Slider({ value, onChange, disabled = false, ariaLabel }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={[
        'h-3 w-full cursor-pointer appearance-none rounded-full bg-border',
        'accent-accent disabled:opacity-40',
        // Big thumb for fingers (WebKit + Firefox)
        '[&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
        '[&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-glow',
        '[&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7',
        '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0',
        '[&::-moz-range-thumb]:bg-accent',
      ].join(' ')}
    />
  )
}
