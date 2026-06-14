// Surface container used across pages.
export default function Card({ className = '', children, glow = false, ...rest }) {
  return (
    <div
      className={[
        'rounded-2xl border border-border bg-surface p-5',
        glow ? 'shadow-glow' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
