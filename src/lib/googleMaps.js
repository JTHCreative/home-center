// Thin Google Maps Routes client for live drive times with current traffic.
// Provide VITE_GOOGLE_MAPS_API_KEY in .env to enable live data. With no key (or
// when a request fails), callers fall back to a deterministic mock estimate so
// the dashboard still renders on a fresh Pi.
//
// Uses the Routes API (computeRoutes), which accepts plain address strings and
// returns `duration` (current, traffic-aware) and `staticDuration` (typical, no
// traffic) so we can show how much the current traffic adds.

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

export const hasGoogleMapsKey = Boolean(API_KEY)

// Parse a Routes API duration string like "1234s" into seconds.
function parseDuration(v) {
  if (typeof v !== 'string') return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

// Deterministic demo estimate so the module renders without a key. Seeded by the
// origin/destination (and any via stops) so a given route always shows the same
// plausible time.
function mockTravel(origin, destination, stops = []) {
  let seed = 0
  for (const ch of [origin, ...stops, destination].join('→')) seed = (seed * 31 + ch.charCodeAt(0)) % 100000
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const distanceMeters = Math.round(3000 + rnd() * 40000 + stops.length * 4000)
  const staticDurationSec = Math.round(distanceMeters / 11) // ~25 mph average
  const trafficFactor = 1 + rnd() * 0.55 // current traffic adds 0–55%
  const durationSec = Math.round(staticDurationSec * trafficFactor)
  return { durationSec, staticDurationSec, distanceMeters, mock: true }
}

/**
 * Current driving time (with live traffic) between two address strings.
 * `via` is an optional list of intermediate waypoints to force a specific route.
 * Returns { durationSec, staticDurationSec, distanceMeters, mock }.
 * Never throws — falls back to a demo estimate on any error so the kiosk keeps
 * showing something useful.
 */
export async function fetchTravelTime(origin, destination, via = []) {
  const stops = (via || []).map((v) => v?.trim()).filter(Boolean)
  if (!API_KEY) return mockTravel(origin, destination, stops)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        ...(stops.length ? { intermediates: stops.map((address) => ({ address })) } : {}),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        units: 'IMPERIAL',
      }),
    })
    if (!res.ok) throw new Error(`Routes ${res.status}`)
    const data = await res.json()
    const route = data.routes?.[0]
    const durationSec = parseDuration(route?.duration)
    if (durationSec == null) throw new Error('No route')
    const staticDurationSec = parseDuration(route?.staticDuration) ?? durationSec
    return {
      durationSec,
      staticDurationSec,
      distanceMeters: route?.distanceMeters ?? null,
      mock: false,
    }
  } catch {
    // Network/CORS/quota error — show a demo estimate rather than nothing.
    return { ...mockTravel(origin, destination, stops), error: true }
  }
}

// Build a Google Maps directions deep link (works without an API key).
export function directionsUrl(origin, destination, via = []) {
  const stops = (via || []).map((v) => v?.trim()).filter(Boolean)
  const p = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' })
  if (stops.length) p.set('waypoints', stops.join('|'))
  return `https://www.google.com/maps/dir/?${p.toString()}`
}
