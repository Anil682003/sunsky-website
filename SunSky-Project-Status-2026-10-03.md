# SUNSKY / HolidayBooking.be — Project Status

**Date:** 3 October 2026
**Prepared for:** client review
**Scope:** sunsky-website (public site), sunsky-admin (dashboard + website APIs), SunSkyCache

---

## 1. Summary

The platform books end to end today: search, hotel selection, flight pairing, traveller details,
Stripe payment, confirmation. That path works and is live.

On 26 September a new consolidated master specification was issued. It contains 294 discrete
tasks and redefines behaviour across search, results, hotel detail, pricing, flight routing and
the dashboard. Nineteen of those tasks closed in the first week.

The specification is a substantial addition to scope, not a revision of work already delivered.
This document separates what is built, what is in progress, what is waiting on a decision, and
what is waiting on data.

---

## 2. Delivery to date

| Repository | Started | Commits | Last 90 days |
|---|---|---|---|
| sunsky-admin (dashboard + APIs) | 16 January 2026 | 1,278 | 395 |
| sunsky-website (public site) | 4 May 2026 | 542 | 480 |
| **Total** | | **1,820** | **875** |

Output by week on the public site, most recent eight weeks:

| Week beginning | Commits |
|---|---|
| 3 August | 26 |
| 10 August | 25 |
| 17 August | 25 |
| 24 August | 20 |
| 14 September | 15 |
| 21 September | 39 |
| 28 September | 57 |
| 28 September onward (current) | 26 |

The week following the new specification was the highest output week of the project.

---

## 3. Working today

| Capability | Status |
|---|---|
| Hotel search and results | Live |
| Hotel detail, rooms, boards, live pricing | Live |
| Hotel + flight package booking | Live, end to end |
| Stripe payment (test mode) | Live |
| Registration, login, account area | Live |
| Dashboard: CMS, geo data, hotel filters, bookings | Live |
| Server side price validation (anti tampering) | Implemented |
| Dutch and English, header, home, results, FAQ, information pages | Live |
| Open Graph previews for hotel pages | Live |

---

## 4. The 26 September specification: 294 tasks

| Area | Tasks |
|---|---|
| Public website | 110 |
| Admin backend and APIs | 34 task groups |
| Dashboard screens | 7 screens |
| Cache layer | 10 dependencies, listed but out of scope in the document itself |

Of the 49 website tasks that change something a visitor sees:

| Group | Count | Waiting on |
|---|---|---|
| Buildable now | 29 (7 already done) | nothing |
| Blocked on data | 17 | the cache layer and the admin backend |
| Blocked on a decision | 3 | client answer |

---

## 5. Open decisions required from the client

These are not technical blocks. Building before the answer risks doing the work twice.

| # | Decision | Impact if unanswered |
|---|---|---|
| 1 | Hotel detail page: the page was frozen on 25 September; the specification issued on 26 September changes 33 of its behaviours. Behaviour only, or layout too? | The largest single page in the product cannot be planned |
| 2 | Total / per person toggle on results: remove, or keep for the secondary line? | Results pricing display |
| 3 | Adult dates of birth: ask at search, or at checkout only? The Ryanair under-16 companion rule needs adult ages | Traveller selector and flight validation |
| 4 | Response window length: the specification leaves it configurable with no number | Live check timeouts |
| 5 | W2M availability list format: a real sample record is needed. Who provides it? | Multi supplier availability cannot be mapped |
| 6 | Checkout and booking specification: payment sequence, booking order, rollback, and split one way partial booking are explicitly deferred. When does it arrive? | Payment orchestration cannot be finalised |
| 7 | Flight Only: separate flow, marked "later". Leave the current pages as they are? | Flight Only scope |
| 8 | Old specification numbering: the code cites an earlier document whose rules the new master contradicts in four places. Is the old document fully superseded? | Risk of building to the wrong rule |
| 9 | City Break and Long-haul classification: use existing holiday types, or a new field? | Minimum stay and routing rules |
| 10 | Northern Cyprus: the example allows one connection, but connections are permitted only for Long-haul. Long-haul, or an exception? | Routing policy |

---

## 6. Dependencies outside the current task list

The specification places the cache layer outside its own task list, while 17 website tasks
depend on it. These items must be delivered before the matching screens can be built:

- Result count engine over unique hotel codes, with a shared search snapshot
- Source groups and stable random ordering
- Sorting across the full result set rather than the loaded page
- Dynamic facet counts per destination
- From-price engine across dates and durations
- Hotel calendar and price matrix with per cell state
- Pre availability union of Hotelbeds and W2M
- Hotelbeds ingestion: full, update and confirm, with closures and stop sales
- Airtürk flight cache import

---

## 7. Found during the specification mapping

Three issues outside the specification, affecting live bookings:

1. **Hotelbeds price check mismatch.** At booking, the customer price (net rate plus markup) is
   compared against the raw re-price (no markup). Any active markup rule above the tolerance
   would fail every Hotelbeds booking. Needs the markup applied before comparison, and a check
   of which rules are active in production.
2. **Certificate verification disabled for the Airtürk connection.** Mirrors a development
   setting. Should be reviewed before go live.
3. **Payment taken, supplier booking fails.** The confirm step runs after payment. If the
   supplier reservation fails it rolls back, but no automatic refund exists. The specification
   defers this to the future checkout document; a manual process is needed in the meantime.

---

## 8. Proposed next steps

1. **A decision call this week** covering the ten items in section 5. Most are short answers.
   They unblock more work than any other single action.
2. **Confirm the cache scope and owner** (section 6), since 17 screens wait on it.
3. **Confirm the arrival date of the checkout and payment specification** (decision 6).
4. **Agreed phase plan with dates**, issued once 1 to 3 are settled. Until the hotel detail
   question and the cache ownership are answered, any date given would be a guess, and a guessed
   date is what erodes confidence.

Work continues on the 29 unblocked website tasks in the meantime.
