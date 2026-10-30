# SunSky Website — Pending Tasks

**Project:** SunSky / HolidayBooking.be B2C travel booking website
**Prepared:** 25/06/2026 · **Updated:** 30/10/2026
**Status:** Every build item is done and live. What remains are two live tests that need a person present: a real Airtürk flights-only booking and a real Stripe card payment.

---

## 1. Summary

The website books a complete holiday (hotel + flight package) from search through Stripe payment to confirmation. The bug fixes, hardcoded values and unfinished features listed below are all done and live, including the My Bookings detail page and document downloads.

**What remains:** the two supervised live tests (#9 and #10), about one working day together once a go-live date is set.

---

## 2. Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Hotel search (Results page) | ✅ Working | Infinite scroll + page-based pagination; Load More button added |
| Hotel detail / room selection | ✅ Working | Room pricing via live availability API |
| Hotel + flight package booking | ✅ Working | End-to-end with Stripe payment (test mode) |
| Flights-only booking (Airtuerk) | ⚠️ Built, not live-verified | Search and the real reservation (PNR) are built; one supervised live booking is still needed (#9) |
| User registration / login | ✅ Working | JWT auth, Redux store |
| My Bookings page | ✅ Working | List, a detail page per booking (`/account/bookings/:ref`) and document downloads |
| Voucher download | ✅ Working | Released vouchers, invoices and confirmations download as PDF from the booking page |
| Live Stripe payment | ⚠️ Untested | Test mode works; live card not yet verified |
| Admin panel (sunsky-admin) | ✅ Working | Tracked in the separate admin repo |

---

## 3. Critical Bugs (P0 / P1)

| # | Issue | File | Line | Priority | Status |
|---|-------|------|------|----------|--------|
| 1 | One-way flight crash — `retDate.replace()` called on undefined for one-way flights | `src/pages/HotelDetail/HotelDetail.jsx` | ~513 | **P0** | ✅ Fixed |
| 2 | Departure airport hardcoded to `BRU` (Brussels) — not taken from the search | `src/pages/HotelDetail/HotelDetail.jsx` | 7 (`DEFAULT_ORIGIN`) | **P0** | ✅ Fixed (the hotel page takes `origin` from the search; `BRU` is only the fallback in `utils/airports.js`) |
| 3 | Supplier reference hardcoded as `'77-4446011'` on confirmation + voucher | `Confirmation.jsx:167`, `HotelVoucher.jsx:39` | — | **P1** | ✅ Fixed (confirmation shows "—" until the supplier ref reaches the browser; the voucher's demo booking, which carried it and showed at /voucher, is removed) |
| 4 | Hotel contact details hardcoded (phone / fax / email / website) | `Confirmation.jsx` | 190–194 | **P1** | ✅ Fixed (only data we have; and SUNSKY's own placeholder phone/email replaced by Company Settings via `/website/company-contact`) |
| 5 | Flights "From" dropdown limited to hardcoded UK airports only | `src/pages/Home/sections/Hero.jsx` | 19–28 | **P1** | ✅ Fixed (dynamic airport search) |
| 6 | Rooms count not updated in Results sidebar re-search | `src/pages/Results/Results.jsx` | — | **P1** | ✅ Fixed |

### Fix notes

- **#1** ✅ — guarded with optional chaining (`outDate?.replace`, `retDate?.replace`) and a one-way fallback so the label shows just the outbound date when there is no return leg.
- **#2** — pass the real origin airport from the Hero search through the URL/state instead of `const DEFAULT_ORIGIN = 'BRU'`.
- **#3** — read the supplier reference from the backend `/online-bookings/:id/confirm` response and thread it into Confirmation + Voucher.
- **#4** — pull hotel contact details from the hotel info API rather than hardcoding.
- **#5** — replace the static UK airport list with a dynamic airport search (same source used elsewhere).
- **#6** ✅ — added a **Rooms** stepper to the Results sidebar; `applySearch` now commits the rooms count (and reducing adults clamps rooms to keep ≥1 adult per room).

---

## 4. Medium Priority (P2)

| # | Issue | Notes | Status |
|---|-------|-------|--------|
| 7 | No individual booking detail view from My Bookings | Needs an `/account/bookings/:id` route + page | ✅ Fixed (`/account/bookings/:ref`) |
| 8 | Voucher PDF download from My Bookings | Documents card on the booking detail page: released vouchers, invoices and confirmations, each downloadable as a PDF | ✅ Fixed |
| 9 | Flights-only end-to-end test via Airtuerk | Booking flow built but not verified end-to-end | ⬜ Open |
| 10 | Live Stripe payment end-to-end test | Test mode works; live card not yet run | ⬜ Open |
| 11 | Results infinite-scroll | Server-side page-based pagination with IntersectionObserver auto-load, dedup, and end-of-results message | ✅ Fixed |

### Fix notes (P2)

- **#8** ✅ My Bookings → a booking → **Documents** lists the customer documents SUNSKY issued for that booking (admin `GET /api/website/bookings/:ref/documents`, PDF via `.../documents/:id/pdf`), behind the same customer login and ownership check as the booking itself. What is listed is decided by the admin Documents centre's own release check: travel documents only appear once released, and internal review copies are never handed out. Empty until documents are issued.

- **#11** ✅ — true server-side infinite scroll (`page=1,2,3…`) via IntersectionObserver. Fixed the root-cause bug where new pages didn't render: the dedup `seen.add()` ran inside the `setAllHotels` updater, which React StrictMode double-invokes — the 2nd invocation saw codes already added and appended nothing. Dedup now runs once outside the updater, so the setter stays pure. Added a clear "you've reached the end" message when `hasMore` is false.

---

## 4c. Server-side Price Validation (anti-tampering) — ✅ Implemented

**Problem:** `createOnlineBooking` trusted client-supplied prices (`flight.price`, `hotel.price`, `insurance.price`, `serviceFee`) and wrote them straight to the DB. A client could edit the request (DevTools/curl) and book/charge €10 instead of €500.

**Fix:** new [priceValidation.service.js](../sunsky-admin/backend/website/services/priceValidation.service.js) re-prices every component **server-side** before the booking is stored; on mismatch beyond a small tolerance (max €1 or 1%) the create is rejected with **HTTP 409 `PRICE_CHANGED`** (surfaced to the user on the payment step).

| Component | Re-price source | Status |
|-----------|-----------------|--------|
| Flight | `api/flight/price` (authoritative supplier total for the booked `flightKeys`) | ✅ Enforced |
| Hotel (Hotelbeds) | `checkRates(rateKey)` — authoritative re-price of the exact booked rate | ✅ Enforced |
| Hotel (Diana) | re-search by region + match a room at (≈) the booked price; reject if client price is below every real room | 🟡 Best-effort (Diana has no per-rate-key / checkrates API) |
| Insurance | computed from SunSky's own catalog (never trust client) | ✅ Enforced |
| SGR / booking fee | fixed SunSky charge, server-set (€20) | ✅ Enforced |

**Enforcement policy:** insurance + fee are always enforced (no supplier dependency). For flight/hotel, if the supplier returns a price it's enforced; if it **can't** be re-priced (no keys / supplier unavailable): **live → reject**, **test → warn + allow** (so local testing isn't blocked). Stored prices use the **server** values, not the client's.

> ⚠️ **Not yet live-verified.** Flight re-price hits real `api/flight/price`; Hotelbeds re-price hits real `checkrates`. Run a real flight + hotel(Hotelbeds) booking and confirm both pass within tolerance before go-live. Diana stays best-effort (no rate-key re-price exists in their API) — catches gross under-pricing but not exact-rate validation.

---

## 4a. Flights / Airtuerk Reservation

| # | Issue | Notes | Status |
|---|-------|-------|--------|
| A | Live Airtuerk reservation (real PNR) | Implemented `reserveLive()`: `basket/create` → `booking/create` → PNR, using verified request/response contracts from real saved Airtuerk samples | 🟡 Implemented — **not yet live-verified** |
| B | Confirm/reservation failures were swallowed after payment | Now surfaced: a failed reservation flags the booking as "pending finalisation" instead of silently showing full confirmation | ✅ Fixed |
| C | Airtuerk credentials hardcoded in source | Moved to env vars with the existing values as fallback (`AIRTUERK_USERNAME/PASSWORD/BASIC_AUTH/BASE_URL`) | ✅ Fixed |
| D | `rejectUnauthorized: false` (TLS) | Certificates are now checked: the Airtuerk API serves a valid Let's Encrypt certificate (checked from the production server on 30/10/2026) | ✅ Fixed |

### Fix notes (Flights)

- **A** 🟡 — The real reservation flow is wired end-to-end:
  - **Search** ([airtuerk.service.js](../sunsky-admin/backend/website/flight-availability/services/airtuerk.service.js)) now returns the opaque bookable `flightKey` per option.
  - **Frontend** carries `flightKey` through the flight mapping ([flightData.js](src/pages/Flights/flightData.js)) into the booking payload as `flightKeys` ([FlightDetail.jsx](src/pages/FlightDetail/FlightDetail.jsx)).
  - **Booking create** stores `flightKeys` in `productDetails`; **confirm** passes them (+ trip type, passenger counts, lead contact, sales amount) to the reservation service.
  - **Reservation** ([flightReservation.service.js](../sunsky-admin/backend/website/services/flightReservation.service.js)): `basket/create` (FlightKeys + passengers) → `basketKey`, then `booking/create` (basketKey + contact + SalesAmount) → `pnr`. Response validated against `{ pnr, errorCode, hasProblem }`.
  - **⚠️ Gated for safety:** the live path runs only when `mode !== 'test'` **AND** env `AIRTUERK_RESERVATION_LIVE === 'true'`. Until that flag is set, it still simulates — so production keeps simulating until a supervised first real booking is done. **This has NOT been tested against the live Airtuerk API (would issue a real PNR/ticket).** First real booking must be supervised; verify the `booking/create` response shape and whether a separate ticket-number retrieval is needed.

---

## 4b. Test Run — Flights-only Booking (2026-06-27, local)

**Scenario:** Flights-only round-trip MAN → SAW, 30 Jun – 6 Jul, 2 adults (Deepak Sarkar lead + Rohit Patil), All-in protection insurance, test mode.

**Result:** Booking **id 62 / ORD-000049** created and **Confirmed** end-to-end.

### ✅ Worked
- `POST /online-bookings` → created Flight (€491) + Insurance (€85) products, both travellers saved as ADT.
- `POST /create-payment-intent` → returned `STRIPE_NOT_CONFIGURED` (expected locally) → frontend **test dummy-pay fallback** now handles this and proceeds.
- `POST /payment` (dummy) → marked Paid.
- `POST /confirm` → Airtuerk reservation **simulated**: PNR `86PF3L`, supplierReference `AIRTUERK-86PF3L`, ticket numbers issued for both travellers, product + booking status → **Confirmed**.
- Confirmation screen rendered correctly (PNR, travellers, payment summary, "what happens next").

### ✅ Bug fixed — booking total mismatch (backend vs UI)
- **Was:** UI charged €1,087 (2 × €491 + €20 fee + €85) but backend recorded **€576** — off by €511.
- **Root cause:** (1) the flight price was the **per-person** fare scaled by the *search-time* pax (`fareBreakdown.total = flight.price × flight.pax`, pax=1) instead of the actual travellers entered at checkout; (2) the **€20 SGR/booking fee** was never sent to the backend.
- **Fix:**
  - Frontend ([Checkout.jsx](src/pages/Checkout/Checkout.jsx)) now sends the flight line total based on **actual travellers** (`base + roomExtraTotal` for flights-only; package payloads already carry full totals and are untouched), and passes `serviceFee` (SGR_FEE).
  - Backend ([onlineBooking.controller.js](../sunsky-admin/backend/website/controllers/onlineBooking.controller.js)) adds `serviceFee` to `grandTotal` and records it as a booking `adjustment`.
  - Result for this scenario: grandTotal = 982 + 85 + 20 = **€1,087**, matching the UI. | Status: ✅ **Fixed**

### ✅ Bug fixed — round-trip return leg (SAW → AYT)
- **Was:** round-trip results showed a wrong return leg and carried only one `flightKey`.
- **Root cause:** Airtuerk returns **separate direction groups** (outbound `from→to`, return `to→from`); the backend search **flattened** them, so each result was one-way and the frontend faked an out/return split.
- **Fix:** [airtuerk.service.js](../sunsky-admin/backend/website/flight-availability/services/airtuerk.service.js) now **pairs** outbound + return options into complete itineraries — combined legs, summed price, and **`flightKeys: [outboundKey, returnKey]`**. One-way is unchanged (flat list, single-element `flightKeys`). Frontend ([flightData.js](src/pages/Flights/flightData.js), [FlightDetail.jsx](src/pages/FlightDetail/FlightDetail.jsx)) carries the `flightKeys` array through to the booking. | Status: ✅ **Fixed**

> ⚠️ Round-trip pairing assumes the supplier price is additive (outbound fare + return fare). Verify against a real **priced** round-trip Airtuerk response before live use (the probe used for the structure returned `isSuccess:false` for the test dates, so prices weren't sampled).

### ℹ️ Note
- `flightKeys` are now populated for **both** one-way (1 key) and round-trip (2 keys), so the live reservation path has what it needs. (The earlier booking 62 has empty `flightKeys` since it predates this fix.)

---

## 5. Estimated Timeline

| Phase | Tasks | Status |
|-------|-------|--------|
| P0 bug fixes | Items 1–2 | ✅ Done |
| P1 bug fixes | Items 3–6 | ✅ Done |
| My Bookings detail + voucher | Items 7–8 | ✅ Done |
| Results infinite scroll | Item 11 | ✅ Done |
| Flights-only live test | Item 9 | ⬜ Needs a supervised live booking (about half a day) |
| Live payment test | Item 10 | ⬜ Needs a supervised live card payment (about half a day) |

---

## 6. Open Decisions for Client

- Confirm the real **supplier reference** source/format for vouchers. Until it reaches the website, the confirmation shows a dash instead of a made-up reference.
- ✅ Resolved: **departure airports** come from GeoData → Airports (popular airports first), no fixed list.
- ✅ Resolved: **hotel contact details** show only what the supplier data holds; SUNSKY's own phone and email come from System Settings → Company Settings.
- Confirm go-live date so the **live Airtürk** and **live Stripe** tests can be scheduled.

---

*This is the readable Markdown version of `SunSky-Pending-Tasks.docx`. The `.docx` is the same content formatted as a Word document for sharing with the client.*
