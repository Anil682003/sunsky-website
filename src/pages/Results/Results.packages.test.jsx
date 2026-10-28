// "Incl. flight" results from the admin's package search (7 Oct 2026; packageResults.js): complete
// packages only (Levent, 6 Oct 2026), each card from one package, a search without dates asking
// the precalculated default, a country asked per group of destinations, and destinations whose
// flight data is missing named as such.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';

vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: (fn) => fn({ auth: { isAuthenticated: false } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api', () => ({
  fetchFavouriteCodes: vi.fn(() => Promise.resolve(new Set())),
  addFavourite: vi.fn(), removeFavourite: vi.fn(),
}));
const EMPTY_FACETS = {
  holiday: [], stars: [], facilities: [], activities: [],
  accommodation: [], kids: [], beachDistance: [], centreDistance: [],
};
const answers = { byDest: {} };   // destination → { hotels, status }
const pkg = (code, dest, total, extra = {}) => ({
  hotelCode: code, destination: dest, sunskyPayableTotal: total, sunskyPayableTotalRounded: Math.ceil(total), pricePerPerson: Math.ceil(Math.ceil(total) / 2),
  currency: 'EUR', board: 'AI', room: 'DBL', stay: { checkin: '2026-11-04', checkout: '2026-11-10', nights: 6 }, departureAirport: 'BRU',
  components: { flight: 400, hotel: total - 400 },
  flight: { stops: 0, travelDays: 8, outbound: { departureLocal: '2026-11-03T19:00' }, inbound: { departureLocal: '2026-11-10T10:30' } },
  ...extra,
});
vi.mock('../../api/filters', () => ({
  fetchFacets: vi.fn((scope) => Promise.resolve({
    scope: { countries: scope.countries ?? [], destinations: scope.destinations ?? [], hotelCount: 0 },
    matchedDestinations: answers.matched ?? (scope.destinations?.length ? scope.destinations : ['AYT', 'IST', 'ADB', 'DLM', 'BJV']),
    included: { hotelCodes: false, attributes: false },
    facets: EMPTY_FACETS,
  })),
  fetchCountries: vi.fn(() => Promise.resolve([{ code: 'TR', name: 'Turkey' }])),
  fetchDestinations: vi.fn(() => Promise.resolve(answers.cities || [])),
  fetchZones: vi.fn(() => Promise.resolve([])),
  fetchDestinationCountries: vi.fn(() => Promise.resolve([])),
  fetchArrivalAirports: vi.fn(() => Promise.resolve([])),
  fetchDepartureAirports: vi.fn(() => Promise.resolve({ airports: [], filtered: null, cacheHasData: false })),
  fetchPackages: vi.fn((body) => {
    // A group holding a destination in answers.hang never answers at all: the state UI-25
    // is about, where one destination is still being calculated while another has replied.
    if (body.destinations.some((d) => answers.hang?.includes(d))) return new Promise(() => {});
    // A group holding a destination listed in answers.fail does not answer (a timeout).
    if (body.destinations.some((d) => answers.fail?.includes(d))) {
      return Promise.reject(Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' }));
    }
    const hotels = body.destinations.flatMap((d) => answers.byDest[d]?.hotels || [])
      .sort((a, b) => a.sunskyPayableTotal - b.sunskyPayableTotal);
    const page = body.page || 1;
    const size = 2;   // small pages, to exercise "Show more" across groups
    return Promise.resolve({
      hotels: hotels.slice((page - 1) * size, page * size), hasMore: hotels.length > page * size,
      destinationStatus: Object.fromEntries(body.destinations.map((d) => [d, { status: answers.byDest[d]?.status || 'NOT_FEASIBLE', ...(answers.byDest[d]?.reason ? { reason: answers.byDest[d].reason } : {}) }])),
      boardFacets: {},
      ...(answers.entryApplied ? { entryApplied: answers.entryApplied } : {}),
    });
  }),
  fetchThemes: vi.fn(() => Promise.resolve([])),
  searchDestinationsAndHotels: vi.fn(() => Promise.resolve({ destinations: [], hotels: [] })),
  fetchMatchingHotels: vi.fn(() => Promise.resolve({ count: 0, hotelCodes: [], attributes: {} })),
}));

const sentToCache = [];
beforeEach(async () => {
  sentToCache.length = 0;
  answers.byDest = {};
  answers.fail = [];
  answers.hang = [];
  answers.entryApplied = null;
  answers.matched = undefined;
  answers.cities = undefined;
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes('/contracts/cheapest')) sentToCache.push(String(url));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], results: [], hasMore: false }) });
  });
  const { fetchPackages } = await import('../../api/filters');
  fetchPackages.mockClear();
});
const calls = async () => (await import('../../api/filters')).fetchPackages.mock.calls.map((c) => c[0]);
const renderAt = (q) => render(<MemoryRouter initialEntries={[`/results${q}`]}><Results /></MemoryRouter>);
const DATED = '?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';

describe('"Incl. flight" lists complete packages (Levent, 6 Oct 2026)', () => {
  it('a card is the package: its p.p. price, its own stay, departure airport and flight times', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100.4)] };
    renderAt(DATED);
    const card = await screen.findByRole('article');
    expect(card.textContent).toMatch(/551/);                       // ceil(1101 / 2)
    expect(card.textContent).toMatch(/19:00/);
    expect(card.textContent).toMatch(/10:30/);
    expect(card.textContent).not.toMatch(/nacht/);   // dates only: the length is the 'N dagen' line (Levent, 25 Oct 2026)
    expect(card.textContent).toMatch(/8 dagen/);                  // the package's own stay (overnight arrival)
    // The dates are the trip's (flight out 3 Nov → back 10 Nov), the same days '8 dagen' counts,
    // never the hotel's 4 Nov check-in beside them (Levent 29 Oct: '24/04-28/04 is not 6 days').
    expect(card.textContent).toMatch(/3 nov\.? → 10 nov/);
    expect(card.textContent).not.toMatch(/4 nov\.? → 10 nov/);
    expect(card.textContent).not.toMatch(/34585/);                // never the hotel code
    expect(sentToCache).toHaveLength(0);                          // no hotel-only cache search
    const [body] = await calls();
    expect(body).toMatchObject({ destinations: ['AYT'], from: '2026-11-03', to: '2026-11-03', travelDays: '8', adults: '2' });
  });

  it('the card opens the hotel page on the stay and airport of its package', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100.4)] };
    renderAt(DATED);
    const card = await screen.findByRole('article');
    const link = within(card).getAllByRole('link').find((a) => a.getAttribute('href').startsWith('/hotel/'));
    const q = new URLSearchParams(link.getAttribute('href').split('?')[1]);
    expect([q.get('checkIn'), q.get('checkOut'), q.get('origin')]).toEqual(['2026-11-04', '2026-11-10', 'BRU']);
  });

  it('a link without dates asks the stored 12-month search (no dates, no length)', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('1', 'AYT', 900)] };
    renderAt('?destinations=AYT&destinationLabel=Antalya&transport=package');
    await screen.findByRole('article');
    const [body] = await calls();
    expect(body).toMatchObject({ destinations: ['AYT'] });
    expect(body.nights).toBeUndefined();
    expect(body.from).toBeUndefined();
    expect(body.travelDays).toBeUndefined();
  });

  it('a country: one request per group of 4 destinations, merged cheapest first', async () => {
    answers.byDest = {
      AYT: { status: 'FEASIBLE', hotels: [pkg('a', 'AYT', 900)] },
      BJV: { status: 'FEASIBLE', hotels: [pkg('b', 'BJV', 500)] },
      IST: { status: 'FEASIBLE', hotels: [pkg('c', 'IST', 700)] },
    };
    renderAt('?countries=TR&destinationLabel=Turkije&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    const bodies = await calls();
    expect(bodies.map((b) => b.destinations.length).sort()).toEqual([1, 4]);
    expect(screen.getAllByRole('article')[0].textContent).toMatch(/250/);   // b: ceil(500 / 2), the cheapest, first
    expect(screen.getAllByRole('article')[2].textContent).toMatch(/450/);   // a, the dearest, last
  });

  it('a destination without flight data is named, not silently dropped and never "no flights"', async () => {
    answers.byDest = { AYT: { status: 'FEASIBLE', hotels: [pkg('a', 'AYT', 900)] }, ADB: { status: 'UNKNOWN' } };
    renderAt('?destinations=AYT,ADB&destinationLabel=Turkije&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package');
    expect(await screen.findByText(/kunnen nog niet berekend worden/)).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('only missing data and no package: says the prices cannot be calculated yet, not "no results"', async () => {
    answers.byDest = { ADB: { status: 'UNKNOWN' } };
    renderAt('?destinations=ADB&destinationLabel=Izmir&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package');
    expect(await screen.findByRole('heading', { name: /kunnen nog niet berekend worden/ })).toBeInTheDocument();
  });

  it('Show more: the next page of every group that could hold a cheaper package, merged in order', async () => {
    // 5 packages in one group, pages of 2 (the mock): page 1 shows 2, and the page shows all
    // loaded up to PAGE_SIZE. More arrive through "Show more".
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [100, 200, 300, 400, 500].map((t, i) => pkg(`h${i}`, 'AYT', t)) };
    renderAt(DATED);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Toon meer|Show more/ }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));
    const bodies = await calls();
    expect(bodies.map((b) => b.page)).toEqual([1, 2]);
  });
});

// Turkey from Brussels, 12 Dec (7 Oct 2026): the groups holding Antalya and Istanbul did not answer
// in time, the group of İzmir/Dalaman answered "no package", and the page said "No results found".
describe('a package request that failed is never "no results"', () => {
  const COUNTRY = '?countries=TR&destinationLabel=Turkije&checkIn=2026-11-03&checkOut=2026-11-10&adults=2&children=0&rooms=1&transport=package';

  it('nothing found and a group failed: says it could not load, offers a retry', async () => {
    answers.fail = ['AYT'];
    renderAt(COUNTRY);
    expect(await screen.findByText(/niet alle vlucht \+ hotelprijzen laden/i)).toBeInTheDocument();
    expect(screen.queryByText(/geen resultaten/i)).toBeNull();
    expect(screen.getByRole('button', { name: /opnieuw proberen/i })).toBeInTheDocument();
  });

  it('results from the groups that answered, and the failed destinations named with a retry', async () => {
    answers.fail = ['AYT'];
    answers.byDest.BJV = { status: 'FEASIBLE', hotels: [pkg('b', 'BJV', 500)] };
    renderAt(COUNTRY);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    const notice = await screen.findByText(/konden nu niet geladen worden/i);
    expect(notice.textContent).toMatch(/AYT|Antalya/);
    expect(within(notice).getByRole('button', { name: /opnieuw proberen/i })).toBeInTheDocument();
  });

  it('package searches wait up to 20 s, not the default 15 s', async () => {
    const { PACKAGE_TIMEOUT_MS } = await vi.importActual('../../api/filters');
    expect(PACKAGE_TIMEOUT_MS).toBe(20_000);
  });
});

// 9 Oct 2026: a Spain + Albania + Bulgaria search in January listed only Spain, with no word why.
describe('destinations without a flight on these dates', () => {
  const COUNTRIES = '?countries=ES,AL,BG&destinationLabel=Spanje&checkIn=2027-01-01&checkOut=2027-01-07&adults=2&children=0&rooms=1&transport=package';
  beforeEach(() => {
    answers.cities = [
      { code: 'PMI', name: 'Mallorca', countryCode: 'ES' },
      { code: 'TIA', name: 'Tirana', countryCode: 'AL' }, { code: 'DRR', name: 'Durrës', countryCode: 'AL' },
      { code: 'VAR', name: 'Varna', countryCode: 'BG' },
    ];
    answers.matched = ['PMI', 'TIA', 'DRR', 'VAR'];
  });

  // Levent 23 Oct: the notice is not wanted. Destinations without a flight are simply not listed.
  it('destinations without a flight are left out with no notice; the list shows the others', async () => {
    answers.byDest = {
      PMI: { status: 'FEASIBLE', hotels: [pkg('a', 'PMI', 900)] },
      TIA: { status: 'NOT_FEASIBLE', reason: 'NO_VALID_FLIGHT' }, DRR: { status: 'NOT_FEASIBLE', reason: 'NO_VALID_FLIGHT' },
      VAR: { status: 'NOT_FEASIBLE', reason: 'NO_VALID_FLIGHT' },
    };
    renderAt(COUNTRIES);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText(/Geen vlucht + hotelpakketten naar/)).toBeNull();
  });

  it('missing data (UNKNOWN), or no package for another reason, is never called "no flights"', async () => {
    answers.byDest = {
      PMI: { status: 'FEASIBLE', hotels: [pkg('a', 'PMI', 900)] },
      TIA: { status: 'UNKNOWN' }, DRR: { status: 'NOT_FEASIBLE', reason: 'NO_HOTEL_FOR_FLIGHT_STAYS' }, VAR: { status: 'NOT_FEASIBLE' },
    };
    renderAt(COUNTRIES);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText(/Geen vlucht \+ hotelpakketten naar/)).toBeNull();
  });

  it('a group that failed: no "no flights" notice for anything', async () => {
    answers.byDest = {
      PMI: { status: 'FEASIBLE', hotels: [pkg('a', 'PMI', 900)] },
      TIA: { status: 'NOT_FEASIBLE', reason: 'NO_VALID_FLIGHT' }, DRR: { status: 'NOT_FEASIBLE', reason: 'NO_VALID_FLIGHT' },
      VAR: { status: 'NOT_FEASIBLE', reason: 'NO_VALID_FLIGHT' },
    };
    answers.fail = ['TIA'];   // its group (all 4 destinations) times out
    renderAt(COUNTRIES);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByText(/Geen vlucht \+ hotelpakketten naar/)).toBeNull();
  });
});

/**
 * UI-10 (Ch 1 §10). An automatic from-price needs a trip of at least 3 travel days for a city
 * trip and 5 for anything else. A hotel whose only complete packages are shorter stays in the
 * list and offers its dates instead of a price.
 *
 * (Dutch: `src/test/setup.js` loads the real i18n, which starts on the site's own language.)
 */
describe('a hotel with only short trips keeps its place, without a price', () => {
  it('offers its available dates instead of a figure that would describe a different trip', async () => {
    answers.byDest.AYT = {
      status: 'FEASIBLE',
      hotels: [
        pkg('34585', 'AYT', 1100.4),
        pkg('99001', 'AYT', 300, { fromPriceEligible: false, commercialMinDays: 5 }),
      ],
    };
    renderAt(DATED);
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(2);

    const short = cards.find((c) => c.textContent.includes('Bekijk beschikbare data'));
    expect(short).toBeTruthy();
    // The cheap short trip must not be quoted: €150 p.p. would undercut every real holiday on
    // the page and buy something else entirely.
    expect(short.textContent).not.toMatch(/150/);

    // The eligible hotel is untouched.
    const priced = cards.find((c) => c !== short);
    expect(priced.textContent).toMatch(/551/);
    expect(priced.textContent).not.toMatch(/Bekijk beschikbare data/);
  });

  it('is not called sold out, and still opens its hotel page', async () => {
    answers.byDest.AYT = {
      status: 'FEASIBLE',
      hotels: [pkg('99001', 'AYT', 300, { fromPriceEligible: false, commercialMinDays: 3 })],
    };
    renderAt(DATED);
    const card = await screen.findByRole('article');
    expect(card.textContent).toMatch(/Bekijk beschikbare data/);
    expect(within(card).getByRole('link')).toHaveAttribute('href', expect.stringContaining('/hotel/99001'));
  });
});

/**
 * UI-25 (Ch 3 §8A, Ch 1 §2). Only the default party — 2 adults, one room — is precalculated.
 * Any other party is worked out on request, which on a cold search takes seconds rather than
 * milliseconds, so the page has to be honest about the wait.
 *
 * No code changed for this: the three things it asks for already hold, and these tests are here
 * so they keep holding. The one that would cost real money if it broke is the first.
 */
describe('a party other than 2 adults / 1 room (UI-25)', () => {
  it('is priced for ITS party, so the precalculated 2-adult answer can never stand in', async () => {
    // The precalculated round is served only to a request that names no party. This body always
    // names one, so a 3-adult search cannot be answered with 2-adult prices — the failure here
    // would be a quoted holiday the traveller cannot buy at that price.
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1650)] };
    renderAt('?destination=AYT&destinationLabel=Antalya&checkIn=2026-11-03&checkOut=2026-11-10&adults=3&children=0&rooms=1&transport=package');
    await screen.findByRole('article');
    const [body] = await calls();
    expect(body).toMatchObject({ adults: '3' });
  });

  it('states no total while a destination is still being calculated', async () => {
    // Two destinations, one still working. A running total is the sum of whoever answered
    // first, and printing it shows a precise number that is about to change.
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    answers.hang = ['BJV'];
    renderAt('?countries=TR&destinationLabel=Turkije&checkIn=2026-11-03&checkOut=2026-11-10&adults=3&children=0&rooms=1&transport=package');

    await screen.findByRole('article');
    await waitFor(() => expect(screen.getByText(/berekenen/i)).toBeInTheDocument());
    // Never a count beside it while one destination is outstanding.
    // The h1 reads "Ontdek onze vakanties in …" (the heading, not a count).
    expect(screen.queryByText(/vakanties gevonden|vakanties in/i, { ignore: 'h1, script, style' })).toBeNull();
  });

  it('says the search is still running rather than letting the page look finished', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    answers.hang = ['BJV'];
    renderAt('?countries=TR&destinationLabel=Turkije&checkIn=2026-11-03&checkOut=2026-11-10&adults=3&children=0&rooms=1&transport=package');

    await screen.findByRole('article');
    // The banner above the list, so a half-filled page is never read as the whole answer.
    expect(await screen.findByRole('status')).toHaveTextContent(/we zoeken nog meer bestemmingen/i);
  });
});

/**
 * UI-20 (§12B.2). The entry rides to the API; the SERVER decides whether its default still
 * applies, because it only does where the traveller has not already chosen. Computing that here
 * would be a second implementation of a rule that has to agree with the server's to the day.
 */
describe('the homepage door the search came through', () => {
  it('is sent to the package search', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    renderAt(`${DATED}&entry=last_minute`);
    await screen.findByRole('article');
    const [body] = await calls();
    expect(body.entry).toBe('last_minute');
  });

  it('a search that came through no door sends none', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    renderAt(DATED);
    await screen.findByRole('article');
    const [body] = await calls();
    expect(body.entry).toBeUndefined();
  });

  it('an entry the contract does not know is dropped, not forwarded', async () => {
    // A type someone named "Last Minute Deals" is not this door. Forwarding it would ask the
    // server to apply a default to a search the traveller never asked to narrow.
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    renderAt(`${DATED}&entry=last-minute-deals`);
    await screen.findByRole('article');
    const [body] = await calls();
    expect(body.entry).toBeUndefined();
  });
});

describe('what the door applied is said out loud (UI-20)', () => {
  it('a Last Minute window the server applied shows among the trip chips', async () => {
    // Narrowing a traveller's dates without saying so leaves them unable to account for the
    // list, and unable to replace the default they never saw.
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    answers.entryApplied = { entry: 'last_minute', window: { from: '2026-11-03', to: '2026-12-15' } };
    renderAt(`${DATED}&entry=last_minute`);
    await screen.findByRole('article');
    // The chip text sits in a span inside the strip, so more than one node carries it.
    expect((await screen.findAllByText(/last minute/i)).length).toBeGreaterThan(0);
  });

  it('an All Inclusive restriction names the boards it kept', async () => {
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    answers.entryApplied = { entry: 'all_inclusive', boards: ['AI', 'UAI'] };
    renderAt(`${DATED}&entry=all_inclusive`);
    await screen.findByRole('article');
    expect((await screen.findAllByText(/all inclusive.*AI, UAI/i)).length).toBeGreaterThan(0);
  });

  it('nothing applied says nothing: the traveller\'s own choices stood', async () => {
    // The server sends no `entryApplied` once they have set dates or a meal plan. Announcing a
    // default that was not applied would be worse than silence.
    answers.byDest.AYT = { status: 'FEASIBLE', hotels: [pkg('34585', 'AYT', 1100)] };
    answers.entryApplied = null;
    renderAt(`${DATED}&entry=last_minute`);
    await screen.findByRole('article');
    expect(screen.queryByText(/last minute/i)).toBeNull();
  });
});
