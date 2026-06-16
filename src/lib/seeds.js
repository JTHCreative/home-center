// Seed defaults shared between the source pages and the Home dashboard, which
// renders compact live views of the same persisted state. Keeping them here (a
// plain module with no component exports) lets both sides import one source of
// truth without tripping React Fast Refresh's "components only" rule.

// --- Smart Home ---------------------------------------------------------------
// To wire up Home Assistant later, replace the body of the SmartHome page's
// `commit*` helpers with REST/WebSocket calls and keep the optimistic update.
export const DEFAULT_SMART_HOME = {
  lights: {
    'Living Room': [
      { id: 'lr-ceiling', name: 'Ceiling', on: true, brightness: 80 },
      { id: 'lr-lamp', name: 'Floor Lamp', on: false, brightness: 40 },
    ],
    Kitchen: [
      { id: 'kt-main', name: 'Main', on: true, brightness: 100 },
      { id: 'kt-under', name: 'Under Cabinet', on: false, brightness: 60 },
    ],
    Bedroom: [
      { id: 'bd-ceiling', name: 'Ceiling', on: false, brightness: 50 },
      { id: 'bd-night', name: 'Nightstand', on: true, brightness: 25 },
    ],
  },
  media: { power: true, volume: 35, input: 'HDMI 1' },
  plugs: [
    { id: 'plug-coffee', name: 'Coffee Maker', on: false },
    { id: 'plug-fan', name: 'Bedroom Fan', on: true },
    { id: 'plug-3d', name: '3D Printer', on: false },
    { id: 'plug-xmas', name: 'Porch Lights', on: true },
    { id: 'plug-desk', name: 'Desk Setup', on: true },
    { id: 'plug-charger', name: 'Charging Dock', on: false },
  ],
}

// --- Stocks & Crypto ----------------------------------------------------------
// Watchlists: named lists of symbols. `symbol` is the Finnhub symbol; crypto
// uses exchange-prefixed symbols (e.g. BINANCE:BTCUSDT). `qty` is optional.
// Default lists were imported from the user's Robinhood Legend watchlists.
const mkList = (id, name, symbols) => ({
  id,
  name,
  items: symbols.map((symbol) => ({ symbol, name: '', qty: 0 })),
})

export const DEFAULT_WATCHLISTS = [
  mkList('wl-growth', 'Growth Fund', [
    'NEM', 'RYCEY', 'TSLA', 'BLOK', 'ABNB', 'DOCU', 'GOOGL', 'HOOD', 'BRK.B',
    'CSGP', 'BABA', 'NVDA', 'AMZN', 'BA', 'DUOL', 'BLCN', 'AAPL', 'PLTR', 'RKT',
  ]),
  mkList('wl-dividend', 'Dividend Fund', [
    'VZ', 'STK', 'STAG', 'BSTZ', 'ARCC', 'O', 'SCHD', 'PG', 'VYM', 'JNJ', 'CVX',
    'COST', 'JEPI', 'FDVV', 'KO', 'MAIN', 'IBM', 'BIPC',
  ]),
  mkList('wl-ira', 'IRAs', [
    'AMD', 'UAL', 'DAL', 'VYM', 'VTR', 'IVV', 'SPY', 'VOO', 'COST', 'SCHB',
    'VONG', 'MSFT', 'DIS', 'CSCO',
  ]),
  mkList('wl-eyeson', 'Eyes On', [
    'ROKU', 'RIVN', 'STUB', 'KEYS', 'LUV', 'CMG', 'SCHW', 'RGTI', 'AMC', 'TGT',
    'TTD', 'U', 'GEMI', 'TSM', 'OTIS', 'F', 'WAL', 'PYPL', 'IONQ', 'GM', 'ROP',
    'LCID', 'WMT', 'ARKF', 'PFE', 'META', 'MCD', 'TOL', 'DHI', 'COIN', 'CRM',
    'KLAR', 'UBER', 'NFLX', 'SNAP', 'ZG', 'QBTS', 'PTON', 'GME', 'AI', 'LLY',
    'LULU', 'RVI', 'SNOW', 'SNDL', 'BRLT', 'LEN', 'PINS', 'ADBE',
  ]),
]

// --- Goals --------------------------------------------------------------------
export const GOALS_SEED = [
  { id: crypto.randomUUID(), title: "Justin's Goals", color: '#39D353', items: [] },
  { id: crypto.randomUUID(), title: "Kitty's Goals", color: '#F0883E', items: [] },
  { id: crypto.randomUUID(), title: 'Weekly Goals', color: '#58A6FF', items: [] },
]

// --- Meals --------------------------------------------------------------------
// A meal is either a custom 'recipe' (with ingredients) or 'takeout' (purchased).
export const SEED_MEALS = [
  {
    id: 'r-oats',
    type: 'recipe',
    name: 'Overnight Oats',
    ingredients: ['Rolled oats', 'Milk', 'Chia seeds', 'Honey', 'Blueberries'],
    instructions: 'Combine oats, milk, and chia. Refrigerate overnight. Top with honey and blueberries.',
  },
  {
    id: 'r-tacos',
    type: 'recipe',
    name: 'Chicken Tacos',
    ingredients: ['Chicken breast', 'Tortillas', 'Lime', 'Onion', 'Cilantro', 'Avocado'],
    instructions: 'Season and grill chicken. Warm tortillas. Assemble with onion, cilantro, lime, and avocado.',
  },
]

// Household members (providers/guests on planned meals reference these by id).
export const SEED_MEMBERS = [
  { id: crypto.randomUUID(), name: 'Justin', color: '#58A6FF' },
  { id: crypto.randomUUID(), name: 'Kitty', color: '#F0883E' },
]
