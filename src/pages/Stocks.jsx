import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import ScrollTabs from '../components/ScrollTabs.jsx'
import Sparkline from '../components/Sparkline.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import { fetchMetrics, fetchQuotes, hasFinnhubKey, subscribeFinnhubStatus } from '../lib/finnhub.js'
import { useLocalState } from '../lib/storage.js'
import { useDragScroll } from '../lib/useDragScroll.js'
import { BellIcon, ChevronDown, ChevronUp, PlusIcon, TrashIcon } from '../components/Icons.jsx'

// Watchlists: named lists of symbols. `symbol` is the Finnhub symbol; crypto
// uses exchange-prefixed symbols (e.g. BINANCE:BTCUSDT). `qty` is optional —
// when set, the symbol contributes to the list's value and daily P&L.
// Default lists below were imported from the user's Robinhood Legend watchlists.
const mk = (id, name, symbols) => ({
  id,
  name,
  items: symbols.map((symbol) => ({ symbol, name: '', qty: 0 })),
})

const DEFAULT_WATCHLISTS = [
  mk('wl-growth', 'Growth Fund', [
    'NEM', 'RYCEY', 'TSLA', 'BLOK', 'ABNB', 'DOCU', 'GOOGL', 'HOOD', 'BRK.B',
    'CSGP', 'BABA', 'NVDA', 'AMZN', 'BA', 'DUOL', 'BLCN', 'AAPL', 'PLTR', 'RKT',
  ]),
  mk('wl-dividend', 'Dividend Fund', [
    'VZ', 'STK', 'STAG', 'BSTZ', 'ARCC', 'O', 'SCHD', 'PG', 'VYM', 'JNJ', 'CVX',
    'COST', 'JEPI', 'FDVV', 'KO', 'MAIN', 'IBM', 'BIPC',
  ]),
  mk('wl-ira', 'IRAs', [
    'AMD', 'UAL', 'DAL', 'VYM', 'VTR', 'IVV', 'SPY', 'VOO', 'COST', 'SCHB',
    'VONG', 'MSFT', 'DIS', 'CSCO',
  ]),
  mk('wl-eyeson', 'Eyes On', [
    'ROKU', 'RIVN', 'STUB', 'KEYS', 'LUV', 'CMG', 'SCHW', 'RGTI', 'AMC', 'TGT',
    'TTD', 'U', 'GEMI', 'TSM', 'OTIS', 'F', 'WAL', 'PYPL', 'IONQ', 'GM', 'ROP',
    'LCID', 'WMT', 'ARKF', 'PFE', 'META', 'MCD', 'TOL', 'DHI', 'COIN', 'CRM',
    'KLAR', 'UBER', 'NFLX', 'SNAP', 'ZG', 'QBTS', 'PTON', 'GME', 'AI', 'LLY',
    'LULU', 'RVI', 'SNOW', 'SNDL', 'BRLT', 'LEN', 'PINS', 'ADBE',
  ]),
]

// Deterministic mock quote so the dashboard renders without an API key.
function mockQuote(symbol) {
  let seed = 0
  for (const ch of symbol) seed = (seed * 31 + ch.charCodeAt(0)) % 100000
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const price = 20 + rnd() * 480
  const changePercent = (rnd() - 0.45) * 6
  const change = (price * changePercent) / 100
  const week52High = price * (1.05 + rnd() * 0.6)
  const pe = symbol.includes(':') ? null : 8 + rnd() * 45 // crypto has no P/E
  // ~60% of mock equities pay a dividend; crypto pays none.
  const dividend = symbol.includes(':') || rnd() < 0.4 ? null : Number((rnd() * 1.5).toFixed(2))
  return { price, change, changePercent, previousClose: price - change, week52High, pe, dividend }
}

// Numeric filter test: op is 'lt' | 'eq' | 'gt'. Empty value = no filter.
function matchFilter(f, val) {
  if (!f || f.value === '' || f.value == null) return true
  if (val == null || Number.isNaN(val)) return false
  const t = Number(f.value)
  if (Number.isNaN(t)) return true
  if (f.op === 'lt') return val < t
  if (f.op === 'gt') return val > t
  return Math.round(val) === Math.round(t) // 'eq' — nearest whole number
}

// Sortable value for a column key.
function sortVal(it, q, key) {
  if (key === 'symbol') return it.symbol
  if (key === 'qty') return it.qty || 0
  return q ? q[key] : undefined
}

const FILTER_FIELDS = [
  { key: 'price', label: 'Last Price' },
  { key: 'week52High', label: '52W High' },
  { key: 'pe', label: 'P/E' },
]
const OPS = [
  { id: 'lt', label: '<' },
  { id: 'eq', label: '=' },
  { id: 'gt', label: '>' },
]

function SortTh({ label, k, sort, onSort, align = 'right' }) {
  const isActive = sort.key === k
  return (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={[
          'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide active:scale-95',
          align === 'right' ? 'flex-row-reverse' : '',
          isActive ? 'text-accent' : 'text-gray-500',
        ].join(' ')}
      >
        {label}
        {isActive &&
          (sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
      </button>
    </th>
  )
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

const money = (n) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

const display = (symbol) => symbol.split(':').pop().replace('USDT', '').replace('USD', '')

// A price alert fires when the live price crosses the target in the chosen
// direction ('above' → price >= target, 'below' → price <= target).
const alertTriggered = (alert, price) =>
  !!alert && price != null && (alert.dir === 'above' ? price >= alert.price : price <= alert.price)

export default function Stocks() {
  // Key is versioned (-v2) so the imported Robinhood lists replace the earlier
  // demo Stocks/Crypto defaults on devices that already seeded them.
  const [watchlists, setWatchlists] = useLocalState('watchlists-v2', DEFAULT_WATCHLISTS)
  const [activeId, setActiveId] = useState(watchlists[0]?.id)
  const [quotes, setQuotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [connected, setConnected] = useState(true) // live Finnhub reachability

  useEffect(() => subscribeFinnhubStatus(setConnected), [])

  const [listDraft, setListDraft] = useState(null) // { id?, name }
  const [symbolDraft, setSymbolDraft] = useState(null) // { symbol, name, qty, original? }
  const [sort, setSort] = useState({ key: 'changePercent', dir: 'desc' })
  const [filtering, setFiltering] = useState(false)
  const [filters, setFilters] = useState({
    price: { op: 'gt', value: '' },
    week52High: { op: 'gt', value: '' },
    pe: { op: 'lt', value: '' },
  })

  const active = watchlists.find((w) => w.id === activeId) || watchlists[0]
  const items = useMemo(() => active?.items || [], [active])
  const symbolsKey = items.map((i) => i.symbol).join(',')
  const metricsRef = useRef({}) // cached 52W high / P/E (rarely change)

  const load = useCallback(async () => {
    const syms = symbolsKey ? symbolsKey.split(',') : []
    if (!syms.length) {
      setLoading(false)
      return
    }
    setLoading(true)

    if (!hasFinnhubKey) {
      // No key — demo mode with deterministic mock data.
      setQuotes((prev) => {
        const next = { ...prev }
        for (const s of syms) next[s] = prev[s] || mockQuote(s)
        return next
      })
      setUpdatedAt(new Date())
      setLoading(false)
      return
    }

    // Live: refresh quotes every cycle. Metrics (52W high / P/E) are loaded once
    // per symbol by a separate effect, and read here from the cache.
    const liveQ = await fetchQuotes(syms)

    setQuotes((prev) => {
      const next = { ...prev }
      for (const s of syms) {
        const q = liveQ[s]
        const prevQ = prev[s]
        // Keep the last good value on a failed/rate-limited fetch; never show mock
        // when a real key is configured (avoids plausible-but-wrong numbers).
        if (!q && !prevQ) {
          next[s] = null
          continue
        }
        const base = prevQ || {}
        const m = metricsRef.current[s] || {}
        next[s] = {
          price: q?.price ?? base.price,
          change: q?.change ?? base.change,
          changePercent: q?.changePercent ?? base.changePercent,
          previousClose: q?.previousClose ?? base.previousClose,
          week52High: m.week52High ?? base.week52High ?? null,
          pe: m.pe ?? base.pe ?? null,
          dividend: m.dividend ?? base.dividend ?? null,
        }
      }
      return next
    })
    setUpdatedAt(new Date())
    setLoading(false)
  }, [symbolsKey])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000) // refresh quotes each minute
    return () => clearInterval(id)
  }, [load])

  // Load 52-week high and P/E once per symbol when the panel opens or the list
  // changes — they barely move intraday, so one pull keeps them current.
  useEffect(() => {
    if (!hasFinnhubKey) return
    const syms = symbolsKey ? symbolsKey.split(',') : []
    const missing = syms.filter((s) => !metricsRef.current[s])
    if (!missing.length) return
    let cancelled = false
    fetchMetrics(missing).then((liveM) => {
      if (cancelled) return
      for (const [s, m] of Object.entries(liveM)) if (m) metricsRef.current[s] = m
      setQuotes((prev) => {
        const next = { ...prev }
        for (const s of missing) {
          const m = metricsRef.current[s]
          const base = prev[s]
          // Only enrich an existing quote — never synthesize one from metrics
          // alone, or we'd create a partial object (no price/changePercent)
          // that crashes the table if it renders before the price load lands.
          if (!m || !base) continue
          next[s] = {
            ...base,
            week52High: m.week52High ?? base.week52High ?? null,
            pe: m.pe ?? base.pe ?? null,
            dividend: m.dividend ?? base.dividend ?? null,
          }
        }
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [symbolsKey])

  // --- Watchlist ops --------------------------------------------------------
  const saveList = () => {
    const name = listDraft.name.trim()
    if (!name) return
    if (listDraft.id) {
      setWatchlists((ws) => ws.map((w) => (w.id === listDraft.id ? { ...w, name } : w)))
    } else {
      const id = crypto.randomUUID()
      setWatchlists((ws) => [...ws, { id, name, items: [] }])
      setActiveId(id)
    }
    setListDraft(null)
  }
  const deleteList = () => {
    if (watchlists.length <= 1) return
    setWatchlists((ws) => ws.filter((w) => w.id !== active.id))
    setActiveId(watchlists.find((w) => w.id !== active.id)?.id)
  }

  const patchItems = (fn) =>
    setWatchlists((ws) => ws.map((w) => (w.id === active.id ? { ...w, items: fn(w.items) } : w)))

  const saveSymbol = () => {
    const symbol = symbolDraft.symbol.trim().toUpperCase()
    if (!symbol) return
    const item = { symbol, name: symbolDraft.name.trim(), qty: Number(symbolDraft.qty) || 0 }
    const alertPrice = Number(symbolDraft.alertPrice)
    if (symbolDraft.alertPrice !== '' && Number.isFinite(alertPrice)) {
      item.alert = { price: alertPrice, dir: symbolDraft.alertDir === 'below' ? 'below' : 'above' }
    }
    patchItems((list) => {
      const idx = list.findIndex((i) => i.symbol === (symbolDraft.original || symbol))
      if (idx >= 0) return list.map((i, k) => (k === idx ? item : i))
      return [...list, item]
    })
    setSymbolDraft(null)
  }
  const removeSymbol = (symbol) => patchItems((list) => list.filter((i) => i.symbol !== symbol))

  // Totals for items that have a quantity.
  let total = 0
  let dayPL = 0
  let hasPositions = false
  for (const it of items) {
    const q = quotes[it.symbol]
    if (!q || q.price == null || !it.qty) continue
    hasPositions = true
    total += q.price * it.qty
    dayPL += (q.change ?? 0) * it.qty
  }
  const dayPct = total - dayPL !== 0 ? (dayPL / (total - dayPL)) * 100 : 0
  const up = dayPL >= 0

  // Sort + filter the visible rows.
  const rows = useMemo(() => {
    const arr = items.filter((it) => {
      const q = quotes[it.symbol]
      return (
        matchFilter(filters.price, q?.price) &&
        matchFilter(filters.week52High, q?.week52High) &&
        matchFilter(filters.pe, q?.pe)
      )
    })
    arr.sort((a, b) => {
      const va = sortVal(a, quotes[a.symbol], sort.key)
      const vb = sortVal(b, quotes[b.symbol], sort.key)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [items, quotes, sort, filters])

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'symbol' ? 'asc' : 'desc' },
    )
  const activeFilterCount = Object.values(filters).filter((f) => f.value !== '').length
  const setFilter = (key, patch) => setFilters((f) => ({ ...f, [key]: { ...f[key], ...patch } }))
  const clearFilters = () =>
    setFilters((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { ...v, value: '' }])))

  const gridScroll = useDragScroll() // mouse grab-to-scroll for the ticker table

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Stocks & Crypto"
        subtitle={
          hasPositions
            ? hasFinnhubKey
              ? 'Live via Finnhub'
              : 'Demo data — add VITE_FINNHUB_API_KEY for live quotes'
            : 'Watchlist — add a quantity to a symbol to track its value and daily P&L.'
        }
      />

      {/* Watchlist bar: shows 7 at a time, swipe or arrow to scroll. The New
          Watchlist button sits above, right-aligned with the bar's right arrow. */}
      <div className="mb-4 w-fit">
        <div className="mb-2 flex justify-end">
          <Button className="px-4 py-2" onClick={() => setListDraft({ name: '' })}>
            <span className="flex items-center gap-2"><PlusIcon className="h-4 w-4" /> New Watchlist</span>
          </Button>
        </div>
        <ScrollTabs
          tabs={watchlists.map((w) => ({ id: w.id, label: w.name }))}
          active={active?.id}
          onChange={setActiveId}
          onAdd={() => setListDraft({ name: '' })}
          visible={7}
        />
      </div>

      {/* Active list actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-gray-400">
          {activeFilterCount > 0
            ? `${rows.length} of ${items.length} symbols`
            : `${items.length} symbol${items.length === 1 ? '' : 's'}`}
        </span>
        <Button variant="ghost" className="px-4 py-2" onClick={() => setSymbolDraft({ symbol: '', name: '', qty: '', alertPrice: '', alertDir: 'above' })}>
          <span className="flex items-center gap-2"><PlusIcon className="h-4 w-4" /> Add Symbol</span>
        </Button>
        <Button
          variant={activeFilterCount > 0 ? 'primary' : 'ghost'}
          className="px-4 py-2"
          onClick={() => setFiltering(true)}
        >
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
        <Button variant="ghost" className="px-4 py-2" onClick={() => setListDraft({ id: active.id, name: active.name })}>
          Rename
        </Button>
        <Button variant="danger" className="px-4 py-2" onClick={deleteList} disabled={watchlists.length <= 1}>
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Value / P&L summary — only when the list has share quantities */}
      {hasPositions && (
        <Card className="mb-4" glow>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-sm text-gray-400">{active.name} Value</div>
              <div className="font-mono text-4xl font-bold text-white">{money(total)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Today&apos;s P&amp;L</div>
              <div className={['font-mono text-3xl font-bold', up ? 'text-gain' : 'text-loss'].join(' ')}>
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
      )}

      {/* Symbol grid */}
      {items.length === 0 ? (
        <Card className="text-center text-gray-500">No symbols yet. Add one to get started.</Card>
      ) : rows.length === 0 ? (
        <Card className="text-center text-gray-500">No symbols match the filters.</Card>
      ) : (
        <Card className="p-0">
          {/* Own scroll area: fat scrollbar, native touch scroll, and mouse
              grab-to-drag (press and pan up/down). */}
          <div
            ref={gridScroll.ref}
            {...gridScroll.handlers}
            className="scroll-fat cursor-grab overflow-auto active:cursor-grabbing"
            style={{
              maxHeight: hasPositions ? 'calc(100vh - 24rem)' : 'calc(100vh - 18rem)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr>
                <SortTh label="Symbol" k="symbol" sort={sort} onSort={toggleSort} align="left" />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Trend
                </th>
                <SortTh label="Last" k="price" sort={sort} onSort={toggleSort} />
                <SortTh label="Net Chg" k="change" sort={sort} onSort={toggleSort} />
                <SortTh label="Change %" k="changePercent" sort={sort} onSort={toggleSort} />
                <SortTh label="52W High" k="week52High" sort={sort} onSort={toggleSort} />
                <SortTh label="P/E" k="pe" sort={sort} onSort={toggleSort} />
                <SortTh label="Last Div" k="dividend" sort={sort} onSort={toggleSort} />
                {hasPositions && <SortTh label="Qty" k="qty" sort={sort} onSort={toggleSort} />}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const q = quotes[it.symbol]
                const hUp = q?.changePercent != null ? q.changePercent >= 0 : true
                const chg = hUp ? 'text-gain' : 'text-loss'
                const fired = alertTriggered(it.alert, q?.price)
                return (
                  <tr key={it.symbol} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSymbolDraft({
                            symbol: it.symbol,
                            name: it.name || '',
                            qty: it.qty || '',
                            alertPrice: it.alert?.price ?? '',
                            alertDir: it.alert?.dir || 'above',
                            original: it.symbol,
                          })
                        }
                        className="text-left active:opacity-70"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{display(it.symbol)}</span>
                          {it.alert && (
                            <span
                              className={[
                                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold',
                                fired ? 'animate-pulse' : '',
                              ].join(' ')}
                              style={
                                fired
                                  ? { backgroundColor: '#D2992226', color: '#D29922' }
                                  : { color: '#6E7681' }
                              }
                              title={`Alert ${it.alert.dir === 'above' ? '≥' : '≤'} ${money(it.alert.price)}`}
                            >
                              <BellIcon className="h-3 w-3" />
                              {fired ? `Hit ${money(it.alert.price)}` : `${it.alert.dir === 'above' ? '≥' : '≤'} ${money(it.alert.price)}`}
                            </span>
                          )}
                        </div>
                        {it.name && <div className="text-xs text-gray-400">{it.name}</div>}
                      </button>
                    </td>
                    <td className="px-3 py-1">
                      {q?.price != null && <Sparkline data={seriesFromQuote(it.symbol, q)} up={hUp} width={84} height={26} />}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white">{q?.price != null ? money(q.price) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-mono ${chg}`}>
                      {q?.change != null ? `${hUp ? '+' : '−'}${money(Math.abs(q.change))}` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${chg}`}>
                      {q?.changePercent != null ? `${hUp ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {q?.week52High != null ? money(q.week52High) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {q?.pe != null ? q.pe.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      {q?.dividend ? money(q.dividend) : '—'}
                    </td>
                    {hasPositions && (
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{it.qty || '·'}</td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeSymbol(it.symbol)}
                        aria-label={`Remove ${display(it.symbol)}`}
                        className="rounded-lg p-1.5 text-gray-600 active:scale-95 active:text-loss"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-gray-600">
        {hasFinnhubKey && (
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${connected ? 'bg-gain' : 'bg-loss'}`}
            title={connected ? 'Connected to Finnhub' : 'Finnhub unavailable or rate-limited'}
          />
        )}
        <span>
          {!hasFinnhubKey && 'Demo data · '}
          {loading ? 'Updating…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : ''}
        </span>
      </div>

      {/* New / rename watchlist */}
      <Modal
        open={!!listDraft}
        onClose={() => setListDraft(null)}
        title={listDraft?.id ? 'Rename Watchlist' : 'New Watchlist'}
        size="narrow"
        footer={
          <>
            <Button variant="ghost" onClick={() => setListDraft(null)}>Cancel</Button>
            <Button onClick={saveList}>Save</Button>
          </>
        }
      >
        {listDraft && (
          <input
            autoFocus
            className={fieldClass}
            placeholder="Watchlist name (e.g. Tech, Dividends)"
            value={listDraft.name}
            onChange={(e) => setListDraft({ ...listDraft, name: e.target.value })}
          />
        )}
      </Modal>

      {/* Add / edit symbol */}
      <Modal
        open={!!symbolDraft}
        onClose={() => setSymbolDraft(null)}
        title={symbolDraft?.original ? 'Edit Symbol' : 'Add Symbol'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSymbolDraft(null)}>Cancel</Button>
            <Button onClick={saveSymbol}>Save</Button>
          </>
        }
      >
        {symbolDraft && (
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Symbol</label>
              <input
                autoFocus
                className={`${fieldClass} font-mono uppercase`}
                placeholder="AAPL or BINANCE:BTCUSDT"
                value={symbolDraft.symbol}
                onChange={(e) => setSymbolDraft({ ...symbolDraft, symbol: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-600">Crypto uses an exchange prefix, e.g. BINANCE:BTCUSDT.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Name (optional)</label>
              <input
                className={fieldClass}
                placeholder="Apple"
                value={symbolDraft.name}
                onChange={(e) => setSymbolDraft({ ...symbolDraft, name: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-gray-500">Quantity (optional — for value & P&amp;L)</label>
              <input
                type="number"
                min={0}
                step="any"
                className={fieldClass}
                placeholder="0"
                value={symbolDraft.qty}
                onChange={(e) => setSymbolDraft({ ...symbolDraft, qty: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-gray-500">Price alert (optional)</label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-border bg-bg p-1">
                  {['above', 'below'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSymbolDraft({ ...symbolDraft, alertDir: d })}
                      className={[
                        'rounded-lg px-4 py-2 text-sm font-semibold capitalize active:scale-95',
                        symbolDraft.alertDir === d ? 'bg-accent/15 text-accent shadow-glow' : 'text-gray-400',
                      ].join(' ')}
                    >
                      {d === 'above' ? 'At or above' : 'At or below'}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={`${fieldClass} flex-1`}
                  placeholder="Target price"
                  value={symbolDraft.alertPrice}
                  onChange={(e) => setSymbolDraft({ ...symbolDraft, alertPrice: e.target.value })}
                />
                {symbolDraft.alertPrice !== '' && (
                  <Button variant="ghost" className="px-4 py-2" onClick={() => setSymbolDraft({ ...symbolDraft, alertPrice: '' })}>
                    Clear
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-600">Shows a 🔔 alert on the symbol when its price crosses this target.</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Filter */}
      <Modal
        open={filtering}
        onClose={() => setFiltering(false)}
        title="Filter Symbols"
        size="narrow"
        footer={
          <>
            <Button variant="ghost" onClick={clearFilters}>Clear all</Button>
            <Button onClick={() => setFiltering(false)}>Done</Button>
          </>
        }
      >
        <div className="space-y-4">
          {FILTER_FIELDS.map((field) => {
            const f = filters[field.key]
            return (
              <div key={field.key} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 text-sm text-gray-300">{field.label}</span>
                <div className="flex gap-1">
                  {OPS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setFilter(field.key, { op: o.id })}
                      className={[
                        'h-11 w-11 rounded-lg font-mono text-lg font-bold active:scale-95',
                        f.op === o.id ? 'bg-accent/15 text-accent shadow-glow' : 'bg-white/5 text-gray-400',
                      ].join(' ')}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  step="any"
                  className={`${fieldClass} flex-1`}
                  placeholder="any"
                  value={f.value}
                  onChange={(e) => setFilter(field.key, { value: e.target.value })}
                />
              </div>
            )
          })}
          <p className="text-xs text-gray-600">
            “=” matches to the nearest whole number. Leave a value blank to ignore that filter.
          </p>
        </div>
      </Modal>
    </div>
  )
}
