// Thin Finnhub client. Provide VITE_FINNHUB_API_KEY in .env to enable live data.
// When no key is present (or a request fails) callers fall back to mock data so
// the dashboard still renders on a fresh Pi.

const BASE = 'https://finnhub.io/api/v1'
const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY || ''

export const hasFinnhubKey = Boolean(API_KEY)

async function get(path, params = {}) {
  if (!API_KEY) throw new Error('Missing VITE_FINNHUB_API_KEY')
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  url.searchParams.set('token', API_KEY)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub ${res.status}`)
  return res.json()
}

/**
 * Quote for a single symbol.
 * Finnhub /quote returns: c (current), d (change), dp (% change),
 * h, l, o, pc (previous close).
 * For crypto, pass a Finnhub crypto symbol like "BINANCE:BTCUSDT".
 */
export async function fetchQuote(symbol) {
  const q = await get('/quote', { symbol })
  return {
    price: q.c,
    change: q.d,
    changePercent: q.dp,
    previousClose: q.pc,
  }
}

/** Fetch quotes for many symbols in parallel. Returns a map keyed by symbol. */
export async function fetchQuotes(symbols) {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return [symbol, await fetchQuote(symbol)]
      } catch {
        return [symbol, null]
      }
    }),
  )
  return Object.fromEntries(entries)
}

/**
 * Basic financials for a symbol — used for 52-week high and P/E.
 * Finnhub /stock/metric returns a `metric` object with many keys.
 */
export async function fetchMetric(symbol) {
  const data = await get('/stock/metric', { symbol, metric: 'all' })
  const m = data.metric || {}
  return {
    week52High: m['52WeekHigh'] ?? null,
    pe: m.peTTM ?? m.peBasicExclExtraTTM ?? m.peNormalizedAnnual ?? null,
  }
}

/** Fetch metrics for many symbols in parallel. Returns a map keyed by symbol. */
export async function fetchMetrics(symbols) {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return [symbol, await fetchMetric(symbol)]
      } catch {
        return [symbol, null]
      }
    }),
  )
  return Object.fromEntries(entries)
}
