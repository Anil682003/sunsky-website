# SunSky — Dutch (NL) Translation Checklist

**Stack:** `react-i18next`. Dutch (`nl`) is the site's default/native language; English (`en`) is the switchable alternative. Pattern: `t('ns:key', 'English default text')`, one namespace per page/feature, under `src/i18n/locales/{en,nl}/*.json` (see `src/i18n/index.js`).

**Last updated:** 2026-09-24

---

## sunsky-website (customer site)

### ✅ Done and live

| Area | Status | Notes |
|---|---|---|
| Header + footer + language switch | ✅ Live | `common` namespace |
| Home (all 11 sections + Hero) | ✅ Live | `home` namespace |
| Results (whole page + Where picker) | ✅ Live | `results` namespace — verified zero leftover hardcoded strings |
| FAQ (customer page + subcategory filters) | ✅ Live | `faq` namespace |
| Shared search: calendar, airport typeahead, destination modal | ✅ Live | `common` namespace |
| Shared utils: reviewBadge, rating, topFacilities, countryName | ✅ Live | `countryName` uses `Intl.DisplayNames` (no data needed) |
| Holiday-type names (all 16) | ✅ Live | |
| **HotelDetail (whole page)** | ✅ Live | `hotelDetail` namespace — PR [#35](https://github.com/Anil682003/sunsky-website/pull/35), merged. Hero/tabs, fare-comparison chart, flight picker + flight-details modal, room/board list, "Overview of your holiday", Information tab, Facilities tab, booking sidebar, mobile sticky bar, photo explorer/lightbox. Also converts the shared `StayBar` component and the `rateDetails.js` board dictionary. Dates (weekday/month names) now read from the shared calendar dictionary instead of hardcoded English arrays. |
| **Account (Profile, Favourites, My Bookings, Booking Detail)** | ✅ Live | `account` namespace — same PR [#35](https://github.com/Anil682003/sunsky-website/pull/35), merged. Status badges/payment chips keep English backend keys for lookups, only the rendered label is translated. Also fixed a real locale bug: date formatting was hard-coded to `en-GB` regardless of site language — now follows the reader's language (`nl-BE`/`en-GB`), matching `Results.jsx`/`Hero.jsx`. `Account.jsx` (`/account`) and `AccountSettings.jsx` (`/account/settings`) are still bare placeholders (`<div>Account</div>`) — no real content to translate yet. |

### ⬜ Not started

| Page | Lines | ~Strings | Notes |
|---|---:|---:|---|
| Checkout | 3,681 | ~50 | Money — slowest, most careful, deliberately last of the big ones |
| Auth (5 files) | 1,603 | ~42 | Login / Register / Forgot |
| Flights / FlightDetail / Transfers / Voucher / HolidayType | ~2,450 | ~25 | Smaller pages |
| Placeholder stubs (About, Contact, NotFound, Account, AccountSettings, etc.) | tiny | ~6 | One-liners — **and currently unbuilt**, not just untranslated (see below) |

### 🔎 Loose ends found during review (not yet actioned)

- **Home page SEO/sitemap block** ("Last Minute Spain", "Paris", "Rome", "France by Car", …) — entirely hardcoded English, not wired to i18n at all.
- **Destination-search error state** — "No hotels or destinations match…" renders in English regardless of site language.
- **Footer link destinations** — footer labels (Over SUNSKY, Contact, Wettelijke vermeldingen, Disclaimer, Copyright) are already correct Dutch from the CMS, but they point at placeholder stub pages with no real content yet (see "Placeholder stubs" row above). Not a translation bug — a missing-content one.

---

## sunsky-admin (internal dashboard)

The admin UI itself is English-only by design (internal staff tool, not customer-facing) — it does **not** need an i18n framework. What it needs is Dutch **content** for the data the website displays.

| Item | Status | Notes |
|---|---|---|
| Backend multi-language content model | ✅ Exists | `*Description` tables keyed by `languageCode` for FAQ, FAQ categories, Pages, Countries, Destinations, States, Zones, GroupZones, HolidayTypes, HolidayThemeTypes, Terminals, Hotels |
| FAQ Dutch content | ✅ Done | One-off backend seed script (`backend/scripts/seed-faq-dutch.mjs`) inserted `nl` rows for all 30 questions + 4 category stages, matched against the English text. Admin UI itself still only ever edits `en`. |
| Country names | ✅ N/A | Handled client-side via `Intl.DisplayNames`, no admin/backend work needed |
| City / region / zone / holiday-type Dutch names | ⬜ Not started | No `nl` rows exist yet anywhere outside FAQ; likely the same seed-script pattern as FAQ, or a language toggle added to the relevant admin CRUD forms (GeoData, HolidayTypes, PageManagement) |

---

## Conventions (for whoever picks this up next)

- Namespace per page/feature; shared chrome (nav, footer, search widgets, calendar) lives in `common`.
- Always give `t()` an English default so a half-converted page stays readable: `t('faq:title', 'Frequently Asked Questions')`.
- Reuse existing dictionaries instead of duplicating — e.g. board/meal-plan labels use `results:board.<code>`, trip-length bands use `home:hero.durations.<key>`.
- Commit style: `feat(i18n): <page> in Dutch`, `fix(i18n): …`, with prep commits like `refactor(x): no local may be called 't'` before converting a page with map/reduce callbacks.
- A key holding an identifier used in JS logic (e.g. `dir === 'Return'`, `activeTab === 'Prices'`) stays English — only the rendered *label* gets translated, via a small lookup/helper.
