# SunSky Website — Pending Tasks

**Project:** SunSky / HolidayBooking.be B2C travel booking website
**Prepared:** 2026-06-25
**Status:** Test booking works end-to-end; the items below remain before a full production release.

---

## 1. Summary

The website can already create a complete test booking (hotel + flight package) from search through Stripe payment to confirmation. What remains is a set of bug fixes, hardcoded-value replacements, and a few unfinished features (flights-only verification, My Bookings detail, voucher download), plus production server housekeeping.

**Estimated time to a fully working release: ~8–13 working days.**

---

## 2. Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Hotel search (Results page) | ✅ Working | Infinite scroll + page-based pagination; Load More button added |
| Hotel detail / room selection | ✅ Working | Room pricing via live availability API |
| Hotel + flight package booking | ✅ Working | End-to-end with Stripe payment (test mode) |
| Flights-only booking (Airtuerk) | ⚠️ Partial | Search works; end-to-end booking not yet verified |
| User registration / login | ✅ Working | JWT auth, Redux store |
| My Bookings page | ⚠️ Partial | List loads; no detail click-through |
| Voucher download | ❌ Not done | UI placeholder only |
| Live Stripe payment | ⚠️ Untested | Test mode works; live card not yet verified |
| Admin panel (sunsky-admin) | ⚠️ Partial | Tracked in the separate admin repo |

---

## 3. Critical Bugs (P0 / P1)

| # | Issue | File | Line | Priority | Status |
|---|-------|------|------|----------|--------|
| 1 | One-way flight crash — `retDate.replace()` called on undefined for one-way flights | `src/pages/HotelDetail/HotelDetail.jsx` | ~513 | **P0** | ✅ Fixed |
| 2 | Departure airport hardcoded to `BRU` (Brussels) — not taken from the search | `src/pages/HotelDetail/HotelDetail.jsx` | 7 (`DEFAULT_ORIGIN`) | **P0** | ⬜ Open |
| 3 | Supplier reference hardcoded as `'77-4446011'` on confirmation + voucher | `Confirmation.jsx:167`, `HotelVoucher.jsx:39` | — | **P1** | ⬜ Open |
| 4 | Hotel contact details hardcoded (phone / fax / email / website) | `Confirmation.jsx` | 190–194 | **P1** | ⬜ Open |
| 5 | Flights "From" dropdown limited to hardcoded UK airports only | `src/pages/Home/sections/Hero.jsx` | 19–28 | **P1** | ⬜ Open |
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
| 7 | No individual booking detail view from My Bookings | Needs an `/account/bookings/:id` route + page | ⬜ Open |
| 8 | Voucher PDF download from My Bookings | Currently a placeholder only | ⬜ Open |
| 9 | Flights-only end-to-end test via Airtuerk | Booking flow built but not verified end-to-end | ⬜ Open |
| 10 | Live Stripe payment end-to-end test | Test mode works; live card not yet run | ⬜ Open |
| 11 | Results infinite-scroll | Server-side page-based pagination with IntersectionObserver auto-load, dedup, and end-of-results message | ✅ Fixed |

### Fix notes (P2)

- **#11** ✅ — true server-side infinite scroll (`page=1,2,3…`) via IntersectionObserver. Fixed the root-cause bug where new pages didn't render: the dedup `seen.add()` ran inside the `setAllHotels` updater, which React StrictMode double-invokes — the 2nd invocation saw codes already added and appended nothing. Dedup now runs once outside the updater, so the setter stays pure. Added a clear "you've reached the end" message when `hasMore` is false.

---

## 5. Estimated Timeline

| Phase | Tasks | Estimate |
|-------|-------|----------|
| P0 bug fixes | Items 1–2 | 1–2 days |
| P1 bug fixes | Items 3–6 | 2–3 days |
| Flights-only end-to-end | Item 9 | 1–2 days |
| My Bookings detail + voucher | Items 7–8 | 2–3 days |
| QA + live payment test | Items 10–11 | 1–2 days |
| **Total** | | **~7–12 days** |

---

## 6. Open Decisions for Client

- Confirm the real **supplier reference** source/format for vouchers.
- Confirm which **departure airports** should be selectable (currently UK-only list).
- Confirm **hotel contact details** source — API field vs. a fixed support contact.
- Confirm go-live date so the **live Stripe** test can be scheduled.

---

*This is the readable Markdown version of `SunSky-Pending-Tasks.docx`. The `.docx` is the same content formatted as a Word document for sharing with the client.*
