import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../../i18n';
import HolidayType from './HolidayType';

/**
 * A holiday type page (/holidays/zonvakanties): a grid of places, each searching its own. Its
 * "Show all" searches every place on the page at once, whichever of the two sources filled the
 * grid: the dashboard's picks for this type, or the countries linked to it.
 */

let typeData;
let cms;
let allCountries;
let cityRows;
vi.mock('../../api', () => ({
  useHolidayTypeCountries: () => ({ execute: vi.fn(), data: typeData, loading: false, error: null }),
  useHomepageConfig: () => ({ data: cms }),
  useCountries: () => ({ data: allCountries }),
  fetchCityImages: vi.fn(() => Promise.resolve(cityRows)),
}));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/holidays/zonvakanties']}>
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
