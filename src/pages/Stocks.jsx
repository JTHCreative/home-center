import { useCallback, useEffect, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import Tabs from '../components/Tabs.jsx'
import Sparkline from '../components/Sparkline.jsx'
import { fetchQuotes, hasFinnhubKey } from '../lib/finnhub.js'
import { readStored } from '../lib/storage.js'

// Holdings. `symbol` is the Finnhub symbol; crypto uses exchange-prefixed
// symbols (e.g. BINANCE:BTCUSDT). Edit here or override via localStorage key
// `home-center:portfolio`.
const DEFAULT_PORTFOLIO = {
  stocks: [
    { symbol: 'AAPL', name: 'Apple', shares: 25 },
    { symbol: 'MSFT', name: 'Microsoft', shares: 12 },
    { symbol: 'NVDA', name: 'NVIDIA', shares: 8 },
    { symbol: 'TSLA', name: 'Tesla', shares: 15 },
    { symbol: 'AMZN', name: 'Amazon', shares: 10 },
  ],
  crypto: [
    { symbol: 'BINANCE:BTCUSDT', name: 'Bitcoin', shares: 0.4 },
    { symbol: 'BINANCE:ETHUSDT', name: 'Ethereum', shares: 3.2 },
    { symbol: 'BINANCE:SOLUSDT', name: 'Solana', shares: 40 },
  ],
}

const TABS = [
  { id: 'stocks', label: 'Stocks' },
  { id: 'crypto', label: 'Crypto' },
]

// Deterministic mock quote so the dashboard renders without an API key.
function mockQuote(symbol) {
  let seed = 0
  for (const ch of symbol) seed = (seed * 31 + ch.charCodeAt(0)) % 100000
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const price = 20 + rnd() * 480
  const changePercent = (rnd() - 0.45) * 6
  const change = (price * changePercent) / 100
  return { price, change, changePercent, previousClose: price - change }
}

// Build a short sparkline series from a quote's open/close bounds.
function seriesFromQuote(symbol, quote) {
  const { price, change } = quote
  const start = price - change
  let seed = 0
  for (const ch of symbol) seed = (seed * 17 + ch.charCodeAt(0)) % 100000
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const N = 24
  const out = []
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    const drift = start + (price - start) * t
    const noise = (rnd() - 0.5) * Math.abs(change || price * 0.01) * 1.2
    out.push(Number((drift + noise).toFixed(2)))
  }
  out[0] = Number(start.toFixed(2))
  out[N - 1] = Number(price.toFixed(2))
  return out
}

function money(n) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

export default function Stocks() {
  const [tab, setTab] = useState('stocks')
  const [quotes, setQuotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)

  const portfolio = readStored('portfolio', DEFAULT_PORTFOLIO)
  const holdings = portfolio[tab] || []

  const load = useCallback(async () => {
    setLoading(true)
    const symbols = holdings.map((h) => h.symbol)
    let result = {}
    if (hasFinnhubKey) {
      const live = await fetchQuotes(symbols)
      // Fall back to mock for any symbol that failed.
      result = Object.fromEntries(
        symbols.map((s) => [s, live[s] || mockQuote(s)]),
      )
    } else {
      result = Object.fromEntries(symbols.map((s) => [s, mockQuote(s)]))
    }
    setQuotes((prev) => ({ ...prev, ...result }))
    setUpdatedAt(new Date())
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000) // refresh each minute
    return () => clearInterval(id)
  }, [load])

  // Portfolio totals for the active tab.
  let total = 0
  let dayPL = 0
  for (const h of holdings) {
    const q = quotes[h.symbol]
    if (!q) continue
    total += q.price * h.shares
    dayPL += q.change * h.shares
  }
  const dayPct = total - dayPL !== 0 ? (dayPL / (total - dayPL)) * 100 : 0
  const up = dayPL >= 0

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Stocks & Crypto" subtitle={
        hasFinnhubKey ? 'Live via Finnhub' : 'Demo data — add VITE_FINNHUB_API_KEY for live quotes'
      }>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </PageHeader>

      {/* Portfolio summary */}
      <Card className="mb-6" glow>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="font-mono text-4xl font-bold text-white">
              {money(total)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">Today&apos;s P&amp;L</div>
            <div
              className={[
                'font-mono text-3xl font-bold',
                up ? 'text-gain' : 'text-loss',
              ].join(' ')}
            >
              {up ? '+' : ''}
              {money(dayPL)}{' '}
              <span className="text-2xl">
                ({up ? '+' : ''}
                {dayPct.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Holdings list */}
      <div className="space-y-3">
        {holdings.map((h) => {
          const q = quotes[h.symbol]
          const hUp = q ? q.changePercent >= 0 : true
          return (
            <Card key={h.symbol} className="flex items-center gap-4 py-4">
              <div className="w-40 flex-shrink-0">
                <div className="font-semibold text-white">{h.symbol.split(':').pop().replace('USDT', '')}</div>
                <div className="text-xs text-gray-400">{h.name}</div>
              </div>

              <div className="flex-shrink-0">
                {q && <Sparkline data={seriesFromQuote(h.symbol, q)} up={hUp} />}
              </div>

              <div className="flex-1" />

              <div className="text-right">
                <div className="font-mono text-lg text-white">
                  {q ? money(q.price) : '—'}
                </div>
                <div className="text-xs text-gray-500">
                  {h.shares} {tab === 'crypto' ? 'coins' : 'sh'}
                </div>
              </div>

              <div className="w-28 text-right">
                <div
                  className={[
                    'font-mono text-lg font-bold',
                    hUp ? 'text-gain' : 'text-loss',
                  ].join(' ')}
                >
                  {q ? `${hUp ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                </div>
                <div className="font-mono text-xs text-gray-500">
                  {q ? money(q.price * h.shares) : ''}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-4 text-right text-xs text-gray-600">
        {loading
          ? 'Updating…'
          : updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString()}`
            : ''}
      </div>
    </div>
  )
}
