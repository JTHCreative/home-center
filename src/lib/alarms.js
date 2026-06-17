import {
  BellIcon,
  ClockIcon,
  DumbbellIcon,
  GiftIcon,
  HeartIcon,
  MealIcon,
  MoonIcon,
  MusicIcon,
  PlaneIcon,
  StarIcon,
  SunIcon,
  SunriseIcon,
} from '../components/Icons.jsx'

// Pickable alarm icons, keyed by the id stored on each alarm.
export const ALARM_ICONS = {
  bell: BellIcon,
  clock: ClockIcon,
  sunrise: SunriseIcon,
  sun: SunIcon,
  moon: MoonIcon,
  meal: MealIcon,
  dumbbell: DumbbellIcon,
  heart: HeartIcon,
  music: MusicIcon,
  star: StarIcon,
  gift: GiftIcon,
  plane: PlaneIcon,
}
export const ALARM_ICON_NAMES = Object.keys(ALARM_ICONS)

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// "7:00 AM" from "07:00".
export function fmt12(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  if (!Number.isFinite(h)) return hhmm || ''
  const period = h < 12 ? 'AM' : 'PM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m || 0).padStart(2, '0')} ${period}`
}

// Friendly summary of the repeat days, e.g. "Every day", "Weekdays", "Mon, Wed".
export function daysSummary(days) {
  const d = [...(days || [])].sort((a, b) => a - b)
  if (d.length === 0) return 'Never'
  if (d.length === 7) return 'Every day'
  if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return 'Weekdays'
  if (d.length === 2 && d.includes(0) && d.includes(6)) return 'Weekends'
  return d.map((x) => DAYS[x]).join(', ')
}
