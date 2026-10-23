import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../../i18n';
import HolidayType from './HolidayType';

// A card is a button that navigates rather than a link, so where it goes is only observable by
// clicking it. The router itself stays real; only the navigate call is captured.
const navigated = [];
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => (to) => navigated.push(to) };
});

/**
 * A holiday type page (/holidays/zonvakanties): a grid of places, each searching its own. Its
 * "Show all" searches every place on the page at once, whichever of the two sources filled the
 * grid: the dashboard's picks for this type, or the countries linked to it.
 */

let typeData;
let cms;
let allCountries;
let cityRows;
let scopeData;
vi.mock('../../api', () => ({
  useHolidayTypeCountries: () => ({ execute: vi.fn(), data: typeData, loading: false, error: null }),
  useHolidayTypeScope: () => ({ execute: vi.fn(), data: scopeData, loading: false, error: null }),
  useHomepageConfig: () => ({ data: cms }),
  useCountries: () => ({ data: allCountries }),
  fetchCityImages: vi.fn(() => Promise.resolve(cityRows)),
}));

const renderPage = (slug = 'zonvakanties') => render(
  <MemoryRouter initialEntries={[`/holidays/${slug}`]}>
    <Routes>
      <Route path="/holidays/:slug" element={<HolidayType />} />
    </Routes>
  </MemoryRouter>
);
const showAll = () => screen.queryByRole('link', { name: /toon alles/i });
const query = (link) => new URL(link.getAttribute('href'), 'https://example.test').searchParams;

beforeAll(() => i18n.changeLanguage('nl'));
beforeEach(() => {
  typeData = {
    holidayType: { id: 1, name: 'Zonvakanties', slug: 'zonvakanties' },
    countries: [
      { id: 7, code: 'TR', isoCode: 'TR', name: 'Turkey' },
      { id: 9, code: 'NY', isoCode: 'CY', name: 'Cyprus' },
    ],
  };
  cms = null;
  allCountries = [];
  cityRows = [];
  // No scope by default, so the existing cases keep asserting the countries fallback.
  scopeData = null;
  navigated.length = 0;
});

describe('HolidayType city cards', () => {
  // The Stedentrips page: cities the dashboard picked, each with a photo uploaded in Geo Data.
  beforeEach(() => {
    cms = {
      featuredHolidayTypes: [{
        holidayTypeId: 1,
        title: 'Zonvakanties',
        destinations: [
          { type: 'city', code: 'BCN', name: 'Barcelona', countryName: 'Spanje' },
          { type: 'city', code: 'ROE', name: 'Rome', countryName: 'Italië' },
        ],
      }],
    };
    allCountries = [
      { id: 1, code: 'ES', isoCode: 'ES', name: 'Spanje', flagUrl: 'https://flagcdn.com/es.svg' },
      { id: 2, code: 'IT', isoCode: 'IT', name: 'Italië', flagUrl: 'https://flagcdn.com/it.svg' },
    ];
    cityRows = [{ code: 'BCN', name: 'Barcelona', imageUrl: 'https://assets.test/geo/bcn.png' }];
  });

  it("shows the photo uploaded for the city in Geo Data", async () => {
    renderPage();
    const photo = await screen.findByRole('img', { name: 'Barcelona' });
    expect(photo).toHaveAttribute('src', 'https://assets.test/geo/bcn.png');
  });

  it("never shows a city with its country's flag, photo or not", async () => {
    const { container } = renderPage();
    await screen.findByRole('img', { name: 'Barcelona' });
    // Rome has no photo: it gets the plain drawn card, not Italy's flag.
    expect(container.querySelectorAll('img[src*="flagcdn"]')).toHaveLength(0);
  });
});

describe('HolidayType "Show all"', () => {
  it('searches every linked country, by its Hotelbeds code', () => {
    renderPage();
    const link = showAll();
    expect(link).toBeInTheDocument();
    // Cyprus is NY to the results page, not its ISO code.
    expect(query(link).get('countries')).toBe('TR,NY');
    // Places only: the holiday type does not travel as a filter.
    expect(query(link).has('themes')).toBe(false);
  });

  it("searches the dashboard's picks when the type has them", () => {
    cms = {
      featuredHolidayTypes: [{
        holidayTypeId: 1,
        title: 'Zonvakanties',
        destinations: [
          { type: 'city', code: 'TFS', name: 'Tenerife', countryName: 'Spain' },
          { type: 'country', code: 'GR', name: 'Greece' },
        ],
      }],
    };
    renderPage();
    expect(query(showAll()).get('destinations')).toBe('TFS');
    expect(query(showAll()).get('countries')).toBe('GR');
  });

  it('shows no button when the page has no places', () => {
    typeData = { holidayType: { id: 1, name: 'Zonvakanties' }, countries: [] };
    renderPage();
    expect(showAll()).toBeNull();
  });
});

/**
 * "Show all" searches the type's SCOPE, not the countries on the page (UI-19, Ch1 §12B.1).
 *
 * The grid lists countries, and a country is listed when any destination inside it carries the
 * type. So the old link searched Turkey entire for a category that might be two Turkish resorts.
 */
describe('HolidayType "Show all" uses the type scope', () => {
  it('searches the type by name (the results page looks its places up), not the countries on the page', () => {
    scopeData = { destinations: ['AYT', 'BJV'], zones: [], hotelCodes: [] };
    renderPage();
    const p = query(showAll());
    expect(p.get('holidayType')).toBeTruthy();
    // No places in the link, so nothing opens ticked in the Where filter (Levent 23 Oct).
    expect(p.get('destinations')).toBeNull();
    // Turkey and Cyprus are the country cards. Searching those is the wider question.
    expect(p.get('countries')).toBeNull();
  });

  it('carries the category as geography, never as a themes filter', () => {
    // A type linked at country or destination level sits on no hotel, so themes= intersects
    // to nothing and the results page comes back empty.
    scopeData = { destinations: ['AYT'], zones: [], hotelCodes: [] };
    renderPage();
    const p = query(showAll());
    expect(p.get('themes')).toBeNull();
    expect(p.get('transport')).toBe('package');
  });

  it('a type linked only at zone level still gets a Show all by name', () => {
    scopeData = { destinations: [], zones: [{ destination: 'AYT', zone: 'BEL' }], hotelCodes: [] };
    renderPage();
    expect(query(showAll()).get('holidayType')).toBeTruthy();
    expect(query(showAll()).get('zones')).toBeNull();
  });

  it('falls back to the countries link when the scope has not answered', () => {
    // The scope is a second request. Until it lands, or if it fails, the button keeps working
    // as it always did rather than vanishing or searching the whole site.
    scopeData = null;
    renderPage();
    const p = query(showAll());
    expect(p.get('countries')).toBe('TR,NY');
    expect(p.get('destinations')).toBeNull();
  });

  it('falls back when the type resolves to nowhere', () => {
    scopeData = { destinations: [], zones: [], hotelCodes: [] };
    renderPage();
    expect(query(showAll()).get('countries')).toBe('TR,NY');
  });
});

/**
 * The cards on the page, and what each one searches (UI-19, Ch1 §12B.1, §12B.4).
 *
 * A card is a geographic choice: it keeps the category and adds that place. How the category
 * travels depends on what the category IS. A type the dashboard links to countries is a filter
 * the catalogue can answer, so it travels as `themes=`, and countries=ES with themes=2 is
 * Spain's city trips rather than Spain entire. Last Minute and All Inclusive are not that: they
 * are a departure window and a board, linked to no country, and `themes=` for them matches no
 * hotel at all. They travel as the door they are.
 */
describe('HolidayType cards: a place, with the category still applied', () => {
  const cards = () => screen.queryAllByRole('button').filter((b) => b.querySelector('h3'));
  const cardNamed = (name) => cards().find((b) => b.querySelector('h3').textContent === name);

  const went = () => new URL(navigated.at(-1), 'https://example.test').searchParams;

  it('keeps the category on a country card, so Spain is not searched entire', () => {
    typeData = {
      holidayType: { id: 2, name: 'Stedentrips', slug: 'stedentrips' },
      countries: [{ id: 1, code: 'ES', isoCode: 'ES', name: 'Spanje' }],
    };
    renderPage('stedentrips');
    fireEvent.click(cardNamed('Spanje'));
    // themes= resolves through the countries and destinations the type is linked to, so this is
    // Spain's city-trip destinations rather than all 8,000 Spanish hotels.
    expect(went().get('countries')).toBe('ES');
    expect(went().get('themes')).toBe('2');
    expect(went().get('transport')).toBe('package');
  });

  it('lists every active country for a door, instead of dead-ending', () => {
    // All Inclusive is linked to no country by design: it is a board, not a place.
    typeData = { holidayType: { id: 13, name: 'All Inclusive', slug: 'all-inclusive' }, countries: [] };
    allCountries = [
      { id: 1, code: 'ES', isoCode: 'ES', name: 'Spanje' },
      { id: 2, code: 'TR', isoCode: 'TR', name: 'Turkije' },
    ];
    renderPage('all-inclusive');
    expect(cards().map((b) => b.querySelector('h3').textContent)).toEqual(['Spanje', 'Turkije']);
    expect(screen.queryByText(/nog geen bestemmingen/i)).toBeNull();
  });

  it('a type that is neither a door nor linked to a country still says so plainly', () => {
    // Adults only is a hotel attribute. Nothing the page could link to would be that category,
    // so an honest empty state beats a grid of countries that are not it.
    typeData = { holidayType: { id: 30, name: 'Adults Only', slug: 'adults-only' }, countries: [] };
    allCountries = [{ id: 1, code: 'ES', isoCode: 'ES', name: 'Spanje' }];
    renderPage('adults-only');
    expect(cards()).toHaveLength(0);
    expect(screen.getByText('Nog geen bestemmingen')).toBeInTheDocument();
  });

  it("a door's card carries the door, never a themes filter that matches no hotel", () => {
    typeData = { holidayType: { id: 13, name: 'All Inclusive', slug: 'all-inclusive' }, countries: [] };
    allCountries = [{ id: 1, code: 'ES', isoCode: 'ES', name: 'Spanje' }];
    renderPage('all-inclusive');
    fireEvent.click(cardNamed('Spanje'));
    expect(went().get('countries')).toBe('ES');
    expect(went().get('entry')).toBe('all_inclusive');
    // themes=13 matches no hotel at all, so sending it here would empty the search.
    expect(went().get('themes')).toBeNull();
  });

  it("carries the door on \"Toon alles\" too, for a type with no geography of its own", () => {
    typeData = { holidayType: { id: 12, name: 'Last Minute', slug: 'last-minute' }, countries: [] };
    allCountries = [{ id: 1, code: 'ES', isoCode: 'ES', name: 'Spanje' }];
    renderPage('last-minute');
    const p = query(showAll());
    expect(p.get('countries')).toBe('ES');
    expect(p.get('entry')).toBe('last_minute');
    expect(p.get('themes')).toBeNull();
  });

  it('shows the grid rather than the empty state while the countries are still coming', () => {
    typeData = { holidayType: { id: 12, name: 'Last Minute', slug: 'last-minute' }, countries: [] };
    allCountries = null;   // the request has not landed
    renderPage('last-minute');
    expect(screen.queryByText(/nog geen bestemmingen/i)).toBeNull();
    expect(cards()).toHaveLength(0);
  });
});

/** §12B.1: these pages navigate. They never price. */
describe('HolidayType prices and dates', () => {
  it('shows no price anywhere, because a category has no one price', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/€/);
    expect(container.textContent).not.toMatch(/\bvanaf\b/i);
  });

  it('puts no date in a link, however the type is named', () => {
    // "Zonvakanties 2027" is a title, not a departure window: a year in it must not quietly
    // become a date on the search.
    typeData = {
      holidayType: { id: 1, name: 'Zonvakanties 2027', slug: 'zonvakanties' },
      countries: [{ id: 7, code: 'TR', isoCode: 'TR', name: 'Turkije' }],
    };
    renderPage();
    const p = query(showAll());
    expect(p.get('checkIn')).toBeNull();
    expect(p.get('checkOut')).toBeNull();
    expect([...p.keys()].some((k) => /date|month|year/i.test(k))).toBe(false);
    expect(showAll().getAttribute('href')).not.toMatch(/2027/);
  });
});
