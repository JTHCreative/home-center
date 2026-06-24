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
