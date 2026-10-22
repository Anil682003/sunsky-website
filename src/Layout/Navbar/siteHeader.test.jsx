import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ConsentProvider } from '../../context/ConsentContext';
import Navbar from './Navbar';

// The header is driven by CMS → Layout → Header. The backend serves `siteHeader` with the
// holiday-type menu already resolved to ACTIVE types, so the bar must draw that list as is and
// never fall back to the homepage cards or the full type list once it is there.

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateSpy,
}));
vi.mock('react-redux', () => ({
  useSelector: (fn) => fn({ auth: { isAuthenticated: false, user: null } }),
  useDispatch: () => vi.fn(),
}));

let headerConfig = null;
vi.mock('../../api', () => ({
  // The homepage still carries a card for a type the header must not show.
  useHomepageConfig: () => ({
    data: { featuredHolidayTypes: [{ holidayTypeId: 9, title: 'Hotel only', active: true }] },
  }),
  useHeaderConfig: () => ({ data: headerConfig }),
  useHolidayTypes: () => ({
    data: [
      { id: 9, name: 'Alleen hotelverblijf', slug: 'hotel-only' },
      { id: 1, name: 'Zonvakanties', slug: 'zonvakanties' },
    ],
  }),
}));
vi.mock('../../api/filters', () => ({ searchDestinationsAndHotels: vi.fn() }));

const site = (overrides = {}) => ({
  search: { enabled: true },
  popularDestinations: { enabled: true, label: '', maxItems: 7 },
  holidayTypes: {
    enabled: true, label: '', mode: 'manual', maxItems: 5, items: [],
    resolved: [{ id: 1, name: 'Zonvakanties', label: 'Zon & strand', slug: 'zonvakanties' }],
  },
  support: { enabled: true, label: '', link: '/faq' },
  trustpilot: { enabled: true },
  mobileMenu: { useCustomLinks: false },
  ...overrides,
});

const renderNavbar = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <ConsentProvider><Navbar /></ConsentProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  navigateSpy.mockReset();
  headerConfig = { enableLanguageSelector: true, enableAccountMenu: true, siteHeader: site() };
});

describe('CMS-driven header', () => {
  it('draws exactly the resolved holiday types, with their CMS label', async () => {
    renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: 'Vakantietypes' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Zon & strand')).toBeInTheDocument();
    expect(within(menu).queryByText('Hotel only')).toBeNull();
    expect(within(menu).queryByText('Alleen hotelverblijf')).toBeNull();
    await userEvent.click(within(menu).getByText('Zon & strand'));
    expect(navigateSpy).toHaveBeenCalledWith('/holidays/zonvakanties');
  });

  it('uses the CMS menu label', () => {
    headerConfig.siteHeader = site({
      holidayTypes: { ...site().holidayTypes, label: 'Soorten reizen' },
    });
    renderNavbar();
    expect(screen.getByRole('button', { name: 'Soorten reizen' })).toBeInTheDocument();
  });

  it('hides the menu when nothing resolves', () => {
    headerConfig.siteHeader = site({ holidayTypes: { ...site().holidayTypes, enabled: false, resolved: [] } });
    renderNavbar();
    expect(screen.queryByRole('button', { name: 'Vakantietypes' })).toBeNull();
  });

  it('shows sign-in and search by default', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: /sign in|inloggen/i })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Zoek hotels en bestemmingen').length).toBeGreaterThan(0);
  });

  it('hides switched-off blocks and relabels the support button', () => {
    headerConfig = {
      enableLanguageSelector: true,
      enableAccountMenu: false,
      siteHeader: site({
        support: { enabled: true, label: 'Bel ons', link: 'tel:+3212345678' },
        search: { enabled: false },
      }),
    };
    renderNavbar();
    const support = screen.getByRole('link', { name: 'Bel ons' });
    expect(support).toHaveAttribute('href', 'tel:+3212345678');
    expect(screen.queryByRole('link', { name: /sign in|inloggen/i })).toBeNull();
    expect(screen.queryByLabelText('Zoek hotels en bestemmingen')).toBeNull();
  });

  it('removes the support button when switched off', () => {
    headerConfig.siteHeader = site({ support: { enabled: false, label: 'Bel ons', link: '/faq' } });
    renderNavbar();
    expect(screen.queryByRole('link', { name: 'Bel ons' })).toBeNull();
  });
});
