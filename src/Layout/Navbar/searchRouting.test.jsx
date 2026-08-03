import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';

// Where the header search SENDS you.
//
// Naming one hotel is an unambiguous request for that hotel, so it opens the hotel's detail
// page. It used to open the results list filtered to a single hotel — a full filter sidebar
// wrapped around one card, with another click needed to reach the page already asked for.
// A destination is genuinely a many-results query and still opens the results list.

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateSpy,
}));
vi.mock('react-redux', () => ({
  useSelector: (fn) => fn({ auth: { isAuthenticated: false, user: null } }),
  useDispatch: () => vi.fn(),
}));
vi.mock('../../api', () => ({
  useHomepageConfig: () => ({ data: null }),
  useHeaderConfig: () => ({ data: null }),
  useHolidayTypes: () => ({ data: [] }),
}));

const searchSpy = vi.fn();
vi.mock('../../api/filters', () => ({
  searchDestinationsAndHotels: (...args) => searchSpy(...args),
}));

const HOTEL = {
  hotelCode: '32243', name: 'Rixos Premium Belek', destinationCode: 'AYT',
  destinationName: 'Antalya', country: 'Turkey', stars: 5,
  image: 'https://photos.hotelbeds.com/giata/00/032243/a.jpg',
};
const DEST = { code: 'AYT', name: 'Antalya', country: 'Turkey' };
const ZONE = {
  zoneCode: '15', name: 'Side', destinationCode: 'AYT',
  destinationName: 'Antalya', country: 'Turkey', hotels: 267,
};

beforeEach(() => {
  localStorage.clear();
  navigateSpy.mockReset();
  searchSpy.mockReset();
  searchSpy.mockResolvedValue({ destinations: [DEST], zones: [ZONE], hotels: [HOTEL] });
});

// The header search only renders on the home page.
const renderNavbar = () =>
  render(<MemoryRouter initialEntries={['/']}><Navbar /></MemoryRouter>);

const searchAndPick = async (text, label) => {
  const user = userEvent.setup();
  renderNavbar();
  // Sidebar + mobile drawer can both mount the box; the header one is first.
  await user.type(screen.getAllByRole('textbox')[0], text);
  await waitFor(() => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
  await user.click(screen.getAllByText(label)[0].closest('button'));
  await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
  return navigateSpy.mock.calls[0][0];
};

describe('picking a HOTEL', () => {
  it('goes straight to that hotel\'s detail page', async () => {
    const to = await searchAndPick('rixos', 'Rixos Premium Belek');
    expect(to.split('?')[0]).toBe('/hotel/32243');
    expect(to).not.toContain('/results');
  });

  it('carries the search context the detail page needs to price the stay', async () => {
    const to = await searchAndPick('rixos', 'Rixos Premium Belek');
    const q = new URLSearchParams(to.split('?')[1]);
    expect(q.get('destination')).toBe('AYT');
    expect(q.get('name')).toBe('Rixos Premium Belek');
    expect(q.get('stars')).toBe('5');
    expect(q.get('loc')).toBe('Antalya, Turkey');
    expect(q.get('adults')).toBe('2');
    expect(q.get('rooms')).toBe('1');
    expect(q.get('children')).toBe('0');
    expect(q.get('nights')).toBe('7');
    expect(q.get('checkIn')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.get('checkOut')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('passes the hotel image through so the page has a header photo immediately', async () => {
    const to = await searchAndPick('rixos', 'Rixos Premium Belek');
    expect(new URLSearchParams(to.split('?')[1]).get('img')).toBe(HOTEL.image);
  });

  it('still reaches the detail page when the hotel has no destination code', async () => {
    searchSpy.mockResolvedValue({ destinations: [], hotels: [{ ...HOTEL, destinationCode: null }] });
    const to = await searchAndPick('rixos', 'Rixos Premium Belek');
    expect(to.split('?')[0]).toBe('/hotel/32243');
    expect(new URLSearchParams(to.split('?')[1]).get('destination')).toBeNull();
  });

  it('falls back to the results list if a hotel arrives with no code to navigate by', async () => {
    // Defensive: a malformed payload must not produce /hotel/undefined.
    searchSpy.mockResolvedValue({ destinations: [], hotels: [{ ...HOTEL, hotelCode: null }] });
    const to = await searchAndPick('rixos', 'Rixos Premium Belek');
    expect(to).toContain('/results');
    expect(to).not.toContain('undefined');
  });
});

describe('picking a DESTINATION', () => {
  it('opens the results list for that place, as before', async () => {
    searchSpy.mockResolvedValue({ destinations: [DEST], zones: [], hotels: [] });
    const to = await searchAndPick('antal', 'Antalya');
    expect(to.split('?')[0]).toBe('/results');
    const q = new URLSearchParams(to.split('?')[1]);
    expect(q.get('destinations')).toBe('AYT');
    expect(q.get('destinationLabel')).toBe('Antalya');
  });
});

describe('picking an AREA (zone)', () => {
  it('opens the results list narrowed to that area, inside its city', async () => {
    searchSpy.mockResolvedValue({ destinations: [], zones: [ZONE], hotels: [] });
    const to = await searchAndPick('side', 'Side');
    expect(to.split('?')[0]).toBe('/results');
    const q = new URLSearchParams(to.split('?')[1]);
    // The parent city IS the scope — `zones` alone leaves it empty and the results page falls
    // back to its default destinations, silently showing the wrong places.
    expect(q.get('destinations')).toBe('AYT');
    expect(q.get('zones')).toBe('AYT:15');
    expect(q.get('destinationLabel')).toBe('Side');
  });

  it('never emits a bare zoneCode, which is ambiguous across cities', async () => {
    searchSpy.mockResolvedValue({ destinations: [], zones: [{ ...ZONE, destinationCode: null }], hotels: [] });
    const to = await searchAndPick('side', 'Side');
    const q = new URLSearchParams(to.split('?')[1]);
    expect(q.get('zones')).toBeNull();
    expect(to).not.toContain('undefined');
    expect(to).not.toContain('null');
  });
});
