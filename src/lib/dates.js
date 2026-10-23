// Safari-safe local-date parsing. Safari (especially iOS) returns an Invalid
// Date for the "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm" string forms that Chrome and
// Firefox accept, which silently breaks any UI that formats those dates. Build
// the Date from its parts so parsing is identical across browsers.
export function parseLocalDate(str) {
  if (typeof str !== 'string') return new Date(NaN)
  const [datePart, timePart = ''] = str.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h = 0, mi = 0] = timePart.split(':').map(Number)
  if (!y || !mo || !d) return new Date(NaN)
  return new Date(y, mo - 1, d, h || 0, mi || 0)
}

// --- Week helpers (weeks start Sunday, keyed by that Sunday's 'YYYY-MM-DD') --
export const isoDate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const addDays = (d, n) => {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}
export const sundayOf = (d) => {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  c.setDate(c.getDate() - c.getDay()) // week starts Sunday
  return c
}
// Labels for the week starting `start`: the range ("Jun 8 – Jun 14") and how
// far it is from this week ("This week", "Next week", "3 weeks ago").
export function weekLabels(start) {
  const end = addDays(start, 6)
  const fmt = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const delta = Math.round((start - sundayOf(new Date())) / (7 * 864e5))
  const rel =
    delta === 0
      ? 'This week'
      : delta === -1
        ? 'Last week'
        : delta === 1
          ? 'Next week'
          : delta < 0
            ? `${-delta} weeks ago`
            : `In ${delta} weeks`
  return { range: `${fmt(start)} – ${fmt(end)}`, rel }
}
