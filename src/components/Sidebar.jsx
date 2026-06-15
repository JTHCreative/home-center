import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  CalendarIcon,
  ChartIcon,
  GearIcon,
  GoalIcon,
  GridIcon,
  HomeIcon,
  MealIcon,
} from './Icons.jsx'

const LINKS = [
  { to: '/dashboard', label: 'Home', Icon: GridIcon },
  { to: '/smart-home', label: 'Smart Home', Icon: HomeIcon },
  { to: '/stocks', label: 'Stocks & Crypto', Icon: ChartIcon },
  { to: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { to: '/meals', label: 'Meals', Icon: MealIcon },
  { to: '/goals', label: 'Goals', Icon: GoalIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
]

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function Sidebar() {
  const now = useClock()
  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-border bg-surface">
      {/* Clock + date, always visible at the top */}
      <div className="border-b border-border px-6 py-6">
        <div className="font-mono text-4xl font-bold tracking-tight text-white">
          {time}
        </div>
        <div className="mt-1 text-sm text-gray-400">{date}</div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {LINKS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-4 rounded-xl px-4 py-4 text-base font-medium transition-colors',
                'active:scale-[0.98]',
                isActive
                  ? 'bg-accent/15 text-accent shadow-glow'
                  : 'text-gray-300 hover:bg-white/5',
              ].join(' ')
            }
          >
            <Icon className="h-6 w-6 flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-4 text-xs text-gray-600">Home Center</div>
    </aside>
  )
}
