# Home Center

A Raspberry Pi touchscreen dashboard — a single-page React app built for a 1080p
display running Chromium in kiosk mode. Every control is tap-friendly with large
touch targets and no hover-only interactions.

## Features

- **Home** — a customizable dashboard summarizing the day, landing page of the
  app. Pick which modules to show/hide, drag to reorder them, add more from the
  customize screen, and configure each one in place: favorite Smart Home
  controls, a chosen Stocks/Crypto watchlist with live quotes, today's planned
  meals (breakfast/lunch/dinner), a chosen Goals list (interactive), today's
  calendar events, and **Traffic** routes showing live drive time with current
  traffic from Google (set a start + destination; add as many routes as you
  like). To keep API usage minimal, Traffic only polls during commute windows
  (6–8am and 4–6pm), every 5 minutes, and only while the dashboard tab is
  visible. Layout and per-module settings persist via Firestore like the rest of
  the app.
- **Smart Home** — light toggles with brightness sliders by room, TV/media
  controls (power, volume, input), and a smart-plug on/off card grid. Uses mock
  state today; structured so Home Assistant calls can be swapped in later (see
  the controller helpers in `src/pages/SmartHome.jsx`).
- **Stocks & Crypto** — portfolio value + daily P&L, holdings with price,
  % change, and a per-asset sparkline. Separate Stocks / Crypto tabs. Live data
  from the [Finnhub API](https://finnhub.io/) when a key is set, mock data
  otherwise.
- **Calendar** — Month / Week / Day views (weeks start Sunday), tap any slot to
  add an event, color-coded categories, today always highlighted.
- **Meals** — split into tabbed subpages (Schedule / Household / Meals /
  Groceries) so each fits without scrolling on a touchscreen. *Schedule* is the
  weekly planner grid (Sun–Sat × Breakfast/Lunch/Dinner) with a week navigator
  and color-coded slots; members can be assigned per meal as providers
  (cooking/bringing) or guests (eating). *Household* gives each member their own
  card listing the meals/takeout they like to make or order. *Meals* is the
  recipe/takeout library, and *Groceries* is the per-week auto-generated,
  checkable grocery list.
- **Goals** — color-coded lists tracked by week (weeks start Sunday), browsable
  with a week navigator. Each goal is a checkbox, tally boxes, or a sub-item
  checklist. A completion summary ring sits atop each list.

All data (goals, meals, events, smart-home state, watchlists) is stored in
**Cloud Firestore**, so it's shared live across every browser/device pointed at
the same Firebase project — edits on one screen show up on the others. A
`localStorage` cache mirrors everything for instant loads and offline use, then
syncs back when the connection returns.

### Firestore setup

State lives in one document per key under an `appState` collection (the value is
stored as a JSON string). The web SDK config is in `src/lib/firebase.js`. Because
the app has no user auth, the project's **Firestore security rules** must allow
reading/writing that collection, e.g.:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appState/{doc} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ These rules are open to anyone with the project config. Fine for a private
> household dashboard on a trusted network; add Firebase Auth and tighten the
> rules if you expose it publicly.

## Tech stack

Vite + React + Tailwind CSS, React Router for navigation, and Recharts for
sparklines and the goals summary ring.

## Design tokens

| Token        | Value     |
| ------------ | --------- |
| Background   | `#0D1117` |
| Card surface | `#161B22` |
| Border       | `#30363D` |
| Accent       | `#58A6FF` |
| Gain         | `#39D353` |
| Loss         | `#F85149` |

Fonts: **Inter** for UI, **JetBrains Mono** for numbers and data.

## Getting started

```bash
npm install
cp .env.example .env   # optional: add VITE_FINNHUB_API_KEY for live quotes
npm run dev
```

Open http://localhost:5173.

### Build & preview

```bash
npm run build
npm run preview -- --host
```

## Configuration

- `VITE_FINNHUB_API_KEY` — Finnhub API key for live stock/crypto quotes. Without
  it, the Stocks page renders deterministic demo data.
- `VITE_GOOGLE_MAPS_API_KEY` — Google Maps Platform key for the dashboard Traffic
  module's live drive times (enable the **Routes API** on the key). Without it,
  the Traffic module shows demo estimates.
- Edit holdings in `DEFAULT_PORTFOLIO` (`src/pages/Stocks.jsx`) or override via
  the `home-center:portfolio` localStorage key.

## Hosting on GitHub Pages

This repo ships a workflow (`.github/workflows/deploy.yml`) that builds the app
and deploys it to GitHub Pages on every push to `main`.

1. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
2. (Optional) Add `VITE_FINNHUB_API_KEY` and/or `VITE_GOOGLE_MAPS_API_KEY`
   repository secrets (**Settings → Secrets and variables → Actions**) for live
   quotes and live traffic. The workflow passes both into the build.
   Note: client builds inline these values into the public bundle, so only use
   keys you're comfortable exposing — restrict them (HTTP referrer / API
   restrictions) in their respective consoles.
3. Push to `main` (or run the workflow manually from the **Actions** tab).

The site publishes to `https://<owner>.github.io/home-center/`. Production
builds use a base path of `/home-center/` to match the project-pages subpath
(routing uses `HashRouter`, so deep links work). If you rename the repo or use a
custom domain, override it: `VITE_BASE=/your-base/ npm run build` (or set the
`VITE_BASE` env var in the workflow).

## Touch input

The app ships its own **on-screen keyboard** (`src/components/VirtualKeyboard.jsx`),
so no OS-level virtual keyboard is needed. Focusing any text field raises a full
QWERTY layout; focusing a number field raises a numeric keypad with large +/−
stepper buttons. Date/time fields use the browser's native picker and the
brightness/volume sliders stay tap-only. This works in any modern browser on any
platform — a Raspberry Pi, a mini PC, or a tablet — because it's all in-app.

## Kiosk mode

Point the app at the built site (or `npm run dev`) and launch the browser
fullscreen. The same app runs on a Raspberry Pi or a mini PC.

**Raspberry Pi / Linux (Chromium):**

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --check-for-update-interval=31536000 http://localhost:4173
```

**Mini PC — Windows (Chrome or Edge):**

```bat
chrome.exe  --kiosk --no-first-run --disable-pinch http://localhost:4173
msedge.exe  --kiosk --no-first-run --disable-pinch http://localhost:4173
```

**Mini PC — Linux (Chrome/Chromium):** same flags as the Pi above.

You can point any of these at the GitHub Pages URL instead of a local server.
The app uses a fixed full-height layout with overflow hidden, so it fills the
screen cleanly in kiosk mode. To run a real (non-kiosk) browser fullscreen,
press `F11`.

## Project structure

```
src/
  components/   shared UI (Sidebar, Card, Toggle, Slider, Tabs, Sparkline,
                ProgressRing, Modal, Icons)
  pages/        one file per page (Dashboard, SmartHome, Stocks, Calendar,
                Meals, Goals)
  lib/          firebase (Firestore init), storage (Firestore-backed state
                hook with localStorage cache), finnhub (API client), and
                seeds (default state shared by pages + the dashboard)
```
