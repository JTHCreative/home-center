import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AlarmIcon, GearIcon } from './Icons.jsx'
import { useLocalState } from '../lib/storage.js'
import { pageById, reconcileMenu } from '../lib/menu.js'

// Pinned to the bottom of the sidebar, below the configurable navigation.
const SETTINGS_LINK = { to: '/settings', label: 'Settings', Icon: GearIcon }

const navLinkClass = ({ isActive }) =>
  [
    'flex items-center gap-4 rounded-xl px-4 py-4 text-base font-medium transition-colors',
    'active:scale-[0.98]',
    isActive ? 'bg-accent/15 text-accent shadow-glow' : 'text-gray-300 hover:bg-white/5',
  ].join(' ')

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
  const navigate = useNavigate()
  // Menu order/contents are configured on the Settings page (shared via storage).
  const [menuConfig] = useLocalState('menu-config', null, reconcileMenu)
  const [alarms] = useLocalState('alarms', [])
  const hasActiveAlarm = (alarms || []).some((a) => a && a.enabled !== false && (a.days || []).length > 0)
  const links = menuConfig.menu.map((id) => pageById[id]).filter(Boolean)
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
        <div className="flex items-start justify-between">
          <div className="font-mono text-4xl font-bold tracking-tight text-white">{time}</div>
          <button
            type="button"
            onClick={() => navigate('/alarms')}
            aria-label="Alarms"
            className={[
              'relative rounded-xl p-2 active:scale-95',
              hasActiveAlarm ? 'bg-accent/15 text-accent' : 'bg-white/5 text-gray-300',
            ].join(' ')}
          >
            <AlarmIcon className="h-6 w-6" />
            {hasActiveAlarm && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent shadow-glow" />
            )}
          </button>
        </div>
        <div className="mt-1 text-sm text-gray-400">{date}</div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {links.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon className="h-6 w-6 flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}

        {/* Settings pinned to the bottom of the nav */}
        <NavLink to={SETTINGS_LINK.to} className={(s) => `mt-auto ${navLinkClass(s)}`}>
          <SETTINGS_LINK.Icon className="h-6 w-6 flex-shrink-0" />
          <span>{SETTINGS_LINK.label}</span>
        </NavLink>
      </nav>

      <div className="px-6 py-4 text-xs text-gray-600">Home Center</div>
    </aside>
  )
}
