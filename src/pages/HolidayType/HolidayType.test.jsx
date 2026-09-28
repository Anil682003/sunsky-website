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
vi.mock('../../api', () => ({
  useHolidayTypeCountries: () => ({ execute: vi.fn(), data: typeData, loading: false, error: null }),
  useHomepageConfig: () => ({ data: cms }),
  useCountries: () => ({ data: [] }),
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
