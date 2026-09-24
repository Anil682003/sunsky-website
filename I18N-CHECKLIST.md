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
| **Checkout (3-step form, Confirmation, redirect-return page)** | ✅ Live | `checkout` namespace — PR [#36](https://github.com/Anil682003/sunsky-website/pull/36). Far bigger than the ~50-string estimate: ~400 keys across `Checkout.jsx`, `Confirmation.jsx`, `CheckoutReturn.jsx` (info/travellers/review modal, baggage, transfer, insurance, payment, booking overview, non-refundable consent, mobile bar). Nationality/country dropdown values stay their English backend strings; only the shown label is translated (countries via the existing `countryName()` + `Intl.DisplayNames`, nationalities via a small new dictionary). Dashboard-sourced content (insurance/baggage option labels from `/website/checkout-config`) is left as-is, same rule as HotelDetail's board names. Found and fixed three real bugs along the way: Stripe's own hosted UI (`<Elements>`) had its `locale` hard-coded to `'en'` regardless of site language; an `ageType` i18n lookup used `CHD`/`INF`/`ADT` directly as lowercase keys instead of mapping to `child`/`infant`/`adult`; and a pre-existing unit test in `rateDetails.test.js` asserted English board labels that have asserted Dutch ever since `boardInfo()` was wrapped in `i18n.t()` back in the HotelDetail PR — it was silently order-dependent (passed only when another test happened to leak an `en` language switch into the same worker) and fails deterministically in isolation; now asserts the correct Dutch defaults. |
| **Auth (Login, Register, ForgotPassword, RegisterVerify, CodeInput)** | ✅ Live | `auth` namespace — same PR [#36](https://github.com/Anil682003/sunsky-website/pull/36). Far bigger than the ~42-string estimate: ~207 keys. Nationality/language demonyms use a small dictionary each (values stay the raw DB enum sent to the backend); country names reuse the existing `countryName()`/`Intl.DisplayNames` helper via an ISO map, including for the phone-code picker's 47-entry country list (its dial code is the value sent and stays untouched — only the displayed name and the search, which now matches either language, are translated); two dial-code entries with no single matching country ("US / Canada", "UAE") get their own manual overrides. Gender values stay the DB enum; only the label is translated. |

### ⬜ Not started

| Page | Lines | ~Strings | Notes |
|---|---:|---:|---|
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
