// Thin Finnhub client. Provide VITE_FINNHUB_API_KEY in .env to enable live data.
// When no key is present (or a request fails) callers fall back to mock data so
// the dashboard still renders on a fresh Pi.

const BASE = 'https://finnhub.io/api/v1'
const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY || ''

export const hasFinnhubKey = Boolean(API_KEY)

// --- Connection status -------------------------------------------------------
// Tracks whether the most recent tracked (quote) request reached Finnhub. The
// Stocks page subscribes to drive a green/red indicator.
let statusOk = true
const statusSubs = new Set()
export function subscribeFinnhubStatus(fn) {
  statusSubs.add(fn)
  fn(statusOk)
  return () => statusSubs.delete(fn)
}
function reportStatus(ok) {
  statusOk = ok
  for (const fn of statusSubs) fn(ok)
}

// --- Rate limiter ------------------------------------------------------------
// Finnhub's free tier allows ~60 calls/minute (and 30/second). With dozens of
// symbols, firing every quote + metric at once trips the limit and most return
// 429, so only some tickers load. We gate every request through a shared queue
// that (a) stays under the per-minute budget and (b) spaces calls out so we
// never burst past the per-second cap. Quotes get priority over metrics so the
// visible price data fills in first.
const MAX_PER_MIN = 55 // leave headroom under the 60/min free-tier cap
const MIN_GAP_MS = 70 // ~14 req/s ceiling, well under the 30/s cap

const hits = [] // timestamps of granted requests in the last minute
const waiters = [] // { priority, seq, resolve }
let seq = 0
let lastGrant = 0
let pumpTimer = null

function pump() {
  pumpTimer = null
  const now = Date.now()
  while (hits.length && now - hits[0] >= 60_000) hits.shift()

  if (!waiters.length) return
  const sinceLast = now - lastGrant
  if (hits.length < MAX_PER_MIN && sinceLast >= MIN_GAP_MS) {
    // Serve the highest priority (lowest number), oldest-first.
    waiters.sort((a, b) => a.priority - b.priority || a.seq - b.seq)
    const w = waiters.shift()
    hits.push(now)
    lastGrant = now
    w.resolve()
  }

  if (waiters.length) {
    const waitForGap = Math.max(0, MIN_GAP_MS - (Date.now() - lastGrant))
    const waitForWindow = hits.length >= MAX_PER_MIN ? 60_000 - (Date.now() - hits[0]) + 20 : 0
    const delay = Math.max(20, waitForGap, waitForWindow)
    pumpTimer = setTimeout(pump, delay)
  }
}

function acquire(priority) {
  return new Promise((resolve) => {
    waiters.push({ priority, seq: seq++, resolve })
    if (!pumpTimer) pump()
  })
}

async function get(path, params = {}, { priority = 1, track = false } = {}) {
  if (!API_KEY) throw new Error('Missing VITE_FINNHUB_API_KEY')
  await acquire(priority)
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  url.searchParams.set('token', API_KEY)
  let res
  try {
    res = await fetch(url)
  } catch (err) {
    if (track) reportStatus(false) // network/DNS failure — no connection
    throw err
  }
  if (!res.ok) {
    // 429 = rate limited, 5xx = Finnhub down — both mean "not connected".
    if (track && (res.status === 429 || res.status >= 500)) reportStatus(false)
    throw new Error(`Finnhub ${res.status}`)
  }
  if (track) reportStatus(true)
  return res.json()
}

/**
 * Quote for a single symbol.
 * Finnhub /quote returns: c (current), d (change), dp (% change),
 * h, l, o, pc (previous close).
 * For crypto, pass a Finnhub crypto symbol like "BINANCE:BTCUSDT".
 */
export async function fetchQuote(symbol) {
  const q = await get('/quote', { symbol }, { priority: 0, track: true })
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
 * Basic financials for a symbol — used for 52-week high, P/E and the latest
 * dividend per share. These are lower priority than quotes and run best-effort
 * (the basic-financials endpoint is restricted on some free keys); failures
 * never flip the connection status.
 */
export async function fetchMetric(symbol) {
  const data = await get('/stock/metric', { symbol, metric: 'all' }, { priority: 1, track: false })
  const m = data.metric || {}
  return {
    week52High: m['52WeekHigh'] ?? null,
    pe: m.peTTM ?? m.peBasicExclExtraTTM ?? m.peNormalizedAnnual ?? null,
    // Most recent per-share dividend Finnhub exposes on the free tier (TTM,
    // falling back to the annual figure). 0 / null means non-dividend payer.
    dividend: m.dividendPerShareTTM ?? m.dividendPerShareAnnual ?? null,
  }
}

/** Fetch metrics for many symbols (rate-limited). Returns a map keyed by symbol. */
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
