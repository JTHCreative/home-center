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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
