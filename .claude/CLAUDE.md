# sunsky-website — Public Customer Website

## STANDING RULES
- **NEVER commit `.env`, `.env.production`, or `src/utils/ip.js`** — the server holds its own live Stripe key and API URLs not in git. A clobbered env or ip.js breaks production payments.
- **`index.html` `<title>` must stay on ONE line** — `server/index.js` swaps it by regex for OG tags.
- **`server/index.js` must stay dependency-free** — deploys skip `npm install`. It imports `../src/utils/hotelImage.js` across the src boundary — keep that util Node-safe (no DOM, no Vite imports).
- **Never request the `xl` Hotelbeds CDN image variant** — 403s for many hotels. Use `hotelImageChain()` which ends at the always-present default size.
- **Toast notifications**: Use `showToast(message, "success")` / `showToast(message, "error")` for all user actions.

## What This Project Is
The public-facing SUNSKY travel booking website at holidaybooking.be. A React 19 SPA serving hotel search, flight search, transfers, and online booking with Stripe payments. Served by a dependency-free Node HTTP server behind Caddy on port 8080.

## Cross-Project Topology
See `D:\sunsky-admin\.claude\CLAUDE.md` § Cross-Project Topology for the full diagram.
- **Website → Admin** (via axios): auth, bookings, CMS, geo, hotel filters, live availability
- **Website → Cache** (via plain fetch): `/contracts/cheapest`, `/contracts/hotel-price-calendar`, `/hotels/bulk`
- **OG server → Cache**: `POST /hotels/bulk` server-side for Open Graph tags on hotel pages

## Stack
- React 19.2 + Vite 8 (JS/JSX only, no TypeScript)
- react-router-dom v7 (declarative BrowserRouter)
- Redux Toolkit 2 (single `auth` slice; everything else is local state + hooks)
- axios (admin API) + native fetch (cache API)
- @stripe/stripe-js + @stripe/react-stripe-js
- lucide-react icons
- CSS Modules (27 files) + some legacy plain .css
- Vitest 3 + Testing Library (14 test files)
- ESLint 10 flat config
- **NOTE**: README says React 18 / Router v6 — it's stale

## Source Layout
```
D:\sunsky-website\src
├── App.jsx              ← Root: Redux Provider > ToastProvider > BrowserRouter > AppRouter
├── main.jsx             ← Vite entry
├── index.css            ← Global reset/styles
├── Layout/              ← Navbar + Footer wrapper (Navbar has HeaderMenu + search)
├── api/                 ← endpoints.js (path map), index.js (feature hooks), filters.js (admin filters)
├── assets/              ← Static images (hero, logos)
├── components/          ← Shared UI (DestinationSearch, HotelImg, ProtectedRoute, Toast, etc.)
├── context/             ← ToastContext.jsx
├── hooks/               ← useApi.js (generic axios hook)
├── pages/               ← 18 route-page folders
├── routes/              ← routes.config.jsx + AppRouter.jsx
├── services/            ← axiosInstance.js (single shared axios client)
├── store/               ← configureStore + authSlice
├── test/                ← setup.js (IntersectionObserver mock with __IO__.trigger())
└── utils/               ← Pure helpers (ip.js, hotelImage.js, reviewBadge, roomBoards, etc.)
```

## API Layer (Two Backends + Stripe)

### 1. Admin Backend (axios via axiosInstance)
Base URL: `import.meta.env.VITE_API_URL || BASE_URL` from `src/utils/ip.js`
- `ip.js` convention: active line is `http://localhost:5000/api`; prod alternatives commented out
- Bearer token from localStorage, auto-refresh on 401 (single-flight), hard redirect to `/login` on failure

Endpoints: `/website/auth/*`, `/website/bookings`, `/website/favourites`, `/cms/*`, `/website/geo/*`, `/website/holiday-types`, `/hotel-filters/*`, `/hotel-availability/search`, `/flight-availability/search`, `/transfer-availability/search`, `/website/online-bookings`

### 2. Cache API (plain fetch — NOT axios)
Base URL: `const CONTRACTS_API = import.meta.env.VITE_CACHE_API_URL || 'https://cache.holidaybooking.be'`
- Defined separately in `Results.jsx:18` and `HotelDetail.jsx:17` (same constant name, same value)
- `vite.config.js` has a `/cache-api` dev proxy but src calls the host directly (proxy is dead code)
- No auth headers, no interceptors — raw `fetch()`

**Every cache call site (7 total across 3 files):**

#### POST /hotels/bulk (hotel content)
1. **Results.jsx:988-1013** — `useEffect([hotels])`. Bulk-fetches hotel info for visible cards not yet loaded. Body: `{ hotelCodes: string[] }` (codes from current page, de-duped via `infoLoadingRef` Set). **Consumed fields:** `name`, `stars`, `images[]{url,visualOrder,order,imageTypeCode}`, `cityName`, `city`, `zoneName`, `facilities[]`, `review{rate,count,type,outOf}`, `rating{kind,value}`, `countryIso`. On fail: `console.warn`, cards stay skeletal (placeholder name + fallback image).
2. **HotelDetail.jsx:389-401** — `useEffect([hotelCode, state?.info])`. Single-hotel fetch when opened via direct URL (skipped if router state has `.info` from in-app nav). Body: `{ hotelCodes: [hotelCode] }`. **Consumed fields:** same as above + `description` for the detail page. On fail: hero shows illustrated fallback, URL query params used for name/stars/location.
3. **server/index.js:68-100** — `hotelRecord(code, {wait})`. Server-side OG tag injection for `/hotel/:code`. Body: `{ hotelCodes: [code] }`. 2.5s AbortSignal timeout. 6h in-memory cache (max 1000), in-flight de-dupe. Crawlers block; humans get shell immediately. **Consumed fields:** `name`, `cityName`/`city`, `zoneName`, `stars`, `images[0].url` (rewritten via `hotelImage(url,'bigger')` for og:image), `description` (truncated 200 chars for og:description). On fail: returns null → generic OG tags or URL query param fallback.

#### GET|POST /contracts/cheapest (main search)
4. **Results.jsx:819-884** — Page-1 fetch. `useEffect([scopeKey, fetchParams, applied, priceScopeKey])`. Fires on every new search, filter/sort change, scope change. Uses `buildRequest()` (lines 689-749) which switches GET→POST when `hotelCodes.length > 150` (`LARGE_CODES` constant, line 25) OR `destinations.length > 8` (`MANY_DESTINATIONS`, line 26). **All params sent:** `destinations`, `checkIn`, `checkOut`, `adults`, `children`, `rooms`, `limit` (PAGE_SIZE=20), `pageSize`, `page` (1), `source` (`combined` or `external` for empty-search teaser), `maxAdultsPerRoom`, `maxChildrenPerRoom`, `childAges`, `boards`, `roomTypes`, `minPrice`, `maxPrice`, `priceBasis`, `refundable`, `sortBy`, `searchType` (`PACKAGE` when transport filter active), `hotelCodes` (`['__none__']` sentinel for empty facet match). **Consumed fields:** `results[]` (mapped through `mapContract()`), `nights`, `boardFacets` (sidebar checkboxes), `cheapest.hotelCode` ("Best deal" badge), `hasMore`, `total`. On fail: empty results grid, `console.error`.
5. **Results.jsx:912-958** — Pagination (`loadMore`). IntersectionObserver on sentinel element (rootMargin 400px). Same `buildRequest()` with incremented `page`. New results appended to `allHotels` (de-duped by `seenCodesRef`). On fail: scrolling stops silently.
6. **Results.jsx:892-910** — Duration counts. For each day option in travel-time band, fires separate request with modified `checkOut` and `pageSize:100`. Only reads `data.total`. On fail: count badge doesn't appear (silently caught).

#### GET /contracts/hotel-price-calendar (7-day strip)
7. **HotelDetail.jsx:608-625** — `useEffect([hotelCode, destination, baseCheckIn, baseCheckOut, sAdults, sChildren, sRooms])`. Params: `hotelCode`, `destination`, `checkIn`, `checkOut`, `adults`, `children`, `rooms`, `source=combined`, `maxAdultsPerRoom`, `maxChildrenPerRoom`. **Consumed fields:** `calendar[]{date, price, currency, isLowest}`. On fail: falls back to hardcoded demo data (`PRICE_DAYS` at lines 90-98).

**Cache-down fallback summary:**
| Call site | Fallback |
|-----------|----------|
| Results cheapest | Empty grid, no error banner |
| Results load-more | Scrolling stops |
| Results duration counts | Badge missing for that duration |
| Results /hotels/bulk | Cards keep skeletal data |
| HotelDetail /hotels/bulk | Illustrated fallback hero, URL query params |
| HotelDetail price-calendar | Hardcoded demo prices |
| Server OG /hotels/bulk | Generic site-wide OG tags (2.5s timeout) |

### 3. Stripe
Key: `VITE_STRIPE_PUBLIC_KEY` (skipped when contains 'REPLACE')
Mode: `VITE_PAYMENT_MODE` = `test` | `live` (test mode has dummy-pay fallback)

## Pages (routes.config.jsx)
**Public**: `/` Home, `/results` Results, `/hotel/:hotelCode` HotelDetail, `/packages`, `/flights`, `/flights/:id` FlightDetail, `/hotels`, `/holidays/:slug`, `/transfers`, `/about`, `/contact`, `/p/:slug` StaticPage, `/checkout`, `/checkout/return`
**No layout**: `/voucher` HotelVoucher (printable)
**Auth**: `/login`, `/register`, `/forgot-password`
**Protected**: `/account`, `/account/bookings`, `/account/bookings/:ref`, `/account/favourites`, `/account/profile`, `/account/settings`, `/booking/new`, `/booking/:ref`, `/booking/:ref/confirmation`

## Production Server (server/index.js)
Dependency-free `node:http` on PORT 8080 behind Caddy. Does:
1. Serves `dist/` with immutable caching for hashed `/assets/*`
2. SPA fallback to `index.html`
3. Open Graph rewriting for `/hotel/:code` — fetches hotel via cache `/hotels/bulk`, injects real OG title/description/image into `<head>`. 6h in-memory cache (max 1000), in-flight dedupe, 2.5s timeout for preview crawlers.

## Commands
```bash
npm run dev      # Vite dev server :5173
npm run build    # Build to dist/
npm run preview  # Preview built dist
npm start        # Production server (server/index.js :8080)
npm run test     # Vitest
npm run lint     # ESLint
```

## Deploy
Git repo: `Anil682003/sunsky-website`, branch: `master`

Server path: `C:\projects\sunsky-website\sunsky-website` on 91.134.71.79 (SSH key `~/.ssh/sunsky_deploy`, same as admin/cache). Restart PM2 **by name** (`pm2 restart sunsky-website`) — the numeric ids shuffle when processes are added or removed, and id 4 is now `flight-cache` (2026-08-23). Run `pm2 ls` if in doubt. NB: the server clock runs a day behind CET-evening (US timezone) — don't misread `dir` timestamps as stale builds.

One-prompt deploy:
```
ssh -i ~/.ssh/sunsky_deploy -o BatchMode=yes admin@91.134.71.79 "cd /d C:\projects\sunsky-website\sunsky-website && git pull && npm run build && pm2 restart sunsky-website && pm2 logs sunsky-website --lines 6 --nostream"
```
No `npm install` — that's why server/index.js must be dependency-free. The server repo carries local commits (env files) — `git pull` merges; that's normal.

## Env Vars
Build-time (baked into bundle by Vite):
- `VITE_API_URL` — admin backend base URL
- `VITE_CACHE_API_URL` — cache API base URL  
- `VITE_STRIPE_PUBLIC_KEY` — Stripe publishable key
- `VITE_PAYMENT_MODE` — `test` | `live`

Runtime (server/index.js):
- `PORT` (8080)
- `CACHE_API` — cache URL for OG tag fetching

## Key Gotchas
1. **`.env` and `.env.production` ARE tracked in git** (.gitignore lacks .env) — the server's copy is authoritative, never push changes to these files
2. **`CHILD_AGE_DEFAULT=8`** in Results.jsx — Hotelbeds 400s on a child without an age
3. **Filter activity codes can be group-qualified** (`"74:620"`) — Number-coercing drops the group prefix and over-matches
4. **`fetchFacets` has opt-in codes/attrs flags** — whole-country response is ~1MB with both, ~7KB without
5. **Auth tokens in localStorage** — refresh failure hard-redirects to `/login` (state loss by design)
6. **No i18n framework** — UI copy is hardcoded English; CMS text can be any language
7. **Hero title uses `*asterisk*` markup** for the gold-script segment (legacy fallback highlights literal "sun"/"zon")
8. **`hotelImage.js` is imported by both Vite and Node** (`server/index.js`) — keep it isomorphic
9. **vite.config.js pins `esbuild jsx:'automatic'`** — Vitest needs it; `test.css:true` for CSS module classNames in tests
10. **Known bugs** (README SunSky-Pending-Tasks.md): one-way flight retDate crash, departure airport hardcoded BRU, supplier ref hardcoded in Confirmation/Voucher

## Key Docs
- `README.md` — deploy + OG server docs (version numbers stale)
- `BACKEND-DECISION.md` — why the site reuses sunsky-admin backend
- `SunSky-Pending-Tasks.md` — known bugs and pending work
