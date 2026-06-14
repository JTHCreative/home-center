import { useCallback, useEffect, useMemo, useState } from 'react'
import Card, { PageHeader } from '../components/Card.jsx'
import ScrollTabs from '../components/ScrollTabs.jsx'
import Sparkline from '../components/Sparkline.jsx'
import Modal, { Button, fieldClass } from '../components/Modal.jsx'
import { fetchMetrics, fetchQuotes, hasFinnhubKey } from '../lib/finnhub.js'
import { useLocalState } from '../lib/storage.js'
import { ChevronDown, ChevronUp, PlusIcon, TrashIcon } from '../components/Icons.jsx'

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
  return { price, change, changePercent, previousClose: price - change, week52High, pe }
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

// Parse pasted text (from Robinhood Legend or anywhere) into watchlist items.
// Accepts one symbol per line or comma/space separated, optionally "SYMBOL, qty".
function parseSymbols(text) {
  const seen = new Set()
  const items = []
  for (const line of text.split(/[\n,]+/)) {
    const parts = line.trim().split(/[\s|]+/).filter(Boolean)
    if (!parts.length) continue
    const symbol = parts[0].toUpperCase()
    if (!/^[A-Z0-9.:]+$/.test(symbol) || seen.has(symbol)) continue
    seen.add(symbol)
    const qty = Number(parts[1])
    items.push({ symbol, name: '', qty: Number.isFinite(qty) ? qty : 0 })
  }
  return items
}

export default function Stocks() {
  // Key is versioned (-v2) so the imported Robinhood lists replace the earlier
  // demo Stocks/Crypto defaults on devices that already seeded them.
  const [watchlists, setWatchlists] = useLocalState('watchlists-v2', DEFAULT_WATCHLISTS)
  const [activeId, setActiveId] = useState(watchlists[0]?.id)
  const [quotes, setQuotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)

  const [listDraft, setListDraft] = useState(null) // { id?, name }
  const [symbolDraft, setSymbolDraft] = useState(null) // { symbol, name, qty, original? }
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')
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

  const load = useCallback(async () => {
    const syms = symbolsKey ? symbolsKey.split(',') : []
    if (!syms.length) {
      setLoading(false)
      return
    }
    setLoading(true)
    let result
    if (hasFinnhubKey) {
      const [liveQ, liveM] = await Promise.all([fetchQuotes(syms), fetchMetrics(syms)])
      result = Object.fromEntries(
        syms.map((s) => {
          const base = mockQuote(s)
          const q = liveQ[s] || {}
          const m = liveM[s] || {}
          return [
            s,
            {
              price: q.price ?? base.price,
              change: q.change ?? base.change,
              changePercent: q.changePercent ?? base.changePercent,
              previousClose: q.previousClose ?? base.previousClose,
              week52High: m.week52High ?? base.week52High,
              pe: m.pe ?? base.pe,
            },
          ]
        }),
      )
    } else {
      result = Object.fromEntries(syms.map((s) => [s, mockQuote(s)]))
    }
    setQuotes((prev) => ({ ...prev, ...result }))
    setUpdatedAt(new Date())
    setLoading(false)
  }, [symbolsKey])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000) // refresh each minute
    return () => clearInterval(id)
  }, [load])

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
    patchItems((list) => {
      const idx = list.findIndex((i) => i.symbol === (symbolDraft.original || symbol))
      if (idx >= 0) return list.map((i, k) => (k === idx ? item : i))
      return [...list, item]
    })
    setSymbolDraft(null)
  }
  const removeSymbol = (symbol) => patchItems((list) => list.filter((i) => i.symbol !== symbol))

  const runImport = () => {
    const parsed = parseSymbols(importText)
    if (!parsed.length) return
    const name = importName.trim()
    if (name) {
      const id = crypto.randomUUID()
      setWatchlists((ws) => [...ws, { id, name, items: parsed }])
      setActiveId(id)
    } else {
      patchItems((list) => {
        const have = new Set(list.map((i) => i.symbol))
        return [...list, ...parsed.filter((i) => !have.has(i.symbol))]
      })
    }
    setImporting(false)
    setImportText('')
    setImportName('')
  }

  // Totals for items that have a quantity.
  let total = 0
  let dayPL = 0
  let hasPositions = false
  for (const it of items) {
    const q = quotes[it.symbol]
    if (!q || !it.qty) continue
    hasPositions = true
    total += q.price * it.qty
    dayPL += q.change * it.qty
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

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Stocks & Crypto"
        subtitle={hasFinnhubKey ? 'Live via Finnhub' : 'Demo data — add VITE_FINNHUB_API_KEY for live quotes'}
      />

      {/* Watchlist bar: shows 7 at a time, swipe or arrow to scroll */}
      <div className="mb-4 flex items-center gap-2">
        <ScrollTabs
          tabs={watchlists.map((w) => ({ id: w.id, label: w.name }))}
          active={active?.id}
          onChange={setActiveId}
          onAdd={() => setListDraft({ name: '' })}
          visible={7}
        />
        <button
          type="button"
          onClick={() => setListDraft({ name: '' })}
          aria-label="New watchlist"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/5 text-gray-300 active:scale-95"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Active list actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-gray-400">
          {activeFilterCount > 0
            ? `${rows.length} of ${items.length} symbols`
            : `${items.length} symbol${items.length === 1 ? '' : 's'}`}
        </span>
        <Button variant="ghost" className="px-4 py-2" onClick={() => setSymbolDraft({ symbol: '', name: '', qty: '' })}>
          <span className="flex items-center gap-2"><PlusIcon className="h-4 w-4" /> Add Symbol</span>
        </Button>
        <Button
          variant={activeFilterCount > 0 ? 'primary' : 'ghost'}
          className="px-4 py-2"
          onClick={() => setFiltering(true)}
        >
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </Button>
        <Button variant="ghost" className="px-4 py-2" onClick={() => setImporting(true)}>
          Import
        </Button>
        <Button variant="ghost" className="px-4 py-2" onClick={() => setListDraft({ id: active.id, name: active.name })}>
          Rename
        </Button>
        <Button variant="danger" className="px-4 py-2" onClick={deleteList} disabled={watchlists.length <= 1}>
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary */}
      <Card className="mb-6" glow={hasPositions}>
        {hasPositions ? (
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
        ) : (
          <div className="text-sm text-gray-400">
            Watchlist — add a quantity to a symbol to track its value and daily P&amp;L.
          </div>
        )}
      </Card>

      {/* Symbol grid */}
      {items.length === 0 ? (
        <Card className="text-center text-gray-500">No symbols yet. Add one or import a list.</Card>
      ) : rows.length === 0 ? (
        <Card className="text-center text-gray-500">No symbols match the filters.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full">
            <thead>
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
                {hasPositions && <SortTh label="Qty" k="qty" sort={sort} onSort={toggleSort} />}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const q = quotes[it.symbol]
                const hUp = q ? q.changePercent >= 0 : true
                const chg = hUp ? 'text-gain' : 'text-loss'
                return (
                  <tr key={it.symbol} className="border-t border-border">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setSymbolDraft({ symbol: it.symbol, name: it.name || '', qty: it.qty || '', original: it.symbol })
                        }
                        className="text-left active:opacity-70"
                      >
                        <div className="font-semibold text-white">{display(it.symbol)}</div>
                        {it.name && <div className="text-xs text-gray-400">{it.name}</div>}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {q && <Sparkline data={seriesFromQuote(it.symbol, q)} up={hUp} width={90} height={32} />}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white">{q ? money(q.price) : '—'}</td>
                    <td className={`px-3 py-3 text-right font-mono ${chg}`}>
                      {q ? `${hUp ? '+' : '−'}${money(Math.abs(q.change))}` : '—'}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-bold ${chg}`}>
                      {q ? `${hUp ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">
                      {q?.week52High != null ? money(q.week52High) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">
                      {q?.pe != null ? q.pe.toFixed(2) : '—'}
                    </td>
                    {hasPositions && (
                      <td className="px-3 py-3 text-right font-mono text-gray-400">{it.qty || '·'}</td>
                    )}
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeSymbol(it.symbol)}
                        aria-label={`Remove ${display(it.symbol)}`}
                        className="rounded-lg p-2 text-gray-600 active:scale-95 active:text-loss"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-4 text-right text-xs text-gray-600">
        {loading ? 'Updating…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : ''}
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

      {/* Import */}
      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        title="Import Symbols"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImporting(false)}>Cancel</Button>
            <Button onClick={runImport}>Import</Button>
          </>
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Paste symbols (one per line or comma-separated)
            </label>
            <textarea
              autoFocus
              rows={8}
              className={`${fieldClass} font-mono`}
              placeholder={'AAPL\nMSFT, 12\nBINANCE:BTCUSDT, 0.4'}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">New list name (optional)</label>
              <input
                className={fieldClass}
                placeholder={`Leave blank to add to “${active?.name}”`}
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500">
              From Robinhood Legend, copy your watchlist tickers and paste them here.
              Add a quantity after each symbol (e.g. <span className="font-mono">AAPL, 12</span>)
              to track value and P&amp;L. {parseSymbols(importText).length > 0 && (
                <span className="text-accent">{parseSymbols(importText).length} symbols detected.</span>
              )}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
