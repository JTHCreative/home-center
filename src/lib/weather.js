// Open-Meteo weather client — free, no API key, and CORS-enabled, which makes it
// ideal for a static kiosk build (no secret to manage, unlike Finnhub/Google).
// Geocoding turns a typed place name into coordinates; the forecast endpoint
// returns current conditions plus today's high/low.

const GEO = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'

/** Resolve a place name to { name, latitude, longitude }. Returns null if not found. */
export async function geocode(query) {
  const q = query?.trim()
  if (!q) return null
  const res = await fetch(`${GEO}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`)
  if (!res.ok) throw new Error(`Geocode ${res.status}`)
  const data = await res.json()
  const r = data.results?.[0]
  if (!r) return null
  return {
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
  }
}

/** Current weather + a 5-day daily forecast for a coordinate. `units` is 'fahrenheit' | 'celsius'. */
export async function fetchWeather(latitude, longitude, units = 'fahrenheit') {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    temperature_unit: units,
    wind_speed_unit: units === 'celsius' ? 'kmh' : 'mph',
    timezone: 'auto',
    forecast_days: '5',
  })
  const res = await fetch(`${FORECAST}?${params.toString()}`)
  if (!res.ok) throw new Error(`Weather ${res.status}`)
  const data = await res.json()
  const c = data.current || {}
  const d = data.daily || {}
  const days = (d.time || []).map((date, i) => ({
    date,
    hi: d.temperature_2m_max?.[i],
    lo: d.temperature_2m_min?.[i],
    code: d.weather_code?.[i],
  }))
  return {
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    wind: c.wind_speed_10m,
    code: c.weather_code,
    isDay: c.is_day !== 0,
    hi: d.temperature_2m_max?.[0],
    lo: d.temperature_2m_min?.[0],
    days,
    units,
  }
}

// WMO weather code → a short label and a condition `kind` used to pick an icon.
export function describeWeather(code) {
  const c = Number(code)
  if (c === 0) return { label: 'Clear', kind: 'clear' }
  if (c === 1) return { label: 'Mainly clear', kind: 'clear' }
  if (c === 2) return { label: 'Partly cloudy', kind: 'cloud' }
  if (c === 3) return { label: 'Overcast', kind: 'cloud' }
  if (c === 45 || c === 48) return { label: 'Fog', kind: 'fog' }
  if (c >= 51 && c <= 57) return { label: 'Drizzle', kind: 'rain' }
  if (c >= 61 && c <= 67) return { label: 'Rain', kind: 'rain' }
  if (c >= 71 && c <= 77) return { label: 'Snow', kind: 'snow' }
  if (c >= 80 && c <= 82) return { label: 'Rain showers', kind: 'rain' }
  if (c === 85 || c === 86) return { label: 'Snow showers', kind: 'snow' }
  if (c >= 95) return { label: 'Thunderstorm', kind: 'thunder' }
  return { label: '—', kind: 'cloud' }
}
