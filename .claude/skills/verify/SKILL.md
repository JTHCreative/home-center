---
name: verify
description: Build, run, and drive home-center to verify a change end-to-end.
---

# Verifying home-center changes

Vite + React kiosk dashboard. No test suite — verify by driving the app.

## Build / launch

```bash
npm install                 # fresh containers have no node_modules
npm run lint                # eslint (Dashboard.jsx has 2 pre-existing react-refresh warnings)
npm run dev                 # serves http://localhost:5173/
```

## Driving it headlessly

Playwright is installed globally (not in this repo). Run scripts with:

```bash
NODE_PATH=/opt/node22/lib/node_modules node your-script.js
```

Gotchas that cost time:

- **Chromium path**: launch with
  `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`
  (the bare `/opt/pw-browsers/chromium` dir has no binary), and
  `args: ['--no-proxy-server']` — otherwise localhost goes through the
  outbound proxy and connections reset.
- **HashRouter**: routes are `http://localhost:5173/#/goals`, `#/meals`, etc.
  Plain `/goals` renders the dashboard (which embeds its own Goals widget —
  easy to match the wrong elements).
- **Seeding state**: `useLocalState` (src/lib/storage.js) reads localStorage
  keys prefixed `home-center:` (e.g. `home-center:goals-sections`) and JSON
  encoded. Seed via `page.evaluate` on `/`, then navigate to the hash route.
  Firestore sync fails offline and falls back to the cache — the console
  errors are expected.
- Section/item drags use dnd-kit with a 6px pointer activation distance:
  `mouse.down()`, then `mouse.move(..., { steps: 10+ })`, then `mouse.up()`.
