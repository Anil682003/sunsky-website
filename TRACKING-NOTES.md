# Google Ads / GA4 / Marketing Tracking — implementation notes

Implements **SUNSKY Google Ads, GA4 & Marketing Tracking — Technical Specification v1.0 FINAL**
(referred to in the code as the "Tracking Master", cited by section number).

Code lives in [`src/analytics/`](src/analytics). Tests:
[`canonical.test.js`](src/analytics/canonical.test.js) (28) and
[`tracking.test.jsx`](src/analytics/tracking.test.jsx) (30).

---

## 1. Status

| Spec area | State |
|---|---|
| dataLayer → GTM → GA4 / Google Ads architecture (§2) | Built |
| Four funnel events: search, view_item, begin_checkout, purchase (§8) | Built and wired |
| Canonical values: product type, board, dates, airports, money (§6, §7) | Built |
| Omit-never-invent rule (§18) | Built, enforced centrally |
| One item per product, quantity 1, value = item price (§29 rules 6 and 10) | Built |
| Purchase conditions and deduplication (§15) | Built |
| Consent Mode v2 defaults and updates (§23) | Built |
| Environment separation (§25) | Built, sent as `tracking_environment` |
| Tracking can never block a booking (§25) | Built, every path swallows errors |
| **Activation** | **Blocked — needs the GTM container ID from SUNSKY** |
| Google Ads Enhanced Conversions (§23) | Not built — configured in GTM, not in site code |

The code ships **inert**. With no `VITE_GTM_CONTAINER_ID` set, no container is loaded, no event
is pushed and the cookie notice is unchanged. Nothing about the live site changes until step 2
below is done.

---

## 2. How to switch it on

**Step 1 — set the build-time variables** (`.env.production` on the server):

```
VITE_GTM_CONTAINER_ID=GTM-XXXXXXX
VITE_TRACKING_ENV=production
```

`VITE_TRACKING_ENV` defaults to `development`, which fails safe: an unconfigured build cannot
post to the live GA4 property by accident. Set it to `uat` on any test deployment, and hold the
production GA4 and Google Ads tags behind a `tracking_environment equals production` trigger
condition in GTM. That is what satisfies §25.

**Step 2 — turn the two consent categories on.** In
[`src/utils/consentStore.js`](src/utils/consentStore.js), set `inUse: true` on the `analytics`
and `marketing` purposes.

They are deliberately dormant today. The project's cookie rule is that a category is only shown
once something actually uses it, so advertising a "Marketingcookies" toggle while no tag exists
would be a false statement in the cookie notice.

Flipping them changes `purposeHash()`, which **invalidates every stored consent record and
re-asks every visitor**. That is correct and intended — nobody consented to analytics or
advertising before, so nobody's stored "yes" covers it — but it is a visible change, so do it
deliberately and in the same release as step 1.

**Step 3 — rebuild.** These are Vite build-time variables, so `pm2 restart` alone does nothing:

```bash
ssh -i ~/.ssh/sunsky_deploy -o BatchMode=yes admin@91.134.71.79 "cd /d C:\projects\sunsky-website\sunsky-website && git pull && npm run build && pm2 restart sunsky-website"
```

**Step 4 — build the GTM container.** The site emits the dataLayer; GTM maps it to GA4 and
Google Ads. Nothing in the site code needs to change for that, and per §21 it must not: no
parallel gtag or pixel implementation outside GTM.

---

## 3. Where each event fires

| Event | File | Trigger |
|---|---|---|
| `search` | [Results.jsx](src/pages/Results/Results.jsx) | On the page-1 request, guarded by `searchSignature()` |
| `view_item` | [HotelDetail.jsx](src/pages/HotelDetail/HotelDetail.jsx) | Once the hotel record has settled |
| `begin_checkout` | [Checkout.jsx](src/pages/Checkout/Checkout.jsx) | Once on entry, when a real quote exists |
| `purchase` (card) | [Checkout.jsx](src/pages/Checkout/Checkout.jsx) | After payment **and** a successful supplier confirm |
| `purchase` (redirect) | [CheckoutReturn.jsx](src/pages/Checkout/CheckoutReturn.jsx) | Same, after Bancontact / iDEAL / PayPal return |

Three details worth knowing, because each is a rule that is easy to break later:

- **Sorting does not fire a search.** The Results page re-runs its page-1 fetch when the sort
  changes. §9 lists sorting among the things that must *not* fire a `search`, so the event is
  gated on `searchSignature()`, which deliberately excludes sort order and paging.
- **A failed supplier booking does not fire a purchase.** §15 lists "supplier booking fails"
  among the conditions. Payment succeeds but the reservation does not, the customer is told the
  booking is being finalised, and Google is told nothing. If such a booking is later rescued by
  hand, that is a manual conversion.
- **The redirect payment methods carry their context in `sessionStorage`.** `/checkout/return`
  is a fresh page load that only receives a `bookingId`; the stored booking is normalised across
  product rows and cannot supply destination, board or duration. Putting those in the return URL
  would write the customer's trip into browser history and the payment provider's referrer, so
  it stays in the tab instead. See [redirectHandoff.js](src/analytics/redirectHandoff.js).

---

## 4. Consent

GTM is **not** in `index.html`, and must never be put there. The project's standing rule names
tag managers specifically, and [`src/test/preConsent.test.jsx`](src/test/preConsent.test.jsx)
fails the build if any foreign script reaches the page before consent.

The order in [`Analytics.jsx`](src/analytics/Analytics.jsx) is:

1. push Consent Mode defaults, everything denied;
2. push the visitor's actual decision;
3. only then, and only if something was granted, inject the container.

Steps 1 and 2 touch nothing but a JavaScript array — no cookie, no request — so they are safe
before consent, and they put the defaults at index 0 of the array the container reads on
startup. That is what §23's "established before Google measurement tags process user activity"
means when the container is injected rather than placed in `<head>`.

**Events are dropped before consent, not buffered.** GTM replays the whole dataLayer from index
0 when it boots, so buffering pre-consent events would upload them retroactively the moment
someone accepted. There is a test for this.

---

## 5. Open questions for SUNSKY

These do not block the build. They do affect what the reports show.

1. **GTM container ID, GA4 measurement ID, Google Ads conversion ID and label.** Needed to
   activate. Also: one container for production plus a separate one for UAT, or one container
   with environment-based triggers? The code supports either.
2. **Consent Mode signal granularity.** The cookie notice asks one question about marketing, so
   `ad_storage`, `ad_user_data` and `ad_personalization` are all granted or denied together.
   Splitting them would need three separate toggles in the banner, which is a cookie-notice
   change, not a code change. Confirm the single toggle is what is wanted.
3. **Transfers.** §4 permits only `FLIGHT_HOTEL`, `HOTEL_ONLY` and `FLIGHT_ONLY`, and §4 forbids
   inventing alternative names. SUNSKY sells transfers. Today a standalone transfer booking is
   **not tracked at all**, rather than mislabelled. Should it get a fourth product type, be
   folded into an existing one, or stay untracked?
4. **Board taxonomy.** §7 says to map SUNSKY's existing board codes onto the canonical set
   rather than build a second system. SUNSKY's existing codes are Hotelbeds' full board
   dictionary (22 codes), mapped onto the five families in §7. Two judgement calls worth
   confirming: every breakfast variant (continental, American, buffet, English, Irish, Scottish,
   light, two-guest) is `BED_BREAKFAST`; and `CE` (dinner included), `CO` (lunch included) and
   `DO` (dinner & B&B) are `HALF_BOARD` as the nearest family. See
   [canonical.js](src/analytics/canonical.js).
5. **FLIGHT_ONLY item id.** §17 says never to invent one. There is no stable SUNSKY flight
   product identifier today, so the descriptive fallback is used (`"BRU-Barcelona"`). If a stable
   id becomes available, it should be passed through.
6. **Multi-destination searches.** A search scoped to several countries or cities has no single
   `destination`, so country and destination are omitted rather than guessed. Confirm that is
   preferred over sending the first one.
7. **Enhanced Conversions (§23).** Requires hashed customer data and is configured in GTM, not
   in site code. Confirm SUNSKY wants it enabled, and who configures the GTM side.

---

## 6. Not in this change

The three documents sent on 2 October cover three separate workstreams. Only the marketing one
is implemented here.

- **SEO & Organic Search — Master Developer Specification Phase 1.** Not started. Needs an SEO
  Page Manager (dashboard plus backend, so sunsky-admin), sitemap, robots.txt, canonicals,
  redirects, and — the significant one — server-rendered title, meta, canonical, robots, H1 and
  breadcrumbs (§12). The site is a client-rendered SPA whose production server deliberately
  carries no dependencies and today only injects Open Graph tags for `/hotel/:code`. Meeting §12
  is an architecture decision with real cost, and needs its own estimate.
- **SEO Frontend Navigation & SearchContext Addendum.** Not started, and partly dependent on the
  SEO Page Manager existing first, since it governs when to open a permanent SEO page versus
  search results.
- **Airtuerk / Tursys Flight-Cache Importer correction**, and the Cache Architecture v2
  specification. Backend and cache work, not this repository. The correction instruction document
  itself has not been received.
