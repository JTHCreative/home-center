import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AlarmIcon, ChevronLeft, GearIcon, MenuIcon } from './Icons.jsx'
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

const fmtTime = (now) =>
  now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
const fmtDate = (now) =>
  now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

// Small round button that jumps to the Alarms page, highlighted when an alarm is
// scheduled. Shared by the desktop sidebar header and the mobile top bar.
function AlarmButton({ active, onNavigate }) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      aria-label="Alarms"
      className={[
        'relative rounded-lg p-1.5 active:scale-95',
        active ? 'bg-accent/15 text-accent' : 'bg-white/5 text-gray-300',
      ].join(' ')}
    >
      <AlarmIcon className="h-5 w-5" />
      {active && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
      )}
    </button>
  )
}

function useHasActiveAlarm() {
  const [alarms] = useLocalState('alarms', [])
  return (alarms || []).some((a) => a && a.enabled !== false && (a.days || []).length > 0)
}

// Compact bar shown only on small screens (phones): a hamburger that opens the
// nav drawer, plus the clock and alarm button that otherwise live in the
// sidebar. Hidden at `md` and up where the full sidebar is always visible.
export function MobileTopBar({ onMenu }) {
  const now = useClock()
  const navigate = useNavigate()
  const hasActiveAlarm = useHasActiveAlarm()

  return (
    <header className="flex flex-shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="rounded-lg bg-white/5 p-2 text-gray-200 active:scale-95"
      >
        <MenuIcon className="h-6 w-6" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xl font-bold leading-none tracking-tight text-white">
          {fmtTime(now)}
        </div>
        <div className="truncate text-xs text-gray-400">{fmtDate(now)}</div>
      </div>
      <AlarmButton active={hasActiveAlarm} onNavigate={() => navigate('/alarms')} />
    </header>
  )
}

export default function Sidebar({ mobileOpen = false, onClose, collapsed = false, onCollapse }) {
  const now = useClock()
  const navigate = useNavigate()
  // Menu order/contents are configured on the Settings page (shared via storage).
  const [menuConfig] = useLocalState('menu-config', null, reconcileMenu)
  const hasActiveAlarm = useHasActiveAlarm()
  const links = menuConfig.menu.map((id) => pageById[id]).filter(Boolean)

  return (
    <>
      {/* Dimmed backdrop behind the drawer on phones; tap to dismiss. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'flex h-full w-64 flex-shrink-0 flex-col border-r border-border bg-surface',
          // Off-canvas drawer on phones; a static column from `md` up — unless
          // collapsed, where it's hidden at `md`+ to give pages the full width.
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:hidden' : 'md:static md:z-auto md:translate-x-0',
        ].join(' ')}
      >
        {/* Clock + date, always visible at the top */}
        <div className="border-b border-border px-6 py-6">
          <div className="flex items-center gap-2">
            <div className="font-mono text-3xl font-bold tracking-tight text-white">{fmtTime(now)}</div>
            <div className="flex flex-1 justify-center">
              <AlarmButton active={hasActiveAlarm} onNavigate={() => navigate('/alarms')} />
            </div>
            {/* Collapse the sidebar (md+ only; phones use the drawer backdrop). */}
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide sidebar"
              className="hidden rounded-lg bg-white/5 p-1.5 text-gray-300 active:scale-95 md:inline-flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-1 text-sm text-gray-400">{fmtDate(now)}</div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {links.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={onClose}>
              <Icon className="h-6 w-6 flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}

          {/* Settings pinned to the bottom of the nav */}
          <NavLink
            to={SETTINGS_LINK.to}
            className={(s) => `mt-auto ${navLinkClass(s)}`}
            onClick={onClose}
          >
            <SETTINGS_LINK.Icon className="h-6 w-6 flex-shrink-0" />
            <span>{SETTINGS_LINK.label}</span>
          </NavLink>
        </nav>

        <div className="px-6 py-4 text-xs text-gray-600">Home Center</div>
      </aside>
    </>
  )
}
