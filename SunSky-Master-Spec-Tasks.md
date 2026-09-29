# SUNSKY Master Spec: Website and Dashboard Tasks

Extracted from `SUNSKY_Master_Developer_Specification.docx` (final consolidated master, 26 Sep 2026; Part I functional contract dated 25 Sep 2026).

This file lists every change the spec asks of:

- **sunsky-website**, the React site
- **sunsky-admin**: the dashboard UI and the admin backend, including the public `backend/website` APIs

**Cache work is left out:** SunSkyCache (Hotelbeds cache) and the Airtuerk flight cache. Section 6 lists what the cache must deliver, because some tasks below cannot be finished without it.

Extracted 29 Sep 2026. Target: 30 Sep 2026.

---

## How to read this

| Tag | Where the work lands |
|---|---|
| `WEB` | sunsky-website |
| `API` | sunsky-admin backend (`backend/`, including `backend/website/`) |
| `DASH` | sunsky-admin dashboard UI |
| `CACHE` | needs data or logic from the cache (the cache part itself is not in this list) |

**Spec references**

| Reference | Meaning |
|---|---|
| `I.1 §9` | Part I, Chapter 1 (entry points, search context), section 9 |
| `I.2` | Chapter 2 (Hotel Only) |
| `I.3` | Chapter 3 (Flight + Hotel) |
| `II` | Part II (hotel suppliers and live check) |
| `III` | Part III (flight construction) |
| `IV` | Part IV (package ranking) |

**Now:** notes record what the code does today, where we have checked it.

### Five rules that apply to every task (spec guardrails)

1. **Don't invent behaviour the spec does not define.** Escalate it instead (section 7).
2. **Never show CHECKING, PRICE_UNKNOWN or SOURCE_ERROR as "Not available".** Only confirmed unavailability is UNAVAILABLE.
3. **Never silently replace a choice the customer made.** If it becomes invalid, keep it visible with its status and offer alternatives.
4. **Flight + Hotel defaults to the cheapest complete package** (`sunsky_payable_total`), never the cheapest flight on its own.
5. **Some topics are out of scope in the spec itself:** checkout and payment orchestration, booking order, rollback and recovery, and the Flight Only search and results flow. Don't build these from this document.

---

## 1. Suggested order

This is more than one day of work. Split it like this.

**A. Website only, can ship now (no backend change)**

- [ ] Stop showing a cache or API failure as "No results found" (2.1).
- [ ] Add the shared state texts and a retry action (2.1).
- [ ] Show "From € X p.p." only for 2 adults + 1 room. Otherwise show the total (2.4).
- [ ] Change the defaults:
  - Flight + Hotel on `/results` too.
  - All active departure airports ("No preference") instead of BRU.
  - No default price sort (3.2, 3.8).
- [ ] Replace infinite scroll with a "Show more" button (+20) (3.8).
- [ ] Use the count label "N holidays found" / "N holidays in Turkey" (3.8).
- [ ] Airports with no flight: disable them with a reason, don't hide them (3.7).
- [ ] Routing labels: "Non-stop" / "Stop without connection" / "Maximum one connection". Never "2 stops" (3.6).
- [ ] Place the mandatory local costs block directly under the price, before the button (2.2).
- [ ] Remove every silent reset of a customer choice (2.7).

**B. Needs admin backend and dashboard work** (section 4)

- Master data: airports, destination airports, classification, routing policy.
- SearchContext validation.
- Multi-supplier live hotel check and the normalized offer model, including local costs.
- Rounding.
- Flight construction (RT_FULL and SPLIT_OW, routing classification).
- Package engine.
- Audit and logging.

**Part of B is already written in sunsky-admin.** These services have their own tests, but nothing calls them yet. Wiring them in is the fastest backend progress.

| Service (under `D:\sunsky-admin\backend\website\flight-availability\services\`) | What it already does | Spec |
|---|---|---|
| `routingClassification.service.js` + `../data/routingPolicy.json` | Classifies each direction as NONSTOP / THROUGH_STOP / CONNECTION and applies connection limits per policy | I.1 §9, III §6-10 |
| `travellerAges.service.js` | INFANT / CHILD / TEEN / ADULT, per airline | I.1 §8 |
| `packageDates.service.js` | Hotel check-out from the return flight time, with the 04:00 cutoff | I.1 §6, I.3 §2 |
| `packageSelection.service.js` | Cheapest complete package wins | I.3 §1, IV |
| `flightFeasibility.service.js`, plus `buildFeasibilityEngine` in `flightCacheQuery.service.js` | `FlightFeasibilityIndex` and the feasibility engine | I.1 §9A |

**C. Needs the cache first** (section 6)

- Result count engine with snapshot pagination.
- Source groups and random order.
- Sorting over the whole result set.
- Facet counts.
- From-price engine.
- Flight feasibility index.
- Calendar and matrix states.

---

## 2. Shared rules (every screen)

### 2.1 Availability and price states `WEB` `API`
*I.1 §11, §12 · I.2 §5A, §6 · I.3 §6 · II §17*

Results, the hotel detail page and the matrix use one state machine.

| State | Meaning | UI (EN, spec wording) |
|---|---|---|
| `CHECKING` | Check or recalculation running | Loader/skeleton, or "Checking availability..." / "Checking price...". Customer choices stay on screen. |
| `AVAILABLE` | Complete combination available with a valid price | The price; selectable |
| `UNAVAILABLE` | **Confirmed** not available | "Not available"; no automatic alternative |
| `PRICE_UNKNOWN` | Availability substantiated, no reliable price | "Check price"; a live check is required |
| `SOURCE_ERROR` | Outage, timeout or invalid answer | "Availability temporarily unavailable" or "Price temporarily unavailable" (by cause); never "sold out" |
| `NO_VALID_COMBINATION` | Parts exist, but nothing fits all active choices | "Not available for your selection"; filters are not changed |

- Priced offers also carry `offer_validation = INDICATIVE | LIVE_CONFIRMED`:
  - A cache price is AVAILABLE + INDICATIVE.
  - After a successful live check, the same selection is AVAILABLE + LIVE_CONFIRMED.
  - The final revalidation before booking is still mandatory.
- "Check availability" is **not** a state and not a matrix label.
- The backend may store a finer cause (flight, hotel, room or board unavailable). The frontend does not need separate states for it.

Tasks:

- [ ] `API` Return `state` (plus optional cause) and `offerValidation` for everything the site shows: result cards, matrix cells, duration buttons, rooms and flights.
- [ ] `WEB` One shared helper maps state to presentation (for example `src/utils/offerState.js`). Use it on cards, matrix cells, duration buttons, room rows and flight rows.
- [ ] `WEB` Never render "Not available" or an empty result for a timeout, an error, a missing price or an incomplete answer.
  - **Now:** when the cheapest call fails, `Results.jsx` (~line 1349) clears the list and the page shows "No results found".
  - **Now:** a load-more failure (~1430) stops silently.
  - **Now:** a failed duration count (~1384) just drops the badge.
  - Show `SOURCE_ERROR` with a retry action instead.
- [ ] `WEB` While `CHECKING`:
  - Keep the customer's choices on screen.
  - Never show the previously confirmed price as the price of a new selection.
- [ ] `WEB` When a check fails:
  - The new choice stays visible.
  - No bookable price is claimed.
  - A retry button appears.
  - An unavailable cell or duration never starts a live check.

### 2.2 Price fields and mandatory local costs `WEB` `API`
*I.1 §10 · I.2 §5 · I.3 §4 · II §13, §16*

| Field | What it is |
|---|---|
| `sunsky_payable_total` | What the customer pays SUNSKY. It is the **only** amount used for: from price, price sorting, "Cheapest", the winning departure airport, the room/board winner and price filters. |
| `local_mandatory_known` | Mandatory taxes or levies paid on site that can be calculated exactly in advance. **Never** added to the SUNSKY total, and not collected by SUNSKY. |
| `local_mandatory_unquantified` | Mandatory local costs whose total can't be known before booking. Store and show the nature of the cost plus the basis or range. No invented total. |

- [ ] `API` The normalized offer carries all three fields separately (4.3).
- [ ] `WEB` Build the price block wherever a price sits next to a proceed action (result card, hotel detail, checkout):
  ```
  Payable to SUNSKY € 990
  Mandatory payment locally: € 5 p.p. per night            <- exact amount or basis
  Total known cost of the trip € 1,060                      <- only when the local total is exact; informational
  [ Continue ]
  ```
  - Put it directly next to or under the main price, before the button.
  - Never only in a tooltip, a collapsed block, or first in checkout.
  - **Now:** the hotel page shows a generic note, "Any local tourist tax is payable at the property" (`HotelDetail.jsx` ~4061). It does not show the offer's actual amount.
- [ ] `WEB` Show exact local amounts to the cent: €12.40 stays €12.40. Only SUNSKY selling prices are rounded.
- [ ] `WEB` For an uncertain amount, show text and no total. Example: "Mandatory payment locally: tourist tax, local rate approx. €7-€10 p.p. per night; exact amount determined locally".
- [ ] `WEB` Optional extras count only after the customer explicitly selects them.

### 2.3 Rounding `API` (display: `WEB`)
*I.1 §8 · I.2 §5 · I.3 §4*

- [ ] `API` **Flight + Hotel:** round the complete package once, up to a whole euro (€501.10 → €502).
  - Never round hidden flight or hotel parts separately.
- [ ] `API` **Hotel Only:** round each booked room stay (all nights together) up, then add the rounded room stays (€199.36 → €200, €202.14 → €203).
  - Never round single nights.
- [ ] `API` Round every selected baggage item or SSR up per unit (€24.98 → €25), then add it.
- [ ] `API` Keep the original cent amounts for verification and settlement.
- [ ] `WEB` Show whole euros only for SUNSKY prices. Checkout adds already-rounded units and never rounds the sum again.

### 2.4 Main price: per person or total `WEB`
*I.1 §8, §10 · I.2 §5 · I.3 §5*

**Result cards and the hotel detail page**

- "From € X p.p." as the main price is allowed **only for exactly 2 adults + 1 room, with no children and no infants**.
- Every other composition shows the total as the main price:
  - Flight + Hotel: "Total trip price € X"
  - Hotel Only: "Total stay price € X"
- An average per person may be added as a secondary line, clearly labelled as an average.

**Matrix cells**

- Always "From € X p.p.", whatever the composition.
- Formula: `ceil(rounded total ÷ non-infant travellers)`.
  - Children count; infants (0-1) don't.
  - Never divide by rooms.
  - Infant costs stay in the total.

| Total | Travellers | Matrix shows |
|---|---|---|
| €1,200 | 2 adults | €600 p.p. |
| €1,300 | 2 adults + infant | €650 p.p. |
| €1,500 | 2 adults + child | €500 p.p. |
| €1,900 | 5 adults, 2 rooms | €380 p.p. |
| €1,950 | 5 adults + infant, 2 rooms | €390 p.p. |
| €1,501 | 3 counted travellers | €501 p.p. (full price stays €1,501) |

- [ ] `WEB` Card and detail main price follow the rule above.
  - **Now:** `Results.jsx` `PRICE_BASIS_OPTIONS` lets the user switch the main price between "Total" and "Per person" ("Per room/stay" for Hotel Only). Per the spec, that toggle can at most control the secondary "average" line. See section 7.
- [ ] `WEB` Add a matrix p.p. helper, unit-tested with the table above.
- [ ] `WEB` Compare, sort, filter, live-check and book on the full total, never on the p.p. figure.
- [ ] `WEB` An infants-only party is invalid: `non_infant_count` must be at least 1. Block it in the traveller picker.

### 2.5 Option price differences on the detail page `WEB` `API`
*I.1 §8 · I.2 §6 · I.3 §6*

- The reference is the currently selected complete combination. When the page opens, that is the automatic cheapest one, labelled **"Included"**.
- For each alternative room, board or flight:
  1. Rebuild the complete rounded price with all other current choices.
  2. Subtract the current rounded total.
  3. Divide by adults + children (infants excluded).
  4. Round up and show "+€ X p.p." or "-€ X p.p." (optionally "cheaper").
- The chosen option shows **"Selected"** and no difference.
- The previously selected option becomes an alternative, with a freshly recalculated difference (never a fixed number).
- Never add a flight surcharge and a room surcharge together. A different flight can change hotel dates, rates and room availability, so recompose the whole package.
- An option that can't be booked together, or has no price, shows "Not available" or "Check price", with no number.
- Packages never show a separate public flight price or hotel price.
- After a choice, the new current total is shown at the top and all other differences are recalculated.

### 2.6 From price and tie-breaks `API` (results: `CACHE`)
*I.1 §10 · I.2 §5 · I.3 §3*

Winner order:

1. Lowest `sunsky_payable_total`. The rounded p.p. figure does not count.
2. Longest duration: travel days for packages, stay days for Hotel Only.
3. Start date closest to `from_price_reference_date`:
   - It is the customer's date if one was chosen, otherwise today in Europe/Brussels.
   - Compare the local outbound date for packages and the check-in date for Hotel Only.
4. If equally close, the earlier date.
5. `candidate_stable_key` ascending: deterministic, with no commercial preference.

Minimum duration for the **automatic** from price (when no exact duration is chosen):

- City trips: at least 3 days.
- Everything else: at least 5 days.

A shorter valid candidate still counts as a result, but gets no numeric from price. Show **"View available dates"** instead; it is not the same as "Check price".

The from-price winner is **atomic**. Price, date, duration, airport, flight, hotel dates, room and board all come from the same candidate, never mixed.

### 2.7 Explicit choices are never silently replaced `WEB` `API`
*I.1 §3, §7, §9, §9A · I.2 §4, §6 · I.3 §5, §6*

- [ ] `WEB` Changing one filter replaces only that value. Everything else stays, and results recalculate with all active filters together.
- [ ] `WEB` When a combination is impossible:
  - Show no matching result, or ask the customer to change a choice explicitly.
  - Never reset another filter, airport, room or board.
- [ ] `WEB` When a date, airport, flight or duration that was valid becomes invalid (after a cache update or a context change):
  - Keep it visible with "Not available".
  - Offer alternatives.
  - Never swap it automatically.
- [ ] `WEB` A date found by the engine (from-price winner or availability anchor) is shown with the offer. It becomes a search choice only when the customer clicks it.
- [ ] `WEB` Audit the handlers on the homepage search, the results sidebar and the hotel page for silent resets and auto-corrections. Examples: jumping to an adjacent date, dropping an airport, or falling back to a default band.

---

## 3. Website tasks by screen `WEB`

### 3.1 One shared SearchContext
*I.1 §3, §4, §6*

The context holds:

- product
- destinations: countries, regions, places, or one hotel
- date and flexibility (exact, ±1, ±2, ±3)
- duration band, and an optional exact number of days
- travellers (with date of birth) and room allocation
- departure airports
- destination airports
- flight routing filter
- holiday types and themes
- optional SUNSKY hotel ID

It describes the request only. Availability and price are results.

- [ ] One SearchContext shape, read and written by the homepage, results and hotel detail. The URL is its serialized form.
  - **Now:** the pieces live in `src/utils/searchStore.js`, `src/utils/paxStore.js`, the Results URL params and `Hero.jsx` state.
- [ ] Product can be switched in three places: the search engine, the results product filter and the hotel matrix filter. All three write the **same** value.
- [ ] Switching product keeps the hotel and the usable criteria; offers and prices are recalculated.
  - Missing package flights never flip the product automatically.
- [ ] Hotel Only makes no flight calls, and the airport and routing filters don't apply.
  - A previously selected airport is kept in the context for switching back.
- [ ] Label dates by product:
  - Hotel Only: check-in / check-out.
  - Flight + Hotel: outbound / return flight date.

### 3.2 Entry points and homepage
*I.1 §1, §2, §10*

- [ ] The homepage search is optional.
  - "Show holidays", holiday-type, theme and destination cards open `/results` with those criteria filled in.
  - Missing criteria are completed on the next page.
  - All entry points use the same availability and pricing rules.
- [ ] Defaults when the customer chose nothing:
  - Flight + Hotel
  - 2 adults, 1 room
  - **all** active departure airports ("No preference")
  - no date, no duration
  - **Now:** `origins` defaults to `[DEFAULT_ORIGIN]` = BRU (`src/utils/airports.js`, `Hero.jsx` ~319).
  - **Now:** `/results` defaults `transport` to `hotel_only` (`Results.jsx` `EMPTY_FILTERS` ~172, parse ~706).
- [ ] With no destination, search **all** active destinations and keep every other criterion.
  - **Now:** an empty search uses a curated list of 8 sun destinations (`DEFAULT_DESTINATIONS` in `Results.jsx`), with `source=external`.
- [ ] Choosing a hotel by name opens its detail page directly, with no results page in between.
  - It keeps the whole SearchContext and only narrows the hotel scope.
  - It never resets date, duration, travellers, rooms or airports.
- [ ] Any change of product, destination, dates, flexibility, duration, travellers or rooms, airports or offer filter recalculates every dependent offer, count, from price and matrix value.

### 3.3 Destinations
*I.1 §5*

- [ ] Zero or more countries, regions or places, or one hotel.
- [ ] Several choices combine as a union (OR).
- [ ] The backend expands the choices to the full active scope (country, then regions, then places, then hotels) and de-duplicates by Hotelbeds hotel code. Turkey + Antalya + Side counts each hotel once. (`CACHE` / `API`)
- [ ] The count label may include the scope: "624 holidays in Turkey", "96 holidays in Barcelona".
- [ ] Destination facet counts (for example "Turkey 624") must be:
  - dynamic under all other filters
  - counted on unique hotel codes
  - never static content counts
  - never the sum of the child counts (`CACHE`)
- [ ] A package never combines a hotel and flights from different destinations.

### 3.4 Dates, flexibility and duration
*I.1 §6, §7 · I.2 §2, §5A, §6 · I.3 §2, §3, §5A, §6*

- [ ] Flexibility: exact, ±1, ±2 or ±3 days.
  - **Now:** already exists (`flex` URL param, `DateCalendar` flex strip, `searchStore.flexDays` 0-3). Check that results and hotel detail apply it the same way.
- [ ] Duration bands: 2-5, 6-10, 11-16, 17-24 and 25+ travel days, where 25+ means 25-29.
  - **Now:** `src/utils/durations.js` already matches, with `MAX_TRAVEL_DAYS = 29`.
- [ ] Count days correctly.
  - **Hotel Only:** stay days = (check-out − check-in) + 1, and nights = check-out − check-in. Example: 8 days from 25 Oct is check-out 1 Nov, 7 nights.
  - **Packages:** travel days run from the outbound departure date to the return departure date. Hotel nights come separately from the flight times, and are **not** simply days − 1.
  - **Now:** `durations.js` applies days = nights + 1 to both products. That is right for Hotel Only only.
- [ ] 29 days is the absolute maximum everywhere: results, matrix, live checks, URL/API and checkout. Hotel Only therefore allows at most 28 nights.
- [ ] Without an exact duration, the cheapest matching duration in the band wins for each date (not the shortest). With an exact duration, only that duration is evaluated.
- [ ] Without a date, start dates run from the earliest bookable day to 12 calendar months ahead (Europe/Brussels). The found date is shown on the offer but is not a customer choice.
- [ ] **Package hotel dates**
  - Check-in is the local arrival date at the destination airport.
  - Check-out is the local departure date of the return flight, except for departures between 00:00 and 03:59, which check out the **previous** day. A departure at exactly 04:00 checks out the same day.
  - Show the included hotel nights and the normal check-out conditions. An early-hour flight does not keep the room until the evening.
  - Computed in `API`, shown in `WEB`.
- [ ] **Flight + Hotel calendar**
  - Feasible departure dates are selectable.
  - Proven impossible dates are disabled.
  - Unknown dates are never shown as "no flight".
  - With no date chosen, open on the first month that has a feasible date. The calendar may say "Earliest possible departure: 14 March 2027" or "1 possible departure date found".
  - A date is selected only on click.
- [ ] **Hotel Only calendar:** confirmed unavailable check-in dates are disabled for a new pick; unknown dates are not shown as sold out.
- [ ] If the customer picks an unavailable date on purpose, keep it and show "Not available". Never move them to a neighbouring date.

### 3.5 Travellers and rooms
*I.1 §8*

- [ ] Store each traveller separately, with date of birth and room allocation. Age is calculated on the service or flight date.
  - **Now:** children have a date of birth (`DobPicker`, `src/utils/childDob.js`); adults are only a count.
  - **Now (admin):** at booking, the passenger type is worked out from the age **today** (`onlineBooking.controller.js` ~58-66), but the price check uses the age on the travel date (`priceValidation.service.js` ~113). The two can disagree.
  - **Now:** a missing child age silently becomes 8:
    - on the site (`CHILD_AGE_DEFAULT` in `Results.jsx`)
    - in the admin Hotelbeds call (`hotelbeds.service.js` ~131)

    The spec wants the real age sent (acceptance case "child aged 14").

| Age | Flight component | Hotel component |
|---|---|---|
| 0-1 | Infant | Infant |
| 2-11 | Child | Child |
| 12-15 | Teen | Child |
| 16+ | Adult | Adult |

- [ ] `API` Map passenger types per airline:
  - Send TEEN only to airlines where it is confirmed: currently Ryanair and Buzz.
  - easyJet: 12-15 → CHILD.
  - Other airlines follow their own validated rules.
  - Without a valid mapping there is no bookable flight option.
  - "Teen" is never sent as a supplier code.
  - **Now:** `travellerAges.service.js` implements this, but only its test uses it.
- [ ] `API` Ryanair accompaniment:
  - Anyone under 16 needs an 18+ traveller on the same booking.
  - A 16-17-year-old flies as an adult but does not count as an accompanying person.
  - A birthday during the trip means outbound and return are classified separately. If that makes a round trip impossible, try an allowed split construction.
- [ ] `API` The hotel side gets each child's real age. The hotel rate decides occupancy and price; age 15 is not a guaranteed child rate.
- [ ] `WEB` The default for from prices is 2 adults and 1 room. Once the customer picks a composition, use only that.

### 3.6 Airports and flight routing
*I.1 §9 · I.3 §1, §5 · III §6-10 · IV §3-9*

- [ ] **Departure airports**
  - Only the active SUNSKY Departure Airports master list is offered.
  - "No preference" means all active airports.
  - An airport off the list can never be selected, and is not accepted via URL/API either.
  - **Now:** the list is fetched from the dashboard (`terminals.isDeparture`, `useDepartureAirports`), with a seed fallback in `src/utils/airports.js`. Make sure the seed can never offer an airport the dashboard has deactivated.
- [ ] **Several departure airports**
  - They combine as OR and are sent as a list.
  - The winner is the airport with the cheapest complete package, and it is shown on the offer.
  - **Now:** `origins` exists, but the value used downstream is the single `origin` (`Hero.jsx` ~317).
- [ ] **Destination airports**
  - Without a filter, every approved destination airport is evaluated.
  - Outbound and return always use the same one.
- [ ] **Flight routing filter**
  - One SearchContext value, shown in two places: the results airport filter and the alternative flights on the hotel page.
  - Choices: "Non-stop", "Stop without connection", and only for Long-haul destinations with MAX 1 CONNECTION, "Maximum one connection".
  - Choices combine as OR within the filter and AND with the other filters.
  - Default: every category the destination allows is on.
- [ ] **Remove the old "priority class" logic.** The spec forbids preferring a routing type automatically.
  - **Now:** the rule "direct, then 1 stop, then 2 stops; a direct at any price wins" is in:
    - `src/utils/flightPriority.js` on the site
    - `HotelDetail.jsx` ~2558
    - the admin `flightSelection.service.js` ~20-24, which the cached package fares use

    All of these allow 2 stops (`MAX_STOPS = 2`) and count stops as legs − 1.
  - **Now:** the live flight search (`airtuerk.service.js`) also counts stops as legs − 1 and applies no routing policy.
  - **Now:** the spec-correct classification already exists (`routingClassification.service.js` + `routingPolicy.json`), but nothing uses it.
  - **Now:** package cards show `direct` / `1 stop` / `2 stops` (`Results.jsx` `FLIGHT_CLASS_LABEL`).
  - Per the spec:
    - The default is the cheapest complete package.
    - 2 connections are never valid.
    - "1 stop" must be split into THROUGH_STOP (no aircraft change) and CONNECTION.
    - Stops are never counted as segments − 1.
- [ ] **Package from price on results**
  - **Now:** `fetchPackageFares` (`src/api/filters.js`) adds the cheapest eligible flight to the hotel's cached price for the search dates. A hotel without a flight "stays sellable hotel-only".
  - Per the spec:
    - The package price is a complete package whose hotel dates follow the flight times.
    - It is compared across airports and flight constructions, then rounded once.
    - In Flight + Hotel, a hotel without a complete package is not a result.
    - The product never flips to Hotel Only by itself.
  - Needs `API`/`CACHE`.
- [ ] **When a filter removes the explicitly chosen flight:** say so and ask the customer to choose another. Never replace it automatically.
- [ ] `API` A URL or API value can never switch on a connection the destination does not allow, or an airport off the master list.

### 3.7 Flight feasibility in the selectors (Flight + Hotel)
*I.1 §9A · I.3 §4A, §5A*

A flight choice is "feasible" when at least one complete flight construction exists with:

- outbound and return for all travellers
- the same home airport both ways
- the same destination airport both ways
- a permitted route
- valid traveller ages and airline mapping
- 29 travel days or fewer
- the 24-hour rule met
- current availability

A price is **not** required. A schedule alone, or a one-way without a return, does not count.

- [ ] Selectors narrow each other in every direction:
  - an airport limits destinations and dates
  - a destination limits airports and dates
  - a date limits airports and destinations
  - duration and routing limit the rest
- [ ] Infeasible options stay **visible but disabled**, with a reason, for example "Not available from Charleroi". Unknown or error states show CHECKING or SOURCE_ERROR, never "no flight".
  - **Now:** `useDepartureAirports.js` (~70) **hides** airports with no flight (old §26 logic). Change it to disable them and show the reason.
- [ ] Parent destinations: an airport is selectable for Turkey if any Turkish destination is feasible from it. The same airport can be disabled for Antalya.
- [ ] Several airports selected (OR), and a new destination works with only some of them:
  - Show which ones don't combine.
  - Ask for confirmation before removing them.
  - If only one airport is selected and it doesn't work, the destination is not selectable until the airport changes.
- [ ] Don't start a search that is already known to be impossible (for example CRL + New York).
- [ ] Scope of the feasibility check:
  - With ±1/±2/±3, check the whole flexible window.
  - With an exact duration, a date is feasible only if a return gives exactly that duration.
  - With a routing filter, only matching constructions count.
- [ ] `API` One feasibility endpoint, with a strictness level per page:
  - **Homepage:** a complete flight construction exists.
  - **Results:** at least one package result survives the other filters.
  - **Hotel detail:** at least one package exists for this hotel.
  - Only a proven zero disables an option.
  - **Now:** `flightFeasibility.service.js` (`FlightFeasibilityIndex`, `createFeasibilityEngine`) and `buildFeasibilityEngine` in `flightCacheQuery.service.js` exist, but nothing calls them.
  - **Now:** the only live feasibility check is `GET /api/flight-availability/departure-airports?destination=&checkIn=&checkOut=`, which marks each airport valid or not from the flight cache (`departureAirports.service.js` ~63-79). The site then hides the invalid ones.
  - The feasibility index is advisory only; it never overrides live data.

### 3.8 Results page
*I.1 §2 · I.2 §4 · I.3 §5*

- [ ] A result is one unique Hotelbeds hotel with at least one valid combination; for Flight + Hotel, a complete package.
  - Supplier hotels that can't be mapped to a Hotelbeds code are hidden and not counted.
  - A hotel appears once, however many suppliers, rooms, boards or dates it has.
- [ ] Show the total above the list:
  - "3,842 holidays found", or "624 holidays in Turkey".
  - Show a calculating state until the exact total is known. Never guess.
  - **Now:** "N stays found" (`results.json` `found_*`).
- [ ] Show the first 20 cards, then a **"Show more"** button adds 20 each time.
  - **Now:** infinite scroll through an IntersectionObserver (`Results.jsx` ~1493).
- [ ] Use one search version (`search_query_id` / `search_context_hash`) for the count, the order and every "Show more" page.
  - Any change (destination, date, duration, travellers, rooms, airport, holiday type, theme, price or other filter) creates a new version: recount, re-rank, and reset to 20 cards. (`CACHE`)
- [ ] **Default order:** stable random per session.
  - Hotelbeds-cache hotels come first, then the extra W2M-only hotels.
  - The rank stays stable across "Show more", back navigation and filter changes.
  - The site creates the session seed (`result_random_seed`, for example in `sessionStorage`) and sends it.
  - **Now:** the default is `sortBy: 'price_asc'` (`Results.jsx` ~161).
- [ ] **Explicit sorts** replace the random order inside each group. The Hotelbeds group always stays first.

  | Sort | Rule |
  |---|---|
  | Price low→high / high→low | On `sunsky_payable_total`. "Check price" hotels go after all priced ones, in both directions. |
  | Distance to beach / to centre | Smallest reliable distance first; unknown after known. Use the same Hotelbeds distance as the filters and the detail page. |
  | Stars high→low / low→high | Official category; unknown after known, in both directions. |
  | Name A-Z / Z-A | Visible SUNSKY hotel name. |
  | Tie-break | SUNSKY hotel ID. |
  | Most booked | **Not** a sort option. |

  - **Now:** the name, star and distance sorts only reorder the loaded page, client-side (`Results.jsx` `SORT_OPTIONS`). They must sort the whole result set (`CACHE`).
- [ ] **Filters apply at the right level**
  - Hotel attributes, location and theme filter hotels.
  - Board, room, cancellation and price filter the concrete stay or rate.
  - A hotel stays only if **one and the same** option passes all offer filters. For packages, one complete package must pass the flight, hotel, date and price filters together.
  - Missing data is not a match.
  - Never show a card price from a rate a filter excluded.
- [ ] **Price filters**
  - Apply only to known prices: a cache price that has matching Hotelbeds availability, or a live-checked price.
  - "Check price" hotels drop out while a price filter is on, and come back without it.
- [ ] Changing an airport filter recalculates results, counts, prices and the matrix.
- [ ] If the combined filters give nothing, say so and optionally offer an explicit adjustment. Never switch a filter off by itself.

### 3.9 Result cards
*I.1 §10 · I.2 §5 · I.3 §5*

- [ ] Main price follows 2.4.
- [ ] Flight + Hotel cards also show the local outbound departure date, the exact trip duration and the departure airport, all from the same winning package.
- [ ] Hotel Only cards show the stay window (check-in date and nights) when the search spans several dates or durations.
- [ ] Show "Check price" with no amount when availability is proven but there is no reliable price. This includes W2M-only hotels before a live check.
  - Never borrow a Hotelbeds cache price for a W2M-only hotel.
- [ ] Show "View available dates" when only shorter-than-minimum trips exist (2.6).
- [ ] Put mandatory local costs next to the price, before the button (2.2).
- [ ] A "Cheapest" or "Best deal" badge comes only from a known `sunsky_payable_total`; a "Check price" hotel never wins it.
  - **Now:** `cheapestCode` comes from `data.cheapest`, and only under `price_asc`.

### 3.10 Hotel detail page
*I.1 §1, §7, §8 · I.2 §5A, §6, §7 · I.3 §4, §5, §5A, §6, §7*

> **Heads-up:** on 2026-09-25 the client asked for the hotel detail page not to be changed ("it's good"). The items below are **behaviour** the spec requires. Confirm with the client before changing how the page looks (section 7).

**Opening the page**

- [ ] Direct hotel entry keeps the SearchContext. There are three starting situations:
  1. **A numeric from-price winner exists.** That whole candidate becomes the initial selection: price, date, duration, airport, flight, hotel dates, room and board. It stays INDICATIVE until live-checked.
  2. **No numeric winner, but an `availability_anchor` exists** (the earliest fully supported stay from any valid source):
     - Open the calendar and matrix around it and show the real status, usually "Check price".
     - The explicit date stays empty, and nothing counts as a selected priced offer.
  3. **Nothing proven within the search period:**
     - Show the hotel information, with no from price and no initial selection.
     - Text: "No available stay found within the current search period".
     - If the cause is technical, use CHECKING / SOURCE_ERROR instead.
- [ ] If the explicit context doesn't fit this hotel:
  - Keep it and show "Not available for your selection".
  - Valid alternative airports, dates or durations may be offered for an explicit choice.
- [ ] Flight + Hotel with the default occupancy shows at least "From € X p.p.", the local outbound departure date, the exact trip duration and the winning departure airport.
- [ ] Hotel Only shows the check-in date and the stay duration.

**The 7-cell matrix**

- [ ] **Hotel Only:** 7 consecutive check-in days (where possible 3 before, the selected day, 3 after).
- [ ] **Flight + Hotel:** 7 possible **outbound flight dates**.
  - Skip days without an outbound flight.
  - Where possible 3 before and 3 after; fill with later dates if there are too few earlier ones.
- [ ] Every cell is a complete stay or package, never just a check-in day.
  - A cell shows "From € X p.p.", "Check price", "Not available" (grey, not selectable), a checking state or an error state.
  - A priced cell also shows its winning exact duration.
- [ ] **Clicking**
  - Clicking a cell keeps the 7 visible dates.
  - The arrows load earlier or later dates.
  - Picking a date in the date picker rebuilds the matrix around it.
  - A cell outside the flexible window is an alternative. Clicking it makes it the selected date and moves the ± window with it. Example: 25 Oct ±3, click 30 Oct, window becomes 27 Oct to 2 Nov.
- [ ] If the selected date has become invalid:
  - Keep it with "Not available". For Flight + Hotel it is shown **above** the matrix and does not take one of the 7 cells.
  - Offer nearby valid dates.
- [ ] **No exact duration chosen:** each cell compares every duration in the band.
  - The cheapest wins; on an equal price, the longest.
  - If every duration is confirmed unavailable: "Not available".
  - If some are unknown and none is confirmed: checking or error state.
  - If any is available without a price: "Check price".
- [ ] The price accent is **"Cheapest"**, never "Cheapest of the week" (dates can span several weeks).
  - Only visible cells with a number compete; ties follow 2.6.
  - **Now:** `hotelDetail.json` `prices.legend.cheapestOfWeek`, used in `HotelDetail.jsx` ~3057 and ~3161.
- [ ] The 24-hour rule applies to every package cell.
- [ ] Hotel Only: a cell price comes from one and the same Hotelbeds cache candidate (availability and price). W2M-only cells show "Check price".

**Exact-duration buttons**

- [ ] The buttons follow the selected date.
- [ ] A button is clickable only when a complete stay or package is proven for all travellers and rooms.
  - A price is not needed: available without a price shows "Check price".
  - Keep "confirmed unavailable" and "unknown" visually distinct.
- [ ] A chosen duration that doesn't work on a newly chosen date stays selected, with "Not available". It is never swapped.

**Rooms and boards**

- [ ] The cheapest room/board combination (the one behind the from price) comes first, labelled "Included".
- [ ] Group offers by visible room name.
  - Offers from different suppliers merge **only when the names are 100% identical** after trimming whitespace and invisible HTML.
  - No fuzzy, synonym or AI matching.
  - Each supplier offer keeps its own IDs, board, conditions, price and local costs.
- [ ] Order the groups by their cheapest complete price, low to high. Inside a group, order by board type, then price.
- [ ] **Several rooms**
  - All rooms share one board.
  - Changing the board in one row changes it for all rooms, and re-finds the cheapest room combination that can be booked together (keeping explicit choices that are still valid).
  - Mixed boards are never offered, even if the supplier allows them.
- [ ] Price differences follow 2.5.

**Flights (Flight + Hotel)**

- [ ] The default flight is the one inside the cheapest complete package, not the cheapest flight.
- [ ] The alternative flights list has the shared routing filter. "Maximum one connection" appears only for Long-haul MAX 1 CONNECTION destinations.
- [ ] Price differences compare complete packages, each with its own included services. Optional SSRs not yet chosen are left out.
- [ ] No baggage or SSR purchase on this page.
- [ ] An explicitly chosen flight is kept while both flight and hotel still fit.
  - If it disappears, say so and let the customer choose.
  - Never switch it automatically.

**Live check interaction**

- [ ] **Before the first live check:** date, exact-day and filter changes refresh the indicative matrix and offer, with no confirmation step.
- [ ] **"Check price & availability"** starts the first live check. The button disappears only after a **successful** check.
  - **Now:** the button exists (`actions.checkPriceAvailability`).
- [ ] **After the first successful check:** every date or exact-day change starts a new live check automatically.
- [ ] Edits to airport (packages), board, travel party and room are provisional until saved in their panel.
  - Saving recalculates the matrix and price.
  - It also auto-checks live, if the first check already succeeded.
- [ ] A cache price that differs from the live price shows the **live** price before continuing (cache €900, live €940: show €940). If the rate is sold out, show no bookable price.
- [ ] If the price, rate or conditions change, the customer must choose that alternative again, explicitly, before booking it.
- [ ] Other matrix cells stay indicative until they are checked themselves.

### 3.11 "View flight details" popup
*I.1 §8 · I.3 §4*

- [ ] Two tabs: **"Flight details"** and **"Baggage"**.
- [ ] The baggage tab has separate outbound and return sections. A connection shows each leg with its flight number, operating carrier and route.
- [ ] For each leg and traveller type, show whether these are included, with size, weight or pieces from the fare:
  - small personal item
  - cabin bag
  - checked bag
- [ ] Show differences per traveller type, direction and leg. An infant's allowance is not an adult's.
- [ ] Say "Not included" when an item is not included. If the data is missing, claim neither.
- [ ] Information only: no buy or plus buttons. Refresh the tab when another flight is selected.
- [ ] `API` Return per-leg, per-passenger-type baggage allowances with each flight offer.
  - **Now:** the live flight search returns `{checkedKg, checkedPieces, handKg, infantKg, cabinClass}` per direction (`airtuerk.service.js` ~150-156).
  - For a round trip, the headline value is the lower of the two directions.
  - It has no per-leg data and no small personal item, and missing data can't be told apart from "not included".

### 3.12 Checkout hand-off (only what the spec defines)
*I.1 §8 · I.2 §7 · I.3 §3, §7 · III §18-20 · IV §21-24*

- [ ] `WEB` Optional baggage and SSRs are offered **only in checkout**, for the finally selected flight.
  - Each is rounded up per unit, then added to the rounded package price.
  - Checkout never rounds the sum.
- [ ] `WEB` `API` The hand-off carries only a fully specified, current offer:
  - hotel ID
  - source hotel and rate
  - dates and occupancy
  - board and cancellation terms
  - price breakdown and check evidence
  - for packages, also the flight construction
- [ ] `API` **Final check before payment or order:** revalidate the chosen hotel rate (and flight) with the chosen supplier.
  - **Still valid:** keep it. Never silently switch supplier.
  - **Expired or changed:** search the same hotel for the same room name, occupancy, board and conditions. Show the new price and conditions and ask the customer to agree again, even if only the supplier changed.
  - **Different room name or materially different conditions:** a new explicit choice.
  - **Outage or timeout:** no bookable price, offer to check again; never "Not available".
  - **Now:** the price check runs only when the booking is **created**: it returns 409 `PRICE_CHANGED`, with a tolerance of €1 or 1% (`onlineBooking.controller.js` ~336-345). Nothing re-checks at confirm, which runs after payment.
  - **Now:** in test mode, prices that can't be checked are let through.
  - See section 8 for a likely bug in the Hotelbeds check.
- [ ] `API` Recheck the 24-hour rule for packages on continue and again before the booking order.
  - 23 h 59 min before departure fails; exactly 24 h passes.
  - Use the real departure timestamp, not just the date.
- [ ] `WEB` If the selected flight disappears, the combination is invalid. Offer alternatives for an explicit choice.
- [ ] `API` Store an audit record with:
  - search context
  - chosen offer and any replacement
  - supplier and rate
  - cache time
  - live checks
  - the price the customer accepted
  - **Now:** the booking stores cost price = selling price, with margin 0. Net cost, markup and the price-check result are not kept.
- [ ] `API` Keep `booking_type` (RT_FULL or SPLIT_OW) through revalidation, booking, vouchers, servicing and audit.
  - SPLIT_OW stores two separate supplier responses and PNRs.
  - A half-booked SPLIT_OW is never shown as a complete return; the partial state must be surfaced.
  - The booking order and recovery belong to the future checkout spec.

### 3.13 New UI strings (EN from the spec, NL proposal)

The site uses the informal "je".

| Where | EN | NL (proposal) |
|---|---|---|
| Result count | {{count}} holidays found | {{count}} vakanties gevonden |
| Result count with scope | {{count}} holidays in {{place}} | {{count}} vakanties in {{place}} |
| Pagination | Show more | Toon meer |
| Main price (2 adults, 1 room) | From € {{amount}} p.p. | Vanaf € {{amount}} p.p. |
| Main price, package | Total trip price € {{amount}} | Totale reisprijs € {{amount}} |
| Main price, Hotel Only | Total stay price € {{amount}} | Totale verblijfsprijs € {{amount}} |
| Secondary average | Average € {{amount}} p.p. | Gemiddeld € {{amount}} p.p. |
| CHECKING | Checking availability... / Checking price... | Beschikbaarheid wordt gecontroleerd… / Prijs wordt gecontroleerd… |
| PRICE_UNKNOWN | Check price | Prijs controleren *(exists)* |
| UNAVAILABLE | Not available | Niet beschikbaar *(exists)* |
| NO_VALID_COMBINATION | Not available for your selection | Niet beschikbaar voor jouw selectie |
| SOURCE_ERROR | Availability temporarily unavailable / Price temporarily unavailable | Beschikbaarheid tijdelijk niet op te halen / Prijs tijdelijk niet op te halen |
| Failed live check | Check again | Opnieuw controleren |
| Short trips only | View available dates | Bekijk beschikbare data |
| Nothing in period | No available stay found within the current search period | Geen beschikbaar verblijf gevonden binnen de huidige zoekperiode |
| Live check button | Check price & availability | Prijs & beschikbaarheid controleren *(exists)* |
| Room/flight labels | Included / Selected / cheaper | Inbegrepen / Geselecteerd / goedkoper |
| Matrix accent | Cheapest | Goedkoopst *(exists)* |
| Price block | Payable to SUNSKY € {{amount}} | Te betalen aan SUNSKY € {{amount}} |
| Price block | Mandatory payment locally | Verplicht ter plaatse te betalen |
| Price block | Total known cost of the trip | Totale bekende reiskosten |
| Disabled airport/destination | Not available from {{airport}} | Niet beschikbaar vanaf {{airport}} |
| Calendar | Earliest possible departure: {{date}} | Vroegst mogelijke vertrekdatum: {{date}} |
| Calendar | 1 possible departure date found | 1 mogelijke vertrekdatum gevonden |
| Routing filter | Non-stop / Stop without connection / Maximum one connection | Non-stop / Tussenlanding zonder overstap / Maximaal één overstap |
| Flight popup tabs | Flight details / Baggage | Vluchtdetails *(exists)* / Bagage |
| Baggage | Not included | Niet inbegrepen |
| Lost flight | The selected flight option is no longer available | De gekozen vluchtoptie is niet meer beschikbaar |

---

## 4. Dashboard and admin backend tasks `API` `DASH`

### 4.1 Master data managed in the dashboard `DASH` `API`
*I.1 §5, §8, §9 · I.2 §1, §3 · III §10 · IV §9*

- [ ] **SUNSKY Departure Airports master list**, with an active flag. It is the only source for home airports on the site and in API validation.
  - **Now:** the list exists as `terminals.isDeparture` + `departureSortOrder` (19 airports, from migration `20260815090000-terminals-departure-airports.js`), served by `GET /api/flight-availability/departure-airports`.
  - **Now:** the dashboard can't change it. `/geodata/airports` (`AirportManager.jsx`) and `terminal.controller.js` create/update/toggle never read or write the flag, so today it only changes in the database. Add the flag and sort order to the airport screen and API.
- [ ] **Destination airports.** Each SUNSKY destination has:
  - **one main airport**
  - optionally a 2nd, 3rd and 4th approved airport
  - The mapping chain is: hotel → SUNSKY destination → approved airports → permitted connections → valid flights.
  - **Now:** the geo models (country, region, city, zone) have no airport field. The link runs the other way: each airport has `terminals.linkedCities`, edited in `AddEditAirportModal.jsx` under "Linked Cities / Linked Zones" and read by `GET /api/hotel-filters/arrival-airports`.
  - **Now:** the link is many-to-many, with no "main" flag and no ranking. Add a main airport and up to three ranked alternatives per destination.
- [ ] **Destination classification:** City Break, Long-haul and the other holiday types.
  - The classification drives:
    - the discovery minimum without dates: a city break needs 1 night, others 4
    - the automatic from-price minimum: 3 days for city trips, 5 for others
    - the routing policy
  - If a destination is both a City Break and another type, the City Break discovery minimum applies (I.2 §2, I.3 §3).
  - **Now:** holiday types (`HolidayThemeType`) link to country, region, city, zone and hotel, and the site inherits them downward (`website/filters/holidayResolution.js`).
  - **Now:** "City Trip" exists only as seed data, and nothing marks a destination as Long-haul.
  - **Now:** there is no admin endpoint to assign a type to a hotel, although the site reads hotel links.
  - Decide whether the classification is a holiday-type link or a dedicated field (section 7).
- [ ] **Routing policy per destination**, as data:
  - DIRECT ONLY or MAX 1 CONNECTION, where MAX 1 CONNECTION is allowed only for Long-haul.
  - Example: ECN (Northern Cyprus) = MAX 1 CONNECTION.
  - Never hardcode airport exceptions in the flight engine. A policy change must not require a code change.
  - **Now:** the policy is a file, `website/flight-availability/data/routingPolicy.json`. It is keyed by **airport**, not destination:
    - The default is direct only, with through-stops allowed.
    - 9 long-haul airports allow 1 connection: BKK, HKT, MLE, CUN, PUJ, DXB, CMB, MRU, ZNZ.
    - There is no database table and no dashboard screen, and only a test reads the file.
  - Move the policy into destination data with a dashboard control.
- [ ] **Hotel active/visible for SUNSKY:** only active hotels can appear.
- [ ] **W2M → Hotelbeds hotel mapping**
  - Must be unambiguous; an unmapped W2M hotel never appears or counts.
  - A third supplier alone can never add a hotel to the results.
  - **Now:** supplier mapping lives in the `hotelSupplierMappings` table, managed at `/products/hotels/mapping`.
  - **Now:** when there is no mapping row, Diana (the third live supplier, Natecnia) falls back to **name-similarity and geo matching** against `diana-index.json` (`hotelAvailability.controller.js` ~59-83, then `diana.service.js`). The spec requires a reliable mapping, so this fallback must not produce offers.
- [ ] **Airline passenger-type mapping**, as configuration: TEEN airlines (Ryanair, Buzz), CHILD airlines for ages 12-15 (easyJet), with room for more.
- [ ] **Live check response window:** configurable; the spec sets no number of seconds.
  - **Now (hotels):** exists as the env var `HOTEL_SEARCH_DEADLINE_MS`: default 12.5 s, clamped to 1-30 s, overridable per request with `deadlineMs` (`hotel-availability/services/supplierRace.js` ~34).
  - **Now (flights):** no window, only a 30 s HTTP timeout (`airtuerk.service.js` ~56).
  - **Now:** the `apiSettings` table has timeout fields that no live service reads.
- [ ] **Commission and margin settings** that feed the pricing layer before rounding (2.3).
  - **Now:** the `markups` table (`/pricing/markups`) is the only margin setting the site's prices actually use.
  - **Now:** these screens exist but are not used by any search or booking code:
    - Margin Engine (`/pricing/margin-engine`)
    - Pricing Logic (`/pricing/pricing-logic`), whose rounding/validation rows are placeholders
  - **Now:** live flights get **no** markup, while the cached package fares add the flights markup (`flightCacheQuery.service.js` ~180). The same flight can show two different prices; use one pricing path for both.

### 4.2 Search API contract `API`
*I.1 §2, §3, §9, §12*

**Now:** the admin backend has no SearchContext object, no flexible dates, no duration bands and no price matrix. Each endpoint takes its own loose parameters.

- [ ] Accept a full SearchContext (3.1) and validate it:
  - Only active master-list departure airports.
  - At most 29 travel or stay days.
  - `non_infant_count` of 1 or more.
  - No start dates in the past.
  - Without a start date, a 12-month start window (Europe/Brussels).
  - A routing filter can't enable connections the destination doesn't allow.
- [ ] Every returned price is traceable to:
  - exact dates and hotel nights
  - travellers and rooms
  - price source and availability source (stored separately)
  - for packages, the flight construction and both airports
- [ ] Return `search_query_id` (or `search_context_hash`) with result pages, and accept `result_random_seed` (3.8). Coordinate with `CACHE`.
- [ ] Return `state`, `offerValidation`, the three price fields and, for packages, `departureAirport`, `outboundDate`, `travelDays` and `hotelNights` of the winning candidate.

### 4.3 Live hotel check across suppliers `API`
*I.2 §3, §6, §7 · I.3 §4, §7 · II §11-17*

**Now:** `POST /api/hotel-availability/search` (`website/hotel-availability/`) checks one hotel per call. It calls three suppliers in parallel:

- Hotelbeds (live)
- Diana (Natecnia)
- World2Meet (Juniper), which answers "not configured" if the `W2M_*` env vars are missing

Every supplier is normalized to `{available, cheapestPrice, currency, rooms[]}`, with per-supplier status from `inventoryProvenance.js` (available, not_configured, timed_out, error, not_in_inventory, unconfirmed_only, unavailable). Much of this section builds on that.

- [ ] **Check every connected supplier** that applies to the Hotelbeds-mapped hotel: at least Hotelbeds Live and W2M Live, designed so more can be added.
  - A supplier without its own availability list may still return a valid offer for a hotel already found. It never adds a new hotel to the results.
- [ ] **Run one request round per check** with the configurable response window. Wait until all suppliers have answered or the window closes, then compare only the complete valid offers received.
  - A late, cheaper answer does not change the shown price or supplier; it counts only in a new check.
  - A supplier that times out or errors never blocks a valid offer from another.
  - No valid offer and no proven unavailability means "failed check, check again", not "Not available".
  - **Now:** the window exists (`supplierRace.js`). A supplier that times out or fails comes back as an **empty result**, with its status only in the provenance block.
  - Map these statuses to the spec states (2.1): `timed_out` / `error` → SOURCE_ERROR, never "no rooms".
- [ ] **Offers are self-contained.** Every offer comes from **one** supplier response covering the whole stay, all rooms and all travellers.
  - Never combine availability from one supplier with the room, rate, price or conditions of another.
- [ ] **Within one supplier:** when several contracts or rates exist for the same room + board + occupancy + dates + filters, keep only the cheapest valid one.
  - Never de-duplicate **across** suppliers.
- [ ] **Across suppliers:** compare `sunsky_payable_total` for the same selection.
  - Local costs stay per supplier and are never added to the total.
- [ ] **Default room:** with no room chosen yet, the cheapest valid room/board across all suppliers becomes the default ("Included").
  - Once a room is chosen, compare only offers with the 100% identical visible room name.
  - A similar name is a separate alternative.
- [ ] **Room identity:** an identical name is **presentation grouping only**. Revalidate and book with the exact supplier room/rate IDs of the chosen offer.
- [ ] **Several rooms:** build only combinations the supplier can check and book together.
  - All rooms share one board; no mixed boards.
  - A price for one room is not a price for the request.
  - **Now:** the Hotelbeds search spreads the party evenly and **rounds up**, so 3 adults in 2 rooms is priced as 2 + 2 = 4 adults (`hotelbeds.service.js` ~131).
  - **Now:** W2M and Diana are always asked for 1 room.
  - **Now:** a Hotelbeds booking is always single-room (`hotelbedsBooking.service.js` ~83).
  - The spec needs the real per-room allocation.
- [ ] **Live overrules cache:**
  - A stale cache price never overwrites a newer live price.
  - Cache "available" + live "unavailable" means don't sell it.
  - Suppress or invalidate the live-unavailable offer so it doesn't keep reappearing.
- [ ] **Hotelbeds RECHECK rates** go through CheckRate before they are final.
  - **Now:** the search ignores `rateType`. CheckRate runs only at booking time (`hotelbedsBooking.service.js` ~139-154).
- [ ] **"Not available" needs evidence** (UNAVAILABLE evidence rule).
  - A hotel candidate is UNAVAILABLE only when every required supplier returned authoritative "no availability" for the exact stay, rooms and occupancy.
  - Timeouts, errors, no response, no coverage and incomplete answers are **not** evidence.
- [ ] **W2M availability**
  - A general "hotel available" from W2M proves nothing for a specific stay. Do a targeted check (dates, all nights, all rooms, ages, rate/board) before treating it as available.
  - A W2M-only hotel never gets a Hotelbeds cache price. It stays "Check price" until a live offer arrives.
- [ ] **Send the search details suppliers need:**
  - destination/hotel mapping
  - check-in, check-out and nights
  - rooms, and adults per room
  - children per room with exact ages
  - source market / nationality / residency and currency where applicable

**Normalized offer model** (the frontend must never need supplier-specific structures):

- [ ] Supplier, plus the supplier's offer/reference ID
- [ ] SUNSKY hotel ID and supplier hotel ID
- [ ] Room name, and the supplier room/rate ID
- [ ] Contract reference (where applicable)
- [ ] Board
- [ ] Occupancy, with all travellers and rooms covered
- [ ] Exact stay dates
- [ ] Availability state
- [ ] Net and final selling price, and currency
- [ ] `sunsky_payable_total`, `local_mandatory_known`, `local_mandatory_unquantified`
- [ ] Refundability and cancellation conditions
- [ ] Other material conditions and inclusions
- [ ] Availability / live-check timestamp
- [ ] Supplier booking token / rate key

**Pricing integrity:**

- [ ] Keep each supplier's pricing meaning until the offer is normalized. Never double-apply:
  - markup, taxes or supplements
  - currency conversion
  - per-night vs per-stay amounts
  - per-person vs per-room amounts
- [ ] Every shown amount can be traced: supplier raw price → supplier calculations → SUNSKY markup/fees → normalized components → display.
- [ ] Local mandatory costs are classified explicitly; they are never silently included in or excluded from the SUNSKY total.
  - **Now:** Hotelbeds `taxes` are passed through unclassified and are not added (`hotelbeds.service.js` ~216-218).
  - **Now:** Diana and W2M have no tax or fee handling at all.
  - **Now:** prices are rounded only to 2 decimals (`round2`); there is no whole-euro rounding anywhere (2.3).

### 4.4 Flight construction and live flight check `API`
*I.1 §8, §9 · I.3 §1, §7 · III · IV*

This is admin backend work, not cache work. The flight cache lives in the **admin database** (`models/products/flightCache.model.js`) and is queried by `flightCacheQuery.service.js` and `flightSelection.service.js` in sunsky-admin. Only the Airtuerk file import itself stays with the cache (section 6).

**Now:** `POST /api/flight-availability/search` uses Airtuerk (Tursys) only.

- A return date makes it a round trip: outbound and inbound options are paired, 12 per direction, returning up to 24 itineraries.
- There is no RT_FULL / SPLIT_OW distinction and no `booking_type`.
- `stops` = legs − 1, with no routing policy and no stop limit.
- The TLS certificate check is switched off (section 8).

- [ ] **Evaluate both construction types** for every return search where their sources exist:
  - **RT_FULL:** one coherent Airtuerk return itinerary.
  - **SPLIT_OW:** one valid one-way outbound plus one valid one-way return.
  - Don't stop after the first RT result.
- [ ] **Keep every valid construction** needed for package evaluation. Never cut down to "best RT" and "best OW + best OW" on flight price.
- [ ] **Validate each construction.** For RT_FULL, and for each SPLIT_OW direction on its own:
  - the same complete traveller set
  - out from, and back to, the same selected home airport
  - into, and back from, the same selected destination airport
  - routing policy per direction
  - availability
  - a complete price
  - the 24-hour rule

  If one SPLIT_OW direction fails, the pair is invalid.
- [ ] **Airlines:** SPLIT_OW may use a different airline each way, with no ranking penalty.
- [ ] **Routing classification**, per direction:
  - Types: NONSTOP (no landing), THROUGH_STOP (landing, same physical aircraft), CONNECTION (another flight or aircraft).
  - Base it on verified operational legs, actual landings and aircraft-change data.
  - Never base it on segment count, flight number, a "direct" label or an Airtuerk route file (`BRU | GZP | TK` does not prove a nonstop).
  - A through-stop that can't be proven is not THROUGH_STOP; a confirmed aircraft change is a CONNECTION.
  - Store `routing_type` and `connection_count` for each direction.
- [ ] **Connection limits per direction**
  - Outbound ≤ 1 AND return ≤ 1. Never add the two directions together.
  - Two connections in one direction is invalid.
  - A connection on either side makes the construction "with connection" for filtering and display.
- [ ] **No automatic ranking** on departure or arrival time, duration, layover, airline or comfort. These may still affect validity, explicit filters, hotel dates and the package price.
- [ ] **Price all travellers:** price every construction for the complete traveller set (for example 2 ADT + 2 CHD), including cabin, fare conditions and mandatory taxes. Never compare only adult fares.
  - **Now:** cached package fares multiply by the number of **adults only**; children are not priced until the live check on the hotel page (`flightCacheQuery.service.js` `priceForParty` ~30-37).
  - **Now:** the live search does return a per-passenger-type fare breakdown (ADT/CHD/INF).
- [ ] **Keep the booking type:** `booking_type` stays through revalidation, booking, PNR/ticket, vouchers, servicing and audit.
  - SPLIT_OW = two bookings with separate responses and PNRs; never assume one PNR.
- [ ] **Live revalidation before booking**
  - Revalidate RT_FULL, or each SPLIT_OW direction on its own.
  - A change in price or availability recalculates the complete package total, and relevant alternatives where the contract requires it.
  - Never pick a winner by comparing live flight prices alone.
  - A stale cache price never overwrites a live one.
- [ ] **Airline passenger mapping and accompaniment** as in 3.5.

### 4.5 Package engine `API` (with `CACHE`)
*I.3 · IV · I.1 §9*

- [ ] **A package is:** one valid complete flight construction + the matching hotel stay for all rooms. Same hotel and destination, same travellers, the real flight and stay dates.
  - A flight without a matching hotel stay is not a package.
  - A hotel that doesn't cover every night the flights require is not a package.
- [ ] **Hotel dates** come from the flight times (3.4, 00:00-03:59 rule). A check-out that is not after the check-in makes the package invalid.
- [ ] **For each hotel and each valid flight construction:**
  - derive the stay
  - find the cheapest room combination that can be booked together, with one common board, for each board type
  - compute the complete `sunsky_payable_total`
- [ ] **Package-level decisions:** the lowest complete total wins. It decides:
  - the default flight
  - the default room/board
  - the winning departure airport
  - the matrix cell winner
- [ ] **24-hour rule:** the outbound flight must leave at least 24 hours after the check time. Apply it to results, from prices and matrix cells.
- [ ] **Numeric indicative package price** needs both:
  - a complete flight construction, available for everyone, with a calculable flight-cache price
  - a matching Hotelbeds cache price for the same stay, backed by Hotelbeds cache availability

  Otherwise, if availability is proven, show "Check price".
- [ ] **A schedule alone is not availability:** a flight schedule without seats for the whole party creates no package candidate.
- [ ] **Live check of a package:**
  - Check exactly the selected flight construction and the linked hotel stay.
  - Keep the chosen flight while it stays valid.
  - The public price is one total; flight and hotel are never priced separately.

**Now:**

- `packageDates.service.js` (04:00 rule) and `packageSelection.service.js` (cheapest whole package) are written and tested, but not connected.
- `flightSelection.service.js` has its own `PACKAGE_STATE` list (HOTEL_UNAVAILABLE, FLIGHT_UNAVAILABLE, PACKAGE_UNAVAILABLE, PRICE_RECHECK_REQUIRED, LIVE_CHECK_REQUIRED) that no endpoint uses. Replace it with the spec states in 2.1.
- Today the package total on results is assembled in the browser (3.6).

### 4.6 Logging `API`
*II §17, §18*

- [ ] For every live check, log:
  - supplier
  - latency
  - status
  - timestamp
  - enough context to reproduce the availability, normalization and price decision behind what the customer saw
- [ ] Make retries idempotent: no duplicate offers and no double price effects.

**Now:**

- No table records live checks, latency or status. The only trace is `searchWindowMs` and the per-supplier status in each hotel response, plus console logs.
- `supplierAuditLogs` has `api_call_success` / `api_call_failed` actions, but no live search writes them.
- The dashboard's Supplier Health page shows placeholder values: response time "-" and uptime fixed at 99 (`supplier.controller.js` ~690). Feed it from the new log.

### 4.7 Dashboard screens needed `DASH`

- [ ] Departure airports: list with an active toggle and a sort order.
  - **Now:** this can only be changed in the database (4.1). The natural home is the existing `/geodata/airports` screen.
- [ ] Destinations: main airport and up to three alternatives; classification (City Break / Long-haul / other types); routing policy (DIRECT ONLY / MAX 1 CONNECTION).
- [ ] W2M hotel mapping: which W2M hotel is which Hotelbeds hotel; unmapped hotels listed for review.
- [ ] Airline passenger-type mapping.
- [ ] Live check settings: the response window.
  - **Now:** it is an env var; a screen is optional, since the spec only asks for "configurable".
- [ ] Supplier Health: real latency and status from the live-check log (4.6), instead of placeholders.
- [ ] Booking detail: show `booking_type`, per-direction PNRs for SPLIT_OW, the audit trail of live checks, the accepted price, and any partial-booking state.

---

## 5. Acceptance checks (from the spec)

Use these as test cases. `[W]` = visible on the website; `[A]` = backend logic.

**Hotel Only (I.2 §8)**

- [ ] [A][W] Hotelbeds and W2M both offer the same hotel: one card, counted once. The price comes only from a matching Hotelbeds cache rate, otherwise "Check price".
- [ ] [A] Two rooms searched, only one available: no card and no price.
- [ ] [A] Child aged 14: the real age goes to the hotel supplier; only rates that accept it are shown.
- [ ] [W] Flexible dates plus a duration band: the card shows the concrete winning dates and nights.
- [ ] [W] A board filter excludes the cheapest rate: card price and sort follow the cheapest remaining rate.
- [ ] [W] Cache €900, live €940: €940 is shown before continuing. Sold out at live check: no bookable price.
- [ ] [W] Switching from a package to Hotel Only: no airport or flight filter affects hotels, and the matrix holds hotel stays only.
- [ ] [W] Maximum price €900: €850 counts, €950 is excluded, and a W2M hotel without a checked price is excluded.
- [ ] [W] Price sort: priced Hotelbeds hotels first, then "Check price" hotels, then the W2M group in the same order.
- [ ] [W] The detail page opens on the cheapest room group ("Included"). Groups follow cheapest to dearest. A chosen rate shows "Selected"; alternatives show +/- differences against the current booking.
- [ ] [W] Two rooms: one board for both. Switching to half board re-finds the cheapest half-board combination for both rooms.
- [ ] [W] Changing only the board filter keeps destination, dates, occupancy and the other filters.
- [ ] [W] No exact duration: city break minimum 3 days, other trips 5. Only shorter trips found: "View available dates".
- [ ] [A] Equal totals: the longest stay wins, then the closest check-in to the reference date, then the earlier one.
- [ ] [W] Tourist tax €5 p.p./night is shown separately and not added. A €7-€10 range is shown as text, with no total.
- [ ] [W] Calendar, 10 Dec: both sources confirm unavailable, so "Not available".
- [ ] [W] Calendar, 11 Dec: W2M confirms the whole stay but Hotelbeds has no price. Selectable, "Check price".
- [ ] [W] W2M says only "hotel available": a targeted check runs (CHECKING, SOURCE_ERROR on timeout). "Check price" only after it confirms.
- [ ] [W] No exact duration: 4, 5 and 7 days unavailable, 6 days available via W2M without a price. The cell shows "Check price", not "Not available".
- [ ] [W] Direct entry without a date, earliest stay 20 Feb: the matrix opens around 20 Feb; the explicit date stays empty.
- [ ] [W] A chosen date that later becomes unavailable stays visible with its status. Dates confirmed unavailable in advance can't be picked.

**Flight + Hotel (I.3 §8)**

- [ ] [A] Outbound 10 Oct landing 11 Oct 02:00, return 16 Oct 06:00: hotel 11-16 Oct, 5 nights.
- [ ] [A] Return 16 Oct 00:30 or 03:59: check-out 15 Oct. Return at 04:00: check-out 16 Oct.
- [ ] [A] Hotel and flights exist, but the hotel doesn't cover all the nights: no package.
- [ ] [A][W] Valid flight plus W2M-confirmed hotel with no Hotelbeds cache candidate: "Check price".
- [ ] [A] Long-haul: nonstop €300 → package €1,400, connection €250 → package €1,450. The nonstop is the default. Filter "Maximum one connection" without "Non-stop": €1,450.
- [ ] [A] Non-long-haul: a stop without aircraft change is allowed; an aircraft change is excluded, even with the same flight number.
- [ ] [A] Departure in 23 h 59 min: no package. Exactly 24 h: allowed. Recheck before the order.
- [ ] [A][W] A flight filter and a board filter each match a different combination: the hotel doesn't count.
- [ ] [W] Changing only the board filter keeps the chosen airport and routing categories.
- [ ] [A][W] Seats and hotel confirmed but no flight-cache price: selectable "Check price". It never wins "Cheapest" and is excluded under a price filter. A schedule without seats is not a candidate.
- [ ] [A] No airport chosen: all active airports are compared, and the one with the cheapest complete package wins.
- [ ] [W] The card shows p.p. only for 2 adults + 1 room, otherwise "Total trip price". Date, duration, airport and price come from one candidate.
- [ ] [W] CRL selected: New York is disabled with "Not available from Charleroi", and no search starts.
- [ ] [W] Antalya selected: ANR disabled if it has no valid flight. For parent Turkey, ANR stays selectable if another Turkish destination works.
- [ ] [W] No date, only one flight from NRN six months out: the card shows that date and "departing from Weeze", and the calendar opens on that month.
- [ ] [W] A chosen date or airport vanishes after a cache update: the site says so, doesn't replace it, and lets the customer pick.

**Live suppliers (II §19, tests H-M)**

- [ ] [A] Hotelbeds Live times out but W2M Live returns a valid offer: the customer can continue with W2M.
- [ ] [A] The cache says available but live says unavailable: not sold, and the live state is not overwritten.
- [ ] [A] Two suppliers with valid comparable offers: compare `sunsky_payable_total` and keep each supplier's own conditions.
- [ ] [A] Similar but not identical room names: kept separate; one never replaces the other.
- [ ] [A] A W2M-only stay never shows a Hotelbeds cache amount.
- [ ] [A][W] Suppliers time out with no proven unavailability: never shown as unavailable.

**Flight construction (III §23-26, IV §13-15)**

- [ ] [A] RT_FULL €220 → package €1,320, SPLIT_OW €255 → package €1,275: SPLIT_OW is the default.
- [ ] [A] SPLIT_OW Pegasus out, SunExpress back: allowed; decided on the package total only.
- [ ] [A] DIRECT ONLY, a cheaper outbound with an aircraft change: invalid, whatever its price. The same stop without an aircraft change: valid.
- [ ] [A] MAX 1 CONNECTION, one connection each way: valid. Two in one direction: invalid.

---

## 6. Depends on the cache (not in this list)

These were left out on purpose. The website and API tasks above that are tagged `CACHE` need them.

- **Result count engine:** unique Hotelbeds hotel codes, and one snapshot (`search_query_id`) shared by count, ranking and pagination.
- **Source groups:** Hotelbeds-cache hotels first, W2M-only hotels second, with the session random order (`result_random_seed`).
- **Sorting over the full result set:** price, distance, stars and name, with unknown values last.
- **Dynamic facet counts** per destination.
- **Discovery rules:**
  - Minimum stay without dates: a city break needs 1 night, others 4.
  - 12-month horizon.
  - Coverage per source.
  - No expired prices.
- **From-price engine** across dates and durations, with the tie-breaks from 2.6.
- **Hotel Only calendar and matrix** from complete-stay Hotelbeds candidates: `/contracts/hotel-price-calendar` must return per-cell state, winning duration and price source.
- **Pre-availability union** of Hotelbeds cache and the W2M availability list (II §2, §10), including the W2M list format mapping.
- **Hotelbeds ingestion:**
  - FULL / UPDATE / CONFIRM
  - `/update` semantics
  - contract isolation
  - closures, stop sales (CNPV) and stale availability
  - index invalidation
  - failed-update recovery
  - sync logging
  - (II §5-9, §17-18, tests A-D)
- **Airtuerk flight cache file import** (`flightCacheImports`): route files prove coverage only, never nonstop service (III §21, IV §17).
  - The flight selection, routing and feasibility logic on top of the flight cache is admin backend work (4.4, 3.7), because that cache lives in the admin database.

---

## 7. Open questions to raise with the client

1. **Hotel detail page.** The client froze its look on 2026-09-25, but the spec changes a lot of its behaviour (3.10). Which is allowed now: behaviour only, or layout too?
2. **"Total / Per person" toggle on results.** The spec fixes the main price by traveller composition (2.4). Remove the toggle, or keep it only for the secondary "average" line?
3. **Adult dates of birth.** The spec wants a date of birth for every traveller. The Ryanair rule (anyone under 16 needs an 18+ companion) needs adult ages. Should the search ask for adult dates of birth, or only checkout?
4. **Response window length.** The spec leaves it configurable, with no number. What default should we use?
5. **W2M availability list format.** The spec calls it an implementation dependency that needs a real sample record. Who provides one?
6. **Checkout and booking spec.** Payment sequence, booking order, rollback, and the SPLIT_OW partial-booking handling are explicitly deferred. When will that spec arrive?
7. **Flight Only.** Separate flow, "later". Leave the current `/flights` pages as they are until then?
8. **Old spec numbering.** The code cites an earlier spec (§23 flight priority, §26 hide airports without flights, §33 package fares, §35 hotel stays sellable without a flight). The new master contradicts all four. Is the old document fully superseded?
9. **City Break / Long-haul classification.** Holiday types already exist ("City Trip" is seed data). Should the classification be those holiday-type links, or a new field on the destination?
10. **Northern Cyprus (ECN).** The spec's example makes ECN "MAX 1 CONNECTION", but it also allows connections only for Long-haul destinations. Is Northern Cyprus classified Long-haul, or is it an exception?
    - Today ECN is not in `routingPolicy.json`, so it would be direct only.
    - That file refuses a connection limit on a non-long-haul destination.

---

## 8. Found along the way (not in the spec)

These came up while mapping the code. They are outside the spec, but they affect live bookings.

1. **Likely booking bug in the Hotelbeds price check** (verified in code).
   - At booking, `priceValidation.service.js` (~229-233) compares:
     - the customer's price, which is the Hotelbeds net rate **plus SUNSKY markup**
     - the raw CheckRate price (`checkRatesHotelbeds` in `hotelbeds.service.js`, ~72-115), which has **no markup**
   - Our Hotelbeds contract is net (see the comment at the top of `markup.service.js`). So whenever an active hotel markup rule exceeds the €1 / 1% tolerance, every Hotelbeds booking should fail with `PRICE_CHANGED`.
   - Check whether such a rule is active in production.
   - Fix: apply the same markup to the CheckRate result before comparing.
2. **The TLS certificate check is switched off for Airtuerk** (`rejectUnauthorized: false` in `airtuerk.service.js` ~16 and `flightReservation.service.js` ~38).
   - Flight searches and reservations accept any certificate.
   - The code comment says this mirrors a dev setting.
3. **Payment taken, supplier booking fails.**
   - If the supplier reservation fails at confirm (which runs after payment), the confirm step rolls back and returns 502 (`onlineBooking.controller.js` ~1050-1057).
   - The code survey found no automatic refund, so the booking stays paid but unconfirmed.
   - The spec leaves this to the future checkout spec, but it needs at least a manual process now.
---

## 9. Website UI changes, listed separately

Every task above that changes something a visitor to **sunsky-website** looks at, pulled out of
its section and sorted by what is stopping it rather than by screen. The number in brackets is
where the full wording lives.

Dashboard UI is not in this list. Those are 7 screens in 4.7, and each lands with its backend
half rather than on its own.

Of the 110 website tasks in section 3, 12 have no visible surface (3.1 SearchContext and 3.12
checkout hand-off). The rest, plus the shared rules in section 2 that reach a screen, are here.

| Group | Items | Waiting on |
|---|---|---|
| 9.1 Buildable now | 29 | nothing. 3 already done |
| 9.2 Blocked on data | 17 | the cache and the admin backend (4, 6) |
| 9.3 Blocked on a decision | 3 | the client (7) |

---

### 9.1 UI that needs no new data

These can be built against what the site already receives. This is the realistic short-term list.

**Results page** `WEB`

- [ ] Show `SOURCE_ERROR` with a retry action instead of "No results found" when a call fails (2.1).
- [ ] While `CHECKING`, keep the customer's choices on screen, and never show a previously confirmed price as the price of a new selection (2.1).
- [ ] "Show more" button, +20 each time, instead of infinite scroll (3.8).
- [ ] Count label "N holidays found" / "N holidays in {place}", with a calculating state and no guessed number (3.8).
- [ ] Stop defaulting to a price sort (3.8). The stable-random order itself is 9.2.
- [ ] `/results` defaults to Flight + Hotel, not Hotel Only (3.2).
- [ ] Main price: "From EUR X p.p." only at exactly 2 adults + 1 room, otherwise the total (2.4).
- [ ] Remove every silent reset of a customer choice, and audit the sidebar handlers for auto-corrections (2.7).
- [ ] When the combined filters give nothing, say so. Never switch a filter off by itself (3.8).
- [ ] The "Cheapest" badge comes only from a known total; a "Check price" hotel never wins it (3.9).
- [ ] Hotel Only cards show the stay window when the search spans several dates or durations (3.9).

**Homepage and airport selectors** `WEB`

- [ ] Departure airports default to all active airports, shown as "No preference", not BRU (3.2).
- [ ] The seed fallback list can never offer an airport the dashboard has deactivated (3.6).
- [ ] Infeasible airports stay visible but disabled with a reason, instead of being hidden (3.7).
  - Only a proven zero disables. Unknown shows a checking or error state, never "no flight".
  - The data for this already exists: `GET /api/flight-availability/departure-airports`.
- [ ] Remove the automatic routing preference ("direct at any price wins", `MAX_STOPS = 2`) (3.6).
  - The replacement classification is backend work and is in 9.2.
- [ ] When a filter removes the explicitly chosen flight, say so and ask for a new choice. Never replace it automatically (3.6).

**Hotel detail, behaviour only** `WEB`

Scope limit: the client froze this page's look on 2026-09-25. Everything here is failure
handling, not layout. Anything visual is in 9.3.

- [ ] Route every catch through the shared state machine so the cause survives (2.1).
- [ ] Rooms that come back without a price are "Check price", not absent. Today `.filter(r => r.price != null)` drops them, so a hotel with rooms and no rates reads as sold out (2.1).
- [ ] On a failed check: the new choice stays visible, no bookable price is claimed, a retry appears, and an unavailable cell never starts a live check (2.1).

**Shared helpers and wording** `WEB`

- [ ] Matrix per-person helper: `ceil(rounded total / non-infant travellers)`, unit-tested against the spec's table (2.4).
- [ ] Block an infants-only party: `non_infant_count` must be at least 1 (2.4).
- [ ] Whole euros for SUNSKY prices; local costs keep their cents (2.3).
- [ ] Split day counting per product. `days = nights + 1` is right for Hotel Only only; package travel days run outbound departure to return departure (3.4).
- [ ] 29 travel days is the ceiling everywhere, so Hotel Only allows at most 28 nights (3.4).
- [ ] Optional extras count only once the customer explicitly selects them (2.2).
- [ ] The 30 new UI strings, EN and NL (3.13).

**Already done this week**

- [x] Duration bands 2-5 / 6-10 / 11-16 / 17-24 / 25-29, ceiling 29 (3.4).
- [x] A picked unavailable date stays visible with "Not available" and is never swapped (3.4, 2.7).
- [x] The shared state machine itself, `src/utils/availability.js`, with the state wording in both languages (2.1). Built, not yet wired into the pages.

---

### 9.2 UI blocked on data

The screen work is understood; there is nothing to render yet. Each one names what has to
arrive first. Sources: §4 (admin backend) and §6 (cache).

| UI | Needs |
|---|---|
| Exact result total, "3,842 holidays found" (3.8) | result count engine on unique hotel codes |
| One search version across count, order and paging (3.8) | `search_query_id` snapshot |
| Stable random order, Hotelbeds group before W2M-only (3.8) | `result_random_seed` and source groups |
| Sorts applied to the whole result set, not the loaded page (3.9) | full-set sorting in the cache |
| Destination facet counts, "Turkey 624" (3.3) | dynamic facet counts |
| Airports, dates and destinations narrowing each other (3.7) | flight feasibility index and endpoint |
| Flight + Hotel calendar: feasible selectable, proven impossible disabled (3.4) | feasibility per date |
| Hotel Only calendar: confirmed unavailable check-in dates disabled (3.4) | per-date state |
| All 7 matrix cell states, and each cell's winning duration (3.10) | `/contracts/hotel-price-calendar` returning per-cell state, duration and price source |
| Opening state of the hotel page: from-price winner, availability anchor, or nothing proven (3.10) | from-price engine and anchor |
| "View available dates" for shorter-than-minimum trips (3.9, 2.6) | from-price minimum-duration rule |
| Card date, duration and departure airport from the winning package (3.9) | package engine |
| Mandatory local costs block under the price (2.2, 3.9) | `local_mandatory_known` and `local_mandatory_unquantified` on the offer |
| Option price differences, "+EUR X p.p." against a recomposed package (2.5, 3.10) | package recomposition per alternative |
| Room and board grouping, one board across rooms (3.10) | normalised multi-supplier offer model |
| Routing labels split into THROUGH_STOP and CONNECTION (3.6) | `routingClassification.service.js` wired up |
| Baggage popup per leg and per traveller type (3.11) | per-leg allowances on the flight offer |
| Live vs cache price, showing the live price before continuing (3.10) | live check contract |

---

### 9.3 UI blocked on a client decision

These are not technical blocks. Building them before the answer risks doing the work twice.

- [ ] Hotel detail page layout (3.10, question 1). The client froze the page on 2026-09-25; the spec changes 33 of its behaviours. Behaviour only, or layout too?
- [ ] The Total / Per person toggle on results (2.4, question 2). Remove it, or keep it only for the secondary average line?
- [ ] Adult dates of birth in the search (3.5, question 3). Children have them; adults are a count. The Ryanair 18+ companion rule needs adult ages.

---
