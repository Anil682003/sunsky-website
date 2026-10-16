# SUNSKY UI Backlog — working tracker

Local copy of the **SUNSKY UI Backlog** artifact shared on 16 October 2026
(<https://claude.ai/artifact/c382bbe6-df6b-4d90-9228-e7e28aca2910>, marked "updated 15 October
2026"). It lists what is still missing on this website against the Search & Offer Contract
(chapters 1–3, with the §12B amendments of 11 October 2026) and the Unified Results doc of
13 October.

Kept in the repo rather than only in the artifact for three reasons: the artifact needs a
per-conversation approval to read, progress is visible in `git log` next to the commits that
caused it, and anything we learn while building (see **Findings**) has somewhere to live.

**Totals at import:** 26 open tasks · 4 high priority · 22 API ready · 3 need backend · 1 waiting
on another team · 33 already complete.

## Status key

| Mark | Meaning |
|---|---|
| ` ` | Not started |
| `WIP` | In progress |
| `DONE` | Implemented, tested, build green, verified in the browser |
| `BLOCKED` | Backend or another team must ship first |

Update the table below **and** the task's own section when something changes, and reference the
commit. A task is only `DONE` when every one of its "Done when" lines is true.

## Board

| ID | Task | Priority | API | Status |
|---|---|---|---|---|
| UI-01 | Disable impossible departure dates in every calendar | High | Ready | **DONE** — all three pages |
| UI-02 | Open the calendar on the first month with a possible departure | High | Ready | **DONE** |
| UI-03 | Matrix: each date from the cheapest of the chosen airports | High | Ready | **DONE** (`1fe3278`) |
| UI-04 | Room and board price differences against the current selection | High | Ready | **DONE** |
| UI-05 | Disable impossible destinations and airports on the homepage | Medium | Ready | **DONE** |
| UI-06 | Ask before dropping airports that clash with a new destination | Medium | **Needs API** | BLOCKED |
| UI-07 | Only offer trip lengths that have a package | Medium | Ready |**DONE** (`911f151`) |
| UI-08 | Count wording and the counting state | Medium | Ready | **DONE** (`24ed197`) |
| UI-09 | Mandatory local costs next to the price | Medium | **Needs API** | BLOCKED |
| UI-10 | "View available dates" when only short trips exist | Medium | Ready | **DONE** (`093ac29`) |
| UI-11 | Same state wording everywhere | Medium | Ready | **DONE** (`c56368f`) |
| UI-12 | Route control: two states | Medium | Ready | **DONE** (`fa977e5`) |
| UI-13 | Destination counts in the destination filter | Later | Ready |**DONE** (`145ed4f`) |
| UI-15 | W2M-only hotels as a second group with "Check price" | Later | **Waiting** | BLOCKED |
| UI-16 | Flights only from the cache | Later | Ready | **DONE** (`4700b45`) |
| UI-17 | Sort rules: unknown values last, stable ties, Hotelbeds first | Later | Ready |**DONE** (`c8cc76c`) |
| UI-18 | Popular departure airports first | Medium | Ready | **DONE** (`a4cde56`) |
| UI-19 | Intermediate category pages: navigation only, "Toon alles" | Medium | Ready | |
| UI-20 | Last Minute 42-day default and All Inclusive by real board | Medium | Ready | **DONE** (`723b9c7`) |
| UI-21 | Optional date range per homepage card | Later | Ready | |
| UI-22 | SearchContext precedence and product switching | Medium | Ready | |
| UI-23 | Results filters per §12B.5 | Medium | Ready | |
| UI-24 | Compact alternative-flight panel | Medium | Ready | |
| UI-25 | "Calculating…" for a party other than 2 adults / 1 room | Medium | Ready | **DONE** (`3e07d2c`, verified) |
| UI-26 | Admin: Monitoring page | Later | Ready | n/a — **sunsky-admin**, not this repo |
| UI-27 | Facet counts on complete offers (stars, facilities) | Later | **Needs API** | BLOCKED |

\* See **Findings** below: the label is only half right for UI-01 and UI-02.

## Rules that apply to every task

- Never replace a choice the customer made. If it becomes invalid, keep it visible with
  "Not available" and let them pick again.
- **Unknown is not impossible.** A loading or failed check never shows "Not available" and never
  hides an option.
- No supplier live call before "Check price & availability". Home, Results and the hotel page
  before the check read cache APIs only.
- Ready-made English strings live in `src/i18n/locales/en/common.json` (`feasibility.*`, `offer.*`,
  `localCosts.*`, `routing.*`, `availability.*`, `listing.*`). Dutch copies are needed for new ones.

---

## High priority

Customers hit these on every package search.

### UI-01 — Disable impossible departure dates in every calendar
**Pages:** Home, Results, Hotel page · **Spec:** Ch1 §7, §9A · Ch3 §5A

For Flight + Hotel, a departure date with no valid round trip is greyed and cannot be picked.
Dates whose status is unknown stay selectable.

**Done when**
- BRU → Antalya, 7 days: a day without a flight is grey with "not available"
- A date picked earlier that later becomes impossible stays selected and shows "Not available"
- With ±2 days, a date counts as possible if any day in the window works
- Feasibility request failed → nothing is greyed

**API:** `GET /flight-availability/feasibility` returns dates per airport (max 31 days per call, so
ask per visible month). **But see Findings 1.**

**Where:** `DateCalendar` already takes `isUnavailable`; pass it from `Hero.jsx`, `Results.jsx`,
`StayBar.jsx`. Reuse `usePackageAirports`.

### UI-02 — Open the calendar on the first month with a possible departure · DONE
**Pages:** Home, Results, Hotel page · **Spec:** Ch1 §9A · Ch3 §5A

Done on all three. `departureSummary()` in `usePackageDepartureDates.js` reduces the answer to
the two facts the calendar states (4 unit tests); `DateCalendar` takes `earliestAvailable` and
`availableCount` (5 component tests) and jumps to that month during render rather than in an
effect, so no wrong month flashes past. It jumps once, only while nothing is chosen and the
traveller has not paged, and only forward. Both strings were already in EN and NL.

With no date chosen, the calendar jumps to the first month that has a flight and says
"Earliest possible departure: 14 March 2027". With one date: "1 possible departure date found".
Nothing is selected for the customer.

**Done when**
- NRN with one flight in six months: calendar opens on that month
- No date becomes selected until the customer clicks

**API:** feasibility (earliest date). **See Findings 1.**
**Where:** strings `feasibility.earliestDeparture`, `feasibility.possibleDates`.

### UI-03 — Matrix: each date from the cheapest of the chosen airports
**Pages:** Results → Hotel page · **Spec:** Ch1 §9 · Ch3 §5 · Levent 7 Oct

The departure airports picked on the results page (several, or none = all) travel to the hotel
page. Each matrix date then shows the cheapest complete package from any of them, with that
date's airport. Today the hotel page keeps one airport (the card's) and prices every date from it.

**Done when**
- Results with BRU + AMS ticked: on the hotel page one date can be "from BRU" and the next
  "from AMS", whichever package is cheaper
- No airport ticked: every active airport competes per date
- Picking a date selects that date's airport for the offer; the traveller can still change it
- An airport choice is never narrowed to one without the traveller doing it

**API:** `GET /package-matrix` takes `origins=BRU,AMS` or no origins (all airports); each day
returns `departureAirport`.
**Where:** `packageHandoff.js` (carry the selection), `HotelDetail/usePackageMatrix.js` (send a list),
`HotelDetail.jsx` (show each cell's airport, use it when a date is picked).

**Done** in `1fe3278`. Each cell already returned `departureAirport`; nothing read it. The strip
now asks with `origins` (a list) instead of one airport, prints the code under a column only when
the week holds more than one, and appends it to the column's aria-label, since aria-label replaces
a button's inner text.

Two things that were not obvious going in:

- **Results had to send `origins` whenever ANY airport is ticked**, not only two or more.
  Previously one ticked airport and none ticked arrived identically, so "no preference" had to be
  guessed, and the guess was the airport that priced the clicked card.
- **Picking a date and picking an airport are different acts.** A date adopts its winner's airport
  for the offer, because the cheapest package that day may start elsewhere. But it must not narrow
  the strip, or the other six dates re-price and the prices being compared move. Only the airport
  chips set `ovr.originPicked`, and only that narrows.

Two tests asserted the old narrowing and were updated; a new one covers that a real choice
(`origins=FRA,DUS`) still reaches the API.

### UI-04 — Room and board price differences against the current selection · DONE
**Pages:** Hotel page · **Spec:** Ch1 §8 · Ch2 §6 · Ch3 §6

Done. The arithmetic is `src/pages/HotelDetail/roomDelta.js` (10 unit tests); the rendering is
covered by `HotelDetail.roomdiff.test.jsx` (4 tests). The baseline is the rate the page is
quoting, so a cheaper room now reads as a saving, with its own green pill. A row with no
baseline keeps showing its own total, and an unpriced rate still says "Check price".

The starting room says "Included". After a pick it says "Selected" with no price. Every other room
shows "+€ X p.p." or "−€ X p.p." against the current complete price, and the old room becomes an
alternative. Today rows show "+€ X p.p. vs cheapest" and never a minus.

**Done when**
- Pick a dearer room: the cheaper room now shows "−€ X p.p."
- p.p. = ceil(|difference| ÷ adults + children); infants not counted
- Two rooms: changing the board changes it for both and recomputes
- No price → "Check price", no number

**API:** prices are on the page already; the change is in how the difference is computed.
**Where:** `HotelDetail.jsx` around the `room-cta` block. Strings `offer.included`,
`offer.selected`, `offer.diffUp`, `offer.diffDown`.

---

## Medium priority

Visible gaps against the contract.

### UI-05 — Disable impossible destinations and airports on the homepage · DONE
**Pages:** Home · **Spec:** Ch1 §9A · Ch3 §4A · cases 19, 20

Both directions done. `src/hooks/useDestinationFeasibility.js` holds the rules as pure
functions (15 unit tests); `DestinationModal` takes an `isUnavailable` predicate (4 component
tests); `Hero.jsx` wires both.

- **Destinations** (case 19): one departure airport chosen → destinations it cannot reach grey
  out with "Niet beschikbaar vanaf …". Uses `/feasibility/destinations?origin=`.
- **Airports** (cases 19 and 20): a city chosen → departure airports that serve none of the
  chosen destinations grey out with "Niet beschikbaar voor jouw selectie". Needs no new
  endpoint; `usePackageAirports` already answers it with `origins`, unioned across the picks.

Four decisions worth keeping:
- The destination check runs only with **exactly one** departure airport chosen. The endpoint
  takes one origin, and with several picked a destination is reachable if any of them reaches
  it, which needs a request per airport. Greying nothing beats greying on the first alone.
- The airport check runs only when a **city** is picked. Only a city carries a hotel
  destination code (`p.code` = `hotels.destinationCode`); a country or region carries its own
  code, and the destination codes under it live in the modal's lazily-fetched places. This is
  not a gap, it **is** case 20: with Turkey as a whole chosen every airport stays in play.
- `travelDays` is deliberately not sent. A narrower question yields more NOT_FEASIBLE answers,
  and the expensive mistake is greying something the traveller could in fact have flown.
- Nothing already chosen is ever greyed, in either direction (§9A).

The package departure-airport picker is **not** `AirportSearch` — that component serves the
Flights tab. It is `airportRow` inside `Hero.jsx`.

After picking Charleroi, destinations without a round trip from CRL are greyed with
"Not available from Charleroi", and the other way round. A country stays selectable if any
destination in it works.

**Done when**
- CRL + New York: New York greyed
- Antalya picked: ANR greyed; Turkey picked: ANR selectable when another Turkish destination works
- Unknown or failed check: nothing greyed

**API:** live (#296) `GET /feasibility/destinations?origin=CRL` gives every destination as
FEASIBLE / NOT_FEASIBLE / UNKNOWN from that airport.
**Where:** `Hero.jsx`, `DestinationModal`, `AirportSearch`. String `feasibility.notAvailableFrom`.

### UI-06 — Ask before dropping airports that clash with a new destination · BLOCKED
**Pages:** Home, Results · **Spec:** Ch1 §9A · Ch3 §4A

BRU + ANR selected, new destination only works from BRU: show which airports do not fit and ask
before removing ANR. Build the confirmation into the page (browser confirm dialogs are not allowed).

**Done when**
- Without confirmation the selection is unchanged
- Only one clashing airport selected: the destination is not selectable until the airport changes

**API:** same as UI-05, marked **Needs API**.
**Where:** `Hero.jsx`, `Results.jsx`.

### UI-07 — Only offer trip lengths that have a package
**Pages:** Home, Hotel page · **Spec:** Ch1 §9A · Ch3 §6

Exact-length buttons are clickable only when a complete package exists for that length. A length
picked earlier stays visible with "Not available" when the new date cannot do it.

**Done when**
- 8 days picked, new date has no 8-day return: "8 days" stays selected with "Not available"
- An unknown length is not clickable but is not called sold out

**API:** feasibility returns lengths; the matrix returns duration buttons.
**Where:** `HotelDetail.jsx` duration chips, `Hero.jsx`.

### UI-08 — Count wording and the counting state
**Pages:** Results · **Spec:** Ch1 §2, §5

Show "3,842 holidays found", or "624 holidays in Turkey" with one destination. While the total is
still being worked out, show a counting state, not a guessed number. Today it says "stays found".

**Done when**
- Hotel only and Incl. flight both say "holidays"
- Filter change: the count shows the counting state ("Calculating…"), then the new total
- An answer that is not complete never shows an exact-looking number

**Where:** `Results.jsx` (`toolbar.found`) → `listing.count` / `listing.countIn`.

### UI-09 — Mandatory local costs next to the price · BLOCKED
**Pages:** Results card, Hotel page, Checkout · **Spec:** Ch1 §10 · Ch2 §5 · Ch3 §4

Under the main price: "Payable to SUNSKY € X", then "Mandatory payment locally: € 5 p.p. per night"
or the exact total. For an uncertain amount: the kind of cost and the range, with no made-up total.
Never only in a tooltip or Overview.

**Done when**
- A known €12.40 tax shows as €12.40 (not rounded) and is not added to the price
- Range €7–€10 shows as text, no total

**API:** needs the tax data from the hotel rates in the cache and live responses. **Needs API.**
**Where:** strings `localCosts.mandatoryLocal`, `localCosts.uncertainRange`. Remove the general
note in Overview once this is live.

### UI-10 — "View available dates" when only short trips exist
**Pages:** Results card, Hotel page · **Spec:** Ch1 §10 · Ch2 case 19 · Ch3 case 13

Automatic from-prices need at least 3 days (city trip) or 5 days (other). A hotel that only has
shorter trips stays in the list with "View available dates" and no price.

**Done when**
- Only a 4-day Antalya trip: card shows "View available dates"
- After the customer picks 4 days, the price shows

**API:** live (#296): each hotel in `/packages` has `fromPriceEligible` and `commercialMinDays`.
**Where:** string `price.viewAvailableDates` — in **results.json**, not common.json as stated above.

**Done** in `093ac29`. The API has answered `fromPriceEligible` since #296 and packageResults already
sorted those hotels last, but `mapPackage` never carried the flag to the card. What it prevents is
worse than a blank price: the short package has a real total, so a two-night trip at EUR 150 p.p.
would head a list of week-long holidays and undercut every one of them. Only an explicit `false`
withholds the price, so a field the API stops sending cannot blank the whole board. The paired
criterion needed no work: the card hands the hotel page its short package through the existing
parameters, and the matrix prices that duration normally.

### UI-11 — Same state wording everywhere
**Pages:** Results, Hotel page, Matrix · **Spec:** Ch1 §11

Use one set of words for the states: "Check price", "Not available", "Not available for your
selection", "Availability temporarily unavailable", "Price temporarily unavailable". Several pages
still use their own words.

**Done when**
- Timeout on the matrix → "Price temporarily unavailable", never "Not available"
- Direct hotel entry with nothing in the period: "No available stay found within the current
  search period"

**API:** `utils/availability.js` has the states.
**Where:** the price strip in `HotelDetail.jsx`.

**Done** in `c56368f`. A bar can carry no price for three reasons, and the strip had two words
between them: a live check that came back empty (a confirmed negative, and correct), a
`NO_VALID_COMBINATION` that also read "Not available", and a `SOURCE_ERROR` that fell through to
"Check live price" — inviting a check we had already tried and failed.

The third is the one that matters. `SOURCE_ERROR` means we failed to ASK, and reading it as "not
available" tells a traveller a holiday is gone when nobody ever looked.

Two things worth knowing before touching it again: a strip column is 78px wide on a phone, so the
bar carries a short form while the button's `aria-label` carries the canonical sentence (one
vocabulary, two lengths, deliberate); and `price.nonePeriod` lived in **results.json**, the wrong
namespace for a string three screens share, so it moved to `common.availability.nonePeriod` and
the hotel page's own `prices.noAvailability` is gone.

### UI-12 — Route control: two states (replaces the three-choice routing filter)
**Pages:** Results, Hotel page (alternative flights) · **Spec:** Ch1 §12B.9 · §12B.6

One shared control with two states. Default "Alle toegestane vluchten": every route the destination
airport's Flight Connection Policy allows. On: "Alleen rechtstreeks heen en terug": NONSTOP both
ways (a through stop is not nonstop). Switching it off returns to all permitted routes; it can
never open a route the destination policy forbids. The engine keeps NONSTOP / THROUGH_STOP /
CONNECTION internally; no three-option customer UI. Today the results page has
"Non-stop flights only".

**Done when**
- Destination DIRECT_ONLY: nothing to narrow, nonstop only either way
- Destination DIRECT_OR_MAX_1_STOP: off shows one-stop packages too; on keeps only nonstop out
  and back
- Changing it keeps every other choice and recalculates count, prices and matrix

**API:** `routing=NONSTOP` on `/packages`, `/package-matrix`, `/package-flights`; the destination
policy is applied by the backend (admin §12B.6 PR).
**Where:** strings (nl) "Alle toegestane vluchten", "Alleen rechtstreeks heen en terug". Replace
the `routing.nonstop / throughStop / oneConnection` usage.

### UI-18 — Popular departure airports first
**Pages:** Home, Results, Hotel page · **Spec:** Ch1 §12B.6

Departure airport lists show the Popular ones first (set in GeoData → Airports), then the rest in
the configured order. Order only: "No preference" still compares every active departure airport,
and prices, counts and from-prices never change because of it.

**Done when**
- Popular airports at the top of every departure list
- No preference: the cheapest package may still leave from a non-popular airport
- Toggling Popular in the admin never changes a shown price

**API:** the departure list returns `popular: true`, popular first (admin §12B.6 PR).
**Where:** `utils/airports.js` only, as it turned out.

**Done** in `a4cde56`. The registry already received `popular` per airport and sorted by `sortOrder`
alone, so the dashboard flag changed nothing visible. One comparator in `setDepartureAirports`
covers every list, because they all read `getDepartureAirports()` and none re-sorts it; the static
`POPULAR_AIRPORTS`/`OTHER_AIRPORTS` seed snapshots have no users outside their own module.

Knock-on worth knowing: `normaliseOrigin` falls back to the first airport on offer, so with the
default switched off it now lands on a popular one rather than the lowest `sortOrder`. Not a
price. And the homepage groups airports BY COUNTRY, so popular-first applies within each country
group there; that grouping predates this task and was left alone.

### UI-19 — Intermediate category pages: navigation only, "Toon alles"
**Pages:** Home → category pages · **Spec:** Ch1 §12B.1, §12B.4

Zonvakanties, Stedentrips, All Inclusive and Last Minute open an intermediate page listing their
geographic choices (from the backend mappings, not hard-coded) with no numeric prices. A choice
keeps the category and adds that geography; "Toon alles" keeps the category with no location.
Homepage numeric from-prices only on "Vind jouw zonbestemming" destination cards and
"Populair bij onze vakantiegangers" hotel cards.

**Done when**
- Stedentrips → Barcelona: results limited to Barcelona, still the Stedentrips type
- Toon alles: the category, every active destination
- No price on generic vacation-type cards or intermediate pages
- A year in a card title (Zonvakanties 2027) does not restrict dates

**API:** (admin #315) `GET /api/website/holiday-types/:idOrSlug/scope` →
`{ destinations, zones, hotelCodes }` the type covers. "Toon alles": send those destinations (and
hotelCodes) to `/packages` / `/contracts/cheapest`; a geographic choice: intersect with the chosen
country/destination. Countries per type: `/:idOrSlug/countries`.
**Where:** `Home/sections`, a new intermediate page.

### UI-20 — Last Minute 42-day default and All Inclusive by real board
**Pages:** Home entry, Results · **Spec:** Ch1 §12B.2

Last Minute starts with an auto-applied start period today → +42 days (Brussels), shown in the
search summary; a later date or clearing it replaces the default (no silent widening). All
Inclusive keeps only offers whose own room/rate has an AI-family board (AI, Ultra AI, mapped), for
every room; choosing another meal plan replaces the AI restriction.

**Done when**
- Last Minute: dates prefilled today → +42, editable; picking 15 March replaces it
- All Inclusive: a hotel with an AI theme but only HB rates does not qualify
- Half Board picked after an AI entry: no hidden AI constraint left

**API:** `GET /api/flight-availability/search-defaults` →
`{ lastMinute: { days, from, to }, allInclusiveBoards }`; Flight + Hotel:
`/packages?entry=last_minute` or `entry=all_inclusive` (applied only without customer dates / meal
plan; `entryApplied` in the answer). Hotel Only: send the same window and `boards` to SunSkyCache.
**Where:** entry handling in `searchStore.js`, `Results.jsx`.

### UI-22 — SearchContext precedence and product switching
**Pages:** Home, Results, Hotel page · **Spec:** Ch1 §12B.4

Per dimension: the customer's explicit choice, else an auto-applied entry choice, else the default.
A winning offer's date, duration, airport or board never becomes a customer filter. Changing one
dimension replaces only that one. Switching Flight + Hotel ↔ Hotel only keeps destination, party,
board, theme and dates (start = outbound vs check-in) and recalculates; airport and routing are
ignored for Hotel only but kept for a switch back.

**Done when**
- Card click to hotel page carries the exact winning package, not a filter
- Hotel only after Flight + Hotel: same party and dates, no airport filter applied
- Missing flights never switch the product automatically

**Where:** `utils/searchStore.js`, `utils/packageHandoff.js`, `Results.jsx`.

### UI-23 — Results filters per §12B.5
**Pages:** Results · **Spec:** Ch1 §12B.5

Remove "Soort vakantie" and "Soort kamer". "Thema's" includes Adults Only, Family and other backend
themes. Stars include "Zonder officiële classificatie" (positively unclassified; not apartments
with keys, not missing data). OR within accommodation type, stars, board and themes; AND within
facilities, activities and family features; AND across groups. Save/Apply panels stay draft until
saved; after applying, reset to the first 20.

**Done when**
- Two stars ticked = either; two facilities ticked = both
- Draft airport/board changes do not move prices or counts until Save
- No 50/100/150/200 page-size control

**API:** (admin #315) star filter value `0` = "Zonder officiële classificatie" (`stars=0`, also
counted in the star facet); each hotel row carries `classification` (star / key / unclassified /
unknown). Key ratings are no longer counted as hotel stars.
**Where:** `Results.jsx` filter panel, `ScopePicker`.

### UI-24 — Compact alternative-flight panel
**Pages:** Hotel page · **Spec:** Ch1 §12B.9

"Kies andere vlucht": the selected flight shown apart and excluded from the list; first 20 distinct
valid complete constructions, Show more adds 20 (no cap on what exists). Filters collapsed by
default: airlines that actually occur, outbound and return departure-time blocks, and the two-state
direct control (UI-12). No destination or home airport selector, price or duration slider, or
baggage purchase here. Each card: signed ± € p.p. against the current complete package (full totals
with the hotel), not the one-way flight difference.

**Done when**
- Selected flight not repeated in the list
- 20 + 20 paging
- Picking an alternative re-prices the complete package; nothing replaced silently

**API:** `GET /package-flights` (every valid flight for one stay with its price difference).
**Where:** `HotelDetail.jsx` alternative flights block.

### UI-25 — "Calculating…" for a party other than 2 adults / 1 room
**Pages:** Results, Hotel page · **Spec:** Ch3 §8A · Ch1 §2

Only the default party (2 adults, 1 room) is precalculated. Any other party (3 adults, a child,
2 rooms…) is computed on request (a cold Antalya search took ~17 s). While that answer is on its
way, show a "Calculating…" state on the cards and count, never a 2-adult price for another party,
and never "No results".

**Done when**
- 3 adults: cards show "Calculating…" until their own prices arrive
- The count shows the calculating state, then the exact total
- No 2-adult price is ever shown for a 3-adult search

**API:** `/packages` answers per destination group; an unanswered group is still calculating (the
page already tracks groups).
**Where:** `Results.jsx` package groups, `HotelDetail.jsx` matrix loading state.

---

## Later

Lower impact, or waiting on data or another team.

### UI-13 — Destination counts in the destination filter
**Pages:** Results · **Spec:** Ch1 §5

"Turkey 624, Spain 811" next to each destination, counted on unique hotels under the other filters
(not added up from children).

**Done when** Turkey + Antalya selected: a hotel counts once.

**API:** Flight + Hotel `/packages` answers `destinationFacets.counts`; Hotel only
`/contracts/cheapest` answers `destinationCounts`. Per destination code; a country or region = the
sum of its destinations.
**Where:** `ScopePicker`.

### UI-15 — W2M-only hotels as a second group with "Check price" · BLOCKED
**Pages:** Results · **Spec:** Ch2 §3–4 · Ch3 §5

After all Hotelbeds hotels, the hotels only W2M has, priced "Check price", always after the priced
ones in price sorts.

**Done when** price sort never moves a W2M-only hotel above the Hotelbeds group.

**API:** waiting on the W2M availability index (W2M agent).

### UI-16 — Flights only from the cache
**Pages:** Flights · **Spec:** build order (extra)

Search results from the cache in milliseconds, then one live check when the customer clicks Select.
The contract treats Flight Only as a later chapter.

**Done when** Select → confirmed, price changed or not available, shown before booking.

**API:** `POST /flight-availability/cached-search` and `/cached-search/confirm`.
**Where:** `Flights.jsx`.

**Done** in `4700b45`. The list reads `cached-search`, falling back to the live `/search` when the
cache answers `complete: false` (no return fare imported for that route and date, which is a gap
in the import, never a sold-out route). Select posts `cached-search/confirm` and the page shows
which of the four outcomes happened.

The rule the implementation is built around: **only a definite `NOT_AVAILABLE` from the server
disables a flight.** A 502, a timeout, a dropped connection or an answer we do not recognise all
read as "could not check right now", with the button still live. Reporting an unreachable supplier
as "sold out" walks a customer away from a flight they could have bought, and nothing in the system
would ever record that it happened. A `CONFIRMED` carrying no `flightKeys` is refused for the
mirror-image reason: it would send someone to checkout holding nothing to reserve.

Two things worth knowing if this is touched again: the supplier's legs are kept on each mapped
flight untouched (`flight.confirm`), because the confirm re-finds the itinerary by airline, flight
number and local departure to the minute, so anything rebuilt from the display shape misses; and
the check state is keyed to its search rather than cleared in an effect, since flight ids are
rebuilt per search and a stale result would otherwise land on an unrelated card.

### UI-17 — Sort rules: unknown values last, stable ties, Hotelbeds group first
**Pages:** Results · **Spec:** Ch2 §4 · Ch3 §5

Stars, distance and name sorts: hotels without a reliable value go after the ones with a value, in
both directions (today stars low → high puts hotels without a category first). Equal values keep a
stable order on the hotel ID. Once W2M-only hotels appear, the Hotelbeds group stays first in every
sort, and Check price comes after known prices within a group.

**Done when**
- Stars 1 → 5: hotels without stars at the end
- Two hotels with equal stars keep the same order on every reload
- Price sort: Check price after every priced hotel of the same group

**API:** not needed (client-side sorts over loaded results).
**Where:** `Results.jsx` (the `hotels` useMemo with name / stars / distance sorts).

### UI-21 — Optional date range per homepage card
**Pages:** Home · **Spec:** Ch1 §12B.3

A card configured with Enable Date Range applies its Start–End to the travel START date only
(outbound for packages, check-in for hotels), shown in the search summary. A Last Minute card with
its own range replaces the 42-day default. A customer date change replaces it.

**Done when**
- Range 1 Jun–31 Aug: outbound in that window, return may fall after
- Enable Date Range = NO: stored dates have no effect

**API:** each Travel Categories card in the homepage config carries `enableDateRange`, `startDate`,
`endDate` (validated on save). Apply only when enabled; package searches longer than 31 days go
month by month.
**Where:** homepage cards, `utils/searchStore.js`.

### UI-26 — Admin: Monitoring page · not this repo
**Pages:** Admin panel → System · **Spec:** Ch1 §12A

Belongs to **sunsky-admin**, listed here only because it came in the same backlog. One admin page
showing `GET /api/system/monitoring`: a top status (OK / Attention with the list of problems), then
four panels — Search cache (pid, memory, workers ready), Hotelbeds updates (last update and its
age, failures in a row, run in progress, staged ingest on/off, last 10 runs), Airtürk imports (last
run status, last success age) and W2M mappings (total, verified, auto, pending). Refresh button; a
panel that could not be read shows its error, never a blank page.

### UI-27 — Facet counts on complete offers (stars, facilities) · BLOCKED
**Pages:** Results · **Spec:** Unified Results §9.3 · T12 · T25

Star and facility counts count distinct hotels that have a qualifying complete offer under every
other filter: 4★ OR 5★ counts each hotel once; pool AND aquapark counts the intersection. Today
these counts come from hotel content only.

**Done when**
- 4★ + 5★ ticked: the count equals the hotels shown
- Pool + aquapark: count = hotels with both

**API:** needs offer-eligible star/facility counts from `/contracts/cheapest` and `/packages`
(backend design first). **Needs API.**

---

## Please verify

Code exists but was not confirmed end to end. Test, then move to done or open a task.

| Check | Spec |
|---|---|
| Clicking a matrix cell moves the ± window and keeps the flexibility mode | Ch1 §7 |
| An active price filter leaves out "Check price" hotels | Ch1 §2 |
| "Check price" sorts after priced hotels in both price sorts | Ch2 §4 |
| Two rooms always get one common board | Ch2 §5 |
| Matrix: an alternative date outside the flexibility window leaves the SearchContext unchanged until clicked | Unified Results T29 |
| Results card → hotel page keeps the exact SearchContext, winner, dates, rooms and airports | Unified Results T21 |

---

## Findings while building

Things learned in this repo that the backlog does not say. Add to this as we go.

### 0. Two file paths in the backlog are wrong, and one namespace trap bites silently

`usePackageMatrix.js` is at **`src/pages/HotelDetail/usePackageMatrix.js`**, not `src/hooks/`.
`searchStore.js` is at **`src/utils/searchStore.js`**, not `src/store/`. Both matter for UI-03,
UI-20, UI-21 and UI-22.

More important: the backlog says the ready-made strings are in `common.json`, and they are, but
`HotelDetail.jsx` binds its translator with `useTranslation('hotelDetail')`. A bare
`t('offer.included', 'Included')` therefore resolves against the wrong namespace, finds nothing,
and **renders the English default** — so the page looks right in a test and in English, while a
Dutch traveller reads "Included". Use the `common:` prefix (`t('common:offer.included', …)`),
which this file already does for `nav.home` and the calendar names.

This is invisible unless you either watch for the `[i18n] missing hotelDetail:…` warning in a
test run or assert on the Dutch string. Any task pulling `feasibility.*`, `localCosts.*`,
`availability.*` or `listing.*` into a page with its own namespace has the same trap waiting.

### 1. UI-01 / UI-02: the feasibility endpoint has two branches, and only one returns dates

`GET /api/flight-availability/feasibility` behaves differently depending on which parameter it
gets, and the two are mutually exclusive in the controller
(`packageFeasibility.controller.js`, `if (destList.length) { … return }`):

| Called with | Service | Returns |
|---|---|---|
| `destinations=` (hotel destination codes, max 60 per batch) | `packageAirports` | `origins`, `arrivals`, `byDestination` — **no dates** |
| `arrivals=` (destination **airport** codes, max 10) | `packageFeasibility` | `departureDates`, `durations`, `origins`, `arrivals` |

`usePackageAirports` uses the first branch, so the date data UI-01 needs is **not** reachable from
the call the site already makes. As the API stands, UI-01 means resolving destinations to arrival
airports first (available as `byDestination[dest].arrivals`) and then calling again with
`arrivals=`, capped at 10 airports and 31 days per request, so one request per visible calendar
month on three screens.

**RESOLVED 16 Oct 2026.** The cache team added `departureDates`, `durations` and `truncated` to
the `destinations=` branch, so one question answers it. Verified live:

```
GET /api/flight-availability/feasibility?destinations=AYT&adults=2&children=0
keys: success, window, origins, arrivals, byDestination, departureDates, durations, truncated
```

`usePackageDepartureDates` now asks with `destinations=` and no longer waits on
`usePackageAirports` first. The bigger win is the ceiling: it was **ten arrival airports**, which
a search across a few countries passes easily, and past it the calendar greyed nothing at all.
It is now **sixty destinations** (the server's `MAX_FEASIBILITY_DESTINATIONS`), so the greying
works on the wide searches that need it most. One hotel passes `hotelCode` too, which makes the
server narrow to the arrival airports whose GeoData scope covers it.

The response shape to build against, from `docs/api/flight-feasibility.md` in sunsky-admin:

```json
"departureDates": [
  { "date": "2026-11-03", "fromPrice": 380, "currency": "EUR",
    "origins": ["BRU"], "arrivals": ["AYT"], "travelDays": [8, 15], "nights": [7, 14] }
]
```

Only feasible dates are listed, so "unavailable" means "in the window but absent from the list".
That inference is **only valid when the answer is complete**: with `truncated: true`, or an arrival
whose `status` is `UNKNOWN` (`NO_RETURN_FARES`), absence proves nothing and nothing may be greyed.
This is the "Unknown is not impossible" rule in concrete form.

---

## Already complete

Merged and live. Listed so nobody redoes it.

| What the customer gets | Spec | PR |
|---|---|---|
| Undated search says "Any date"; the arrival-airport block only with two or more airports | Levent 15 Oct | web #67 |
| Destination links from a holiday type keep the type applied | §12B.1 · §12B.4 | web (15 Oct) |
| Price filter on the total trip / stay price only; per-person switch removed | Unified Results §8.1 · T26 | merged 13 Oct |
| Hotel only / Incl. flight on Home, Results and the hotel page | Ch1 §4 | #54 |
| Results "Incl. flight" lists complete packages only | Ch3 §1 | #54 |
| Results card → hotel page opens with the same package and price | Ch3 §5 | #55 |
| Hotel page: live round-trip price; no hotel-only price flash during the check | Ch3 §7 | #57 |
| Hotel page price strip scales on the price it shows | Ch3 §6 | #56 |
| Departure and arrival filters show only airports that can make a package | Ch1 §9A | #58 |
| Default order: stable random per session, count and pages from one snapshot | Ch1 §2 | #63 #65 |
| "No flight + hotel packages to Albania and Bulgaria for these dates" notice; Hotel only Recommended = random | Ch1 §2 · Levent 9 Oct | merged |
| Hotel page: "This hotel is not available" for a switched-off hotel | Levent 8 Oct | merged |
| Airport filters proven by complete packages; an earlier choice that no longer works stays ticked with "Not available" | Ch1 §9A | #59 |
| Departure / arrival airports on wide searches; results stay 20 + "Show more" | Levent 7 Oct · §12B.5 | #60 #61 |
| A failed search says so with a retry, never "No results" | Ch1 §11 | #49 #57 |
| 20 cards, "Show more", total above the list, "Cheapest" label | Ch1 §2 | #49 |
| Empty search covers every destination with stock | Ch1 §2 | #51 |
| Hotel names never replaced by codes; photos load with the cards | — | #48 #53 |
| From € X p.p. only for 2 adults / 1 room; otherwise Total trip / stay price + average | Ch1 §8 | #44 |
| Child ages sent to package fares; teen input | Ch1 §8 | #43 |
| Package flights follow the airport policy from the admin | Ch1 §9 | #42 |
| "Non-stop only" filter on Results; Non-stop / one connection on the hotel page | Ch1 §9 | #45 |
| Whole-euro rounding; matrix p.p. rounded up | Ch1 §8 | #39 |
| Trip lengths 2–5 … 25–29 days; 29-day maximum | Ch1 §7 | — |
| Calendar with ±1/±2/±3 flexibility | Ch1 §7 | — |
| Hotel page 7-date package matrix with paging; hotel-only 7-day strip | Ch2 §6 · Ch3 §6 | — |
| "Check price & availability", automatic re-check afterwards, retry on failure | Ch2 §6 · Ch3 §6 | — |
| Flight details popup with baggage per leg | Ch1 §8 | — |
| Alternative flights with ± € p.p.; a gone flight is never swapped | Ch3 §6–7 | — |
| Optional baggage only in checkout | Ch1 §8 | — |
| Live check across Hotelbeds, W2M and Diana | Ch2 §6 | — |
| Sort by price, name, stars, distance to beach / centre | Ch2 §4 | — |
| Whole site in Dutch | — | #35–#38 |
