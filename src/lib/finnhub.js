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

// Run async work over items with limited concurrency, so we don't fire dozens of
// requests at once and trip Finnhub's rate limit (free tier ~60/min).
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const CONCURRENCY = 5

/**
 * Quote for a single symbol.
 * Finnhub /quote returns: c (current), d (change), dp (% change),
 * h, l, o, pc (previous close).
 * For crypto, pass a Finnhub crypto symbol like "BINANCE:BTCUSDT".
 */
export async function fetchQuote(symbol) {
  const q = await get('/quote', { symbol })
  // Finnhub returns 0/null for unknown symbols; treat that as no data.
  if (!q || !q.c) return null
  return {
    price: q.c,
    change: q.d,
    changePercent: q.dp,
    previousClose: q.pc,
  }
}

/** Fetch quotes for many symbols (rate-limited). Returns a map keyed by symbol. */
export async function fetchQuotes(symbols) {
  const entries = await mapLimit(symbols, CONCURRENCY, async (symbol) => {
    try {
      return [symbol, await fetchQuote(symbol)]
    } catch {
      return [symbol, null]
    }
  })
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

/** Fetch metrics for many symbols (rate-limited). Returns a map keyed by symbol. */
export async function fetchMetrics(symbols) {
  const entries = await mapLimit(symbols, CONCURRENCY, async (symbol) => {
    try {
      return [symbol, await fetchMetric(symbol)]
    } catch {
      return [symbol, null]
    }
  })
  return Object.fromEntries(entries)
}
