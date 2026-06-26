# SunSky Website — Frontend

B2C travel booking website for hotel packages and flights. Built with React + Vite.

**Live:** [holidaybooking.be](https://holidaybooking.be)  
**Admin:** [admin.holidaybooking.be](https://admin.holidaybooking.be)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| State | Redux Toolkit |
| Routing | React Router v6 |
| Payments | Stripe (`@stripe/react-stripe-js`) |
| HTTP | Axios |
| Icons | Lucide React |
| Styles | CSS Modules |

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Dev server runs at **http://localhost:5173**

### Build for Production

```bash
npm run build       # outputs to /dist
npm run preview     # preview the production build locally
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Backend API (local dev)
VITE_API_URL=http://localhost:5000/api

# Hotel contracts cache API
VITE_CACHE_API_URL=https://cache.holidaybooking.be

# Stripe public key
VITE_STRIPE_PUBLIC_KEY=pk_test_...

# Payment mode: 'test' or 'live'
VITE_PAYMENT_MODE=test
```

For production, set these in `.env.production`:

```env
VITE_API_URL=https://admin.holidaybooking.be/api
VITE_CACHE_API_URL=https://cache.holidaybooking.be
VITE_STRIPE_PUBLIC_KEY=pk_live_...
VITE_PAYMENT_MODE=live
```

> **Never commit `.env.production` with live Stripe keys to git.**

---

## Project Structure

```
src/
├── pages/
│   ├── Home/              # Landing page + Hero search
│   │   └── sections/      # Hero, Destinations, Hotels, etc.
│   ├── Results/           # Hotel search results (infinite scroll)
│   ├── HotelDetail/       # Hotel detail + room/flight selection
│   ├── Flights/           # Flights-only search results
│   ├── FlightDetail/      # Flight detail + booking
│   ├── Checkout/          # Multi-step checkout + Stripe payment
│   │   └── Confirmation   # Post-booking confirmation page
│   ├── Voucher/           # Hotel voucher (printable)
│   ├── Account/           # My Bookings, Profile, Settings
│   ├── Auth/              # Login, Register
│   └── Booking/           # Booking detail view
├── components/            # Shared UI components
├── store/                 # Redux store + slices (auth, etc.)
├── services/              # Axios instance + API helpers
└── App.jsx                # Routes
```

---

## Key Flows

### Hotel Package Booking
```
Home (Hero search)
  → /results          (browse + filter hotels, infinite scroll)
  → /hotel/:id        (select room, flight, dates)
  → /checkout         (customer info → insurance → payment)
  → /confirmation     (booking confirmed + voucher)
```

### Flights Only
```
Home (Flights tab in Hero)
  → /flights          (search results from Airtuerk)
  → /flight/:id       (select outbound + return leg)
  → /checkout         (same checkout flow)
```

### User Account
```
/login  or  /register
  → /account/bookings   (list of user's bookings)
  → /account/profile    (user details)
```

---

## APIs

| API | Base URL | Purpose |
|-----|----------|---------|
| Backend | `VITE_API_URL` | Bookings, auth, payments, admin |
| Cache API | `VITE_CACHE_API_URL` | Hotel contracts + cheapest pricing |
| Stripe | (SDK) | Card payment processing |

### Key Endpoints Used

```
POST   /website/online-bookings                        # Create booking
POST   /website/online-bookings/:id/create-payment-intent
POST   /website/online-bookings/:id/payment
POST   /website/online-bookings/:id/confirm
GET    /website/my-bookings                            # User's bookings (auth required)

GET    /contracts/cheapest?destination=AYT&page=1     # Hotel results (paginated)
POST   /hotels/bulk                                    # Hotel info batch fetch

POST   /hotel-availability/search                      # Live room pricing
POST   /flight-availability/search                     # Airtuerk live flights
```

---

## Payment Modes

| Mode | Behaviour |
|------|-----------|
| `test` | Uses test Stripe key; dummy payment allowed if Stripe unavailable |
| `live` | Uses live Stripe key; real card required; no dummy fallback |

Switch via `VITE_PAYMENT_MODE` in the env file.

---

## Pending Tasks

### Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Hotel search (Results page) | Working | Infinite scroll with page-based pagination |
| Hotel detail / room selection | Working | Room pricing via live availability API |
| Hotel + flight package booking | Working | End-to-end, Stripe payment |
| Flights-only booking (Airtuerk) | Partial | Search works; end-to-end booking not verified |
| User registration / login | Working | JWT auth, Redux store |
| My Bookings page | Partial | List loads; no detail click-through |
| Voucher download | Not Done | UI placeholder only |
| Admin panel (sunsky-admin) | Partial | See separate repo |

---

### Critical Bugs (P0 / P1)

| # | Issue | File | Line | Priority |
|---|-------|------|------|----------|
| 1 | One-way flight crash — `retDate.replace()` called on undefined | `HotelDetail.jsx` | ~513 | P0 |
| 2 | Departure airport hardcoded to `BRU` (Brussels) — not dynamic from search | `HotelDetail.jsx` | 7 | P0 |
| 3 | Supplier reference hardcoded as `'77-4446011'` on confirmation + voucher | `Confirmation.jsx:167`, `HotelVoucher.jsx:39` | — | P1 |
| 4 | Hotel contact details hardcoded (phone/fax/email/website) | `Confirmation.jsx` | 190–194 | P1 |
| 5 | Flights "From" dropdown limited to hardcoded UK airports only | `Hero.jsx` | 19–28 | P1 |
| 6 | Rooms count not updated in Results sidebar re-search | `Results.jsx` | — | P1 |

### Medium Priority (P2)

| # | Issue | Notes |
|---|-------|-------|
| 7 | No individual booking detail view from My Bookings | Needs `/account/bookings/:id` route |
| 8 | Voucher PDF download from My Bookings | Not implemented |
| 9 | Flights-only end-to-end test via Airtuerk | Booking flow untested |
| 10 | Live Stripe payment end-to-end test | Test mode works; live mode not verified |

### Server / Production Tasks

| # | Task |
|---|------|
| 11 | Run `recalculateBookingTotals.js --id 4 --apply` on prod to fix grandTotal=0 for booking 4 |
| 12 | Run `patchCountryNames.js` on prod to fill null country names |
| 13 | Update `CORS_ORIGIN` env var on production server |
| 14 | Pricing Overview section in admin panel (3-row, 12-card dashboard) |

### Estimated Timeline

| Phase | Tasks | Estimate |
|-------|-------|----------|
| P0 Bug fixes | Items 1–2 | 1–2 days |
| P1 Bug fixes | Items 3–6 | 2–3 days |
| Flights-only E2E | Item 9 | 1–2 days |
| My Bookings detail | Items 7–8 | 2–3 days |
| Production server fixes | Items 11–14 | 1 day |
| QA + live payment test | Item 10 | 1–2 days |
| **Total** | | **~8–13 days** |

---

## Related Repositories

| Repo | Purpose |
|------|---------|
| `sunsky-admin` | Admin panel (booking management, finance, suppliers) |
| `sunsky-admin/backend` | Node.js API server |

---

## Scripts

```bash
npm run dev       # Start dev server (localhost:5173)
npm run build     # Production build → /dist
npm run preview   # Preview production build
npm run lint      # ESLint check
```
