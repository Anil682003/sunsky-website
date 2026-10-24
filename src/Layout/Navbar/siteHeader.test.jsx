import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ConsentProvider } from '../../context/ConsentContext';
import i18n from '../../i18n';
import styles from './Navbar.module.css';
import Navbar from './Navbar';

// The header is driven by CMS → Layout → Header. The backend serves `siteHeader` (version 2),
// already normalised, with the holiday-type menu resolved to ACTIVE types and the announcement's
// `live` flag computed. Production still serves version 1, and the config call can fail, so the
// bar is tested against all three: with no settings it must be exactly the bar it always was.

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateSpy,
}));

let auth = { isAuthenticated: false, user: null };
vi.mock('react-redux', () => ({
  useSelector: (fn) => fn({ auth }),
  useDispatch: () => vi.fn(),
}));

let headerConfig = null;
let homepageConfig = null;
vi.mock('../../api', () => ({
  useHomepageConfig: () => ({ data: homepageConfig }),
  useHeaderConfig: () => ({ data: headerConfig }),
  useHolidayTypes: () => ({
    data: [
      { id: 9, name: 'Alleen hotelverblijf', slug: 'hotel-only' },
      { id: 1, name: 'Zonvakanties', slug: 'zonvakanties' },
    ],
  }),
}));
vi.mock('../../api/filters', () => ({ searchDestinationsAndHotels: vi.fn().mockResolvedValue({}) }));

// The homepage still carries a card for a type the header must not show once the server has
// resolved the menu, and two popular destinations for the homepage-sourced menu.
const HOMEPAGE = {
  featuredHolidayTypes: [{ holidayTypeId: 9, title: 'Hotel only', active: true }],
  popularDestinationGroups: [
    {
      title: 'Zon en strand',
      links: [
        { label: 'Turkije', dest: { type: 'country', code: 'TR', name: 'Turkey' } },
        { label: 'Spanje', dest: { type: 'country', code: 'ES', name: 'Spain' } },
      ],
    },
  ],
};

const t2 = (nl = '', en = '') => ({ nl, en });

// A version 2 payload the way the server sends it: complete, every Text bilingual.
const v2 = (overrides = {}) => ({
  version: 2,
  announcement: {
    enabled: false, text: t2(), linkLabel: t2(), link: '', newTab: false, tone: 'orange',
    dismissible: true, startDate: '', endDate: '', showOn: 'all', live: false,
  },
  menus: {
    destinations: {
      enabled: true, label: t2(), source: 'homepage', maxItems: 7, showGroupAsSub: true, items: [],
      footerLink: { enabled: false, label: t2(), url: '' }, showOn: 'all',
    },
    holidayTypes: {
      enabled: true, label: t2(), source: 'auto', maxItems: 5, sub: t2(), items: [],
      footerLink: { enabled: false, label: t2(), url: '' }, showOn: 'all',
      resolved: [{ id: 1, name: 'Zonvakanties', slug: 'zonvakanties', label: t2(), sub: t2(), icon: '' }],
    },
    custom: [],
  },
  menuOrder: ['destinations', 'holidayTypes'],
  search: { enabled: true, placeholder: t2(), showSuggestions: true, showOn: 'all' },
  support: { enabled: true, label: t2(), link: '/faq', newTab: false, icon: 'phone', showLabel: true, showOn: 'all' },
  trustpilot: { enabled: true, showOn: 'all' },
  language: { enabled: true, showOn: 'all' },
  account: {
    enabled: true, signInLabel: t2(), signInUrl: '/login',
    register: { enabled: true, label: t2(), url: '/register' },
    fallbackName: t2(),
    menuItems: [
      { key: 'bookings', enabled: true, label: t2() },
      { key: 'profile', enabled: true, label: t2() },
      { key: 'favourites', enabled: true, label: t2() },
    ],
    showOn: 'all',
  },
  mobileMenu: {
    items: [
      { id: 'holidays', key: 'holidays', active: true, label: t2(), icon: '', url: '/', newTab: false },
      { id: 'flights', key: 'flights', active: true, label: t2(), icon: '', url: '/flights', newTab: false },
      { id: 'hotels', key: 'hotels', active: true, label: t2(), icon: '', url: '/hotels', newTab: false },
      { id: 'transfers', key: 'transfers', active: true, label: t2(), icon: '', url: '/transfers', newTab: false },
    ],
    showMenus: true,
    showSearch: true,
  },
  ...overrides,
});
const withMenus = (menus) => ({ ...v2().menus, ...menus });

const DEALS = {
  id: 'deals', enabled: true, label: t2('Deals', 'Deals'), glyph: 'tag',
  items: [
    { id: 'lm', active: true, label: t2('Last minutes'), sub: t2('Vertrek binnen 6 weken'), icon: 'alarm-clock', url: '/results?entry=last_minute', newTab: false },
    { id: 'cruise', active: true, label: t2('Cruises'), sub: t2(), icon: '', url: 'https://cruise.test/', newTab: true },
    { id: 'off', active: false, label: t2('Verborgen'), sub: t2(), icon: '', url: '/hidden', newTab: false },
  ],
  footerLink: { enabled: true, label: t2(), url: '/deals' },
  showOn: 'all',
};

const renderNavbar = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsentProvider><Navbar /></ConsentProvider>
    </MemoryRouter>,
  );

const menuButtons = () =>
  screen.getAllByRole('button').filter((b) => b.getAttribute('aria-haspopup') === 'menu');
// An emoji arrives on demand (TravelEmoji loads its file, then @iconify draws it after mount),
// so its element can land a tick after the click that showed the row.
const hasIcon = (el, name) => waitFor(() => expect(el.querySelector(`[data-icon="${name}"]`)).not.toBeNull());
const drawer = () => document.querySelector(`.${styles.mobile}`);
const openDrawer = async () => {
  await userEvent.click(screen.getByLabelText('Menu', { selector: 'button' }));
  return drawer();
};

beforeEach(() => {
  localStorage.clear();
  navigateSpy.mockReset();
  auth = { isAuthenticated: false, user: null };
  homepageConfig = HOMEPAGE;
  headerConfig = { siteHeader: v2() };
});

describe('with no settings the bar is the bar it always was', () => {
  beforeEach(() => { headerConfig = null; });

  it('draws both browse menus, in their old order, from the homepage and the type list', async () => {
    renderNavbar();
    expect(menuButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Populaire bestemmingen', 'Vakantietypes']);

    await userEvent.click(screen.getByRole('button', { name: 'Populaire bestemmingen' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('2 bestemmingen')).toBeInTheDocument();
    expect(within(menu).getByText('Turkije')).toBeInTheDocument();
    // The group each entry came from is its sub-label.
    expect(within(menu).getAllByText('Zon en strand')).toHaveLength(2);
    expect(within(menu).queryByText('Alles bekijken')).toBeNull();

    // No resolved list from a server: the featured card leads, as before.
    await userEvent.click(screen.getByRole('button', { name: 'Vakantietypes' }));
    expect(within(screen.getByRole('menu')).getByText('Hotel only')).toBeInTheDocument();
  });

  it('keeps support, sign-in and register, and no announcement', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Klantendienst' })).toHaveAttribute('href', '/faq');
    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Registreren' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('region', { name: 'Mededeling' })).toBeNull();
  });

  it('keeps the phone menu to the four services', async () => {
    renderNavbar();
    const d = await openDrawer();
    expect(within(d).getByRole('button', { name: /Vakanties/ })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: /Transfers/ })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Populaire bestemmingen' })).toBeNull();
    expect(within(d).getByRole('button', { name: 'Registreren, het gaat snel!' })).toBeInTheDocument();
  });
});

describe('menus (version 2)', () => {
  it('stand in the dashboard\'s order', () => {
    headerConfig = {
      siteHeader: v2({ menus: withMenus({ custom: [DEALS] }), menuOrder: ['custom:deals', 'holidayTypes', 'destinations'] }),
    };
    renderNavbar();
    expect(menuButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Deals', 'Vakantietypes', 'Populaire bestemmingen']);
  });

  it('a custom menu lists its active links, opens outside links in a new tab, and ends in "see all"', async () => {
    headerConfig = { siteHeader: v2({ menus: withMenus({ custom: [DEALS] }), menuOrder: ['destinations', 'holidayTypes', 'custom:deals'] }) };
    renderNavbar();
    const button = screen.getByRole('button', { name: 'Deals' });
    // The dashboard's glyph on the button.
    await hasIcon(button, 'tag');

    await userEvent.click(button);
    let menu = screen.getByRole('menu');
    expect(within(menu).getByText('2 links')).toBeInTheDocument();
    expect(within(menu).queryByText('Verborgen')).toBeNull();
    await hasIcon(menu, 'alarm-clock');
    const cruise = within(menu).getByRole('menuitem', { name: /Cruises/ });
    expect(cruise).toHaveAttribute('href', 'https://cruise.test/');
    expect(cruise).toHaveAttribute('target', '_blank');
    expect(cruise).toHaveAttribute('rel', 'noopener noreferrer');

    await userEvent.click(within(menu).getByText('Last minutes'));
    expect(navigateSpy).toHaveBeenCalledWith('/results?entry=last_minute');

    await userEvent.click(button);
    menu = screen.getByRole('menu');
    // The footer's label was left empty, so it is the site's own.
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Alles bekijken' }));
    expect(navigateSpy).toHaveBeenLastCalledWith('/deals');
  });

  it('a menu with nothing to show draws no button', () => {
    const empty = { ...DEALS, items: [{ ...DEALS.items[2] }] };
    headerConfig = { siteHeader: v2({ menus: withMenus({ custom: [empty] }), menuOrder: ['destinations', 'holidayTypes', 'custom:deals'] }) };
    renderNavbar();
    expect(screen.queryByRole('button', { name: 'Deals' })).toBeNull();
  });

  it('destinations from the dashboard\'s own list, linked through the search', async () => {
    headerConfig = {
      siteHeader: v2({
        menus: withMenus({
          destinations: {
            ...v2().menus.destinations,
            label: t2('Bestemmingen', 'Destinations'),
            source: 'manual',
            items: [
              { id: 'tr', active: true, label: t2('Turkije', 'Turkey'), sub: t2('All inclusive'), icon: 'mosque', dest: { type: 'country', code: 'TR', name: 'Turkey', countryName: '' }, boardCode: 'AI', holidayTypeId: null, url: '' },
              { id: 'gr', active: true, label: t2('Griekenland'), sub: t2(), icon: '', dest: null, boardCode: '', holidayTypeId: null, url: '/results?countries=GR' },
              { id: 'off', active: false, label: t2('Uit'), sub: t2(), icon: '', dest: null, boardCode: '', holidayTypeId: null, url: '/x' },
            ],
            footerLink: { enabled: true, label: t2('Alle bestemmingen'), url: 'https://elsewhere.test/all' },
          },
        }),
      }),
    };
    renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: 'Bestemmingen' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('Spanje')).toBeNull();
    expect(within(menu).queryByText('Uit')).toBeNull();
    expect(within(menu).getByText('All inclusive')).toBeInTheDocument();
    await hasIcon(menu, 'mosque');
    // Without an emoji the row keeps the built-in pin.
    expect(within(menu).getByRole('menuitem', { name: /Griekenland/ }).querySelector('svg')).not.toBeNull();
    const all = within(menu).getByRole('menuitem', { name: 'Alle bestemmingen' });
    expect(all).toHaveAttribute('href', 'https://elsewhere.test/all');
    expect(all).not.toHaveAttribute('target');

    await userEvent.click(within(menu).getByText('Turkije'));
    const to = navigateSpy.mock.calls[0][0];
    const q = new URLSearchParams(to.split('?')[1]);
    expect(q.get('countries')).toBe('TR');
    expect(q.get('entry')).toBe('all_inclusive');
    expect(q.get('destinationLabel')).toBe('Turkije');
  });

  it('the homepage source can drop the group sub-labels and cap the list', async () => {
    headerConfig = {
      siteHeader: v2({ menus: withMenus({ destinations: { ...v2().menus.destinations, showGroupAsSub: false, maxItems: 1 } }) }),
    };
    renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: 'Populaire bestemmingen' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('1 bestemming')).toBeInTheDocument();
    expect(within(menu).queryByText('Spanje')).toBeNull();
    expect(within(menu).queryByText('Zon en strand')).toBeNull();
  });

  it('holiday types: the type\'s name before the other language, and the sub-label chain', async () => {
    headerConfig = {
      siteHeader: v2({
        menus: withMenus({
          holidayTypes: {
            ...v2().menus.holidayTypes,
            sub: t2('Ontdek'),
            resolved: [
              { id: 1, name: 'Zonvakanties', slug: 'zonvakanties', label: t2('', 'Sun holidays'), sub: t2(), icon: 'sun' },
              { id: 2, name: 'Stedentrips', slug: 'stedentrips', label: t2('Citytrips'), sub: t2('Weekendje weg'), icon: '' },
            ],
          },
        }),
      }),
    };
    renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: 'Vakantietypes' }));
    const menu = screen.getByRole('menu');
    const sun = within(menu).getByRole('menuitem', { name: /Zonvakanties/ });
    expect(within(sun).getByText('Ontdek')).toBeInTheDocument();
    await hasIcon(sun, 'sun');
    expect(within(menu).queryByText('Sun holidays')).toBeNull();
    expect(within(menu).getByText('Citytrips')).toBeInTheDocument();
    expect(within(menu).getByText('Weekendje weg')).toBeInTheDocument();
    await userEvent.click(within(menu).getByText('Citytrips'));
    expect(navigateSpy).toHaveBeenCalledWith('/holidays/stedentrips');
  });

  it('reads the English copy for an English visitor', async () => {
    headerConfig = {
      siteHeader: v2({
        menus: withMenus({
          holidayTypes: {
            ...v2().menus.holidayTypes,
            resolved: [{ id: 1, name: 'Zonvakanties', slug: 'zonvakanties', label: t2('', 'Sun holidays'), sub: t2(), icon: '' }],
          },
        }),
      }),
    };
    await i18n.changeLanguage('en');
    try {
      renderNavbar();
      await userEvent.click(screen.getByRole('button', { name: 'Holiday types' }));
      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('Sun holidays')).toBeInTheDocument();
      expect(within(menu).getByText('Explore holidays')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Customer service' })).toBeInTheDocument();
    } finally {
      // Inside act: the bar is still mounted, and switching back re-renders it.
      await act(() => i18n.changeLanguage('nl'));
    }
  });
});

describe('search, support and the rest of the bar', () => {
  it('uses the dashboard\'s placeholder, and no suggestions when they are off', () => {
    headerConfig = { siteHeader: v2({ search: { enabled: true, placeholder: t2('Waar wil je heen?'), showSuggestions: false, showOn: 'all' } }) };
    renderNavbar();
    expect(screen.getByLabelText('Zoek hotels en bestemmingen')).toHaveAttribute('placeholder', 'Waar wil je heen?');
  });

  it('with suggestions on, the box types their names instead of a fixed placeholder', () => {
    renderNavbar();
    // The typewriter owns the box while it has names to type.
    expect(screen.getByLabelText('Zoek hotels en bestemmingen')).toHaveAttribute('placeholder', '');
  });

  it('a desktop-only search stays out of the phone menu', async () => {
    headerConfig = { siteHeader: v2({ search: { ...v2().search, showOn: 'desktop' } }) };
    renderNavbar();
    expect(document.querySelector(`.${styles.headerSearch}`)).toHaveClass(styles.onlyDesktop);
    const d = await openDrawer();
    expect(within(d).queryByLabelText('Zoek hotels en bestemmingen')).toBeNull();
  });

  it('support: label, link, icon and a label-less button', () => {
    headerConfig = {
      siteHeader: v2({
        support: { enabled: true, label: t2('Chat met ons'), link: 'https://chat.test/', newTab: true, icon: 'chat', showLabel: false, showOn: 'mobile' },
      }),
    };
    renderNavbar();
    const support = screen.getByRole('link', { name: 'Chat met ons' });
    expect(support).toHaveAttribute('href', 'https://chat.test/');
    expect(support).toHaveAttribute('target', '_blank');
    expect(support).toHaveAttribute('rel', 'noopener noreferrer');
    expect(support).toHaveClass(styles.onlyMobile);
    // The word is gone; the name stays on the control.
    expect(within(support).queryByText('Chat met ons')).toBeNull();
  });

  it('switched-off and desktop-only blocks', () => {
    headerConfig = {
      siteHeader: v2({
        support: { ...v2().support, enabled: false },
        trustpilot: { enabled: true, showOn: 'desktop' },
        language: { enabled: false, showOn: 'all' },
      }),
    };
    renderNavbar();
    expect(screen.queryByRole('link', { name: 'Klantendienst' })).toBeNull();
    expect(document.querySelector(`.${styles.trustpilotSlot}`)).toHaveClass(styles.onlyDesktop);
    expect(document.querySelector(`.${styles.langSlot}`)).toBeNull();
  });

  // On the free plan (no score widget configured, as in production and in this test run) the
  // switch used to draw nothing at all. It now always draws the link to the review profile,
  // and never a rating of its own.
  it('reviews on: a Trustpilot badge linking to the review profile, with no invented score', () => {
    headerConfig = { siteHeader: v2({ trustpilot: { enabled: true, showOn: 'all' } }) };
    renderNavbar();
    const badge = screen.getByRole('link', { name: /Trustpilot/ });
    expect(badge).toHaveAttribute('href', expect.stringMatching(/^https:\/\/[a-z-]+\.trustpilot\.com\/review\//));
    expect(badge).toHaveAttribute('target', '_blank');
    expect(badge).toHaveAttribute('rel', 'noopener noreferrer');
    expect(badge.textContent).not.toMatch(/\d/);
  });

  it('reviews off: no Trustpilot at all', () => {
    headerConfig = { siteHeader: v2({ trustpilot: { enabled: false, showOn: 'all' } }) };
    renderNavbar();
    expect(screen.queryByRole('link', { name: /Trustpilot/ })).toBeNull();
    expect(document.querySelector(`.${styles.trustpilotSlot}`)).toBeNull();
  });

  it('a menu can be kept to one side of the breakpoint', () => {
    headerConfig = { siteHeader: v2({ menus: withMenus({ custom: [{ ...DEALS, showOn: 'mobile' }] }) }) };
    renderNavbar();
    expect(screen.getByRole('button', { name: 'Deals' }).closest(`.${styles.hmWrap}`)).toHaveClass(styles.onlyMobile);
  });

  it('a live announcement sits above the bar', () => {
    headerConfig = {
      siteHeader: v2({ announcement: { ...v2().announcement, enabled: true, live: true, text: t2('Herfstkorting', 'Autumn sale') } }),
    };
    renderNavbar();
    const strip = screen.getByRole('region', { name: 'Mededeling' });
    expect(strip).toHaveTextContent('Herfstkorting');
    // Before the bar in the page, so it is read first and drawn on top.
    expect(strip.compareDocumentPosition(screen.getByRole('banner')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('account', () => {
  it('without registration the pill is the sign-in link alone', () => {
    headerConfig = {
      siteHeader: v2({
        account: { ...v2().account, signInLabel: t2('Aanmelden'), signInUrl: '/inloggen', register: { enabled: false, label: t2(), url: '/register' } },
      }),
    };
    const { container } = renderNavbar();
    expect(screen.getByRole('link', { name: 'Aanmelden' })).toHaveAttribute('href', '/inloggen');
    expect(screen.queryByRole('link', { name: 'Registreren' })).toBeNull();
    expect(container.querySelector(`.${styles.authPillSlash}`)).toBeNull();
  });

  it('relabels and redirects registration', () => {
    headerConfig = {
      siteHeader: v2({ account: { ...v2().account, register: { enabled: true, label: t2('Account maken'), url: '/word-lid' } } }),
    };
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Account maken' })).toHaveAttribute('href', '/word-lid');
  });

  it('switched off for guests: no way in on either surface', async () => {
    headerConfig = { siteHeader: v2({ account: { ...v2().account, enabled: false } }) };
    renderNavbar();
    expect(screen.queryByRole('link', { name: 'Inloggen' })).toBeNull();
    const d = await openDrawer();
    expect(within(d).queryByRole('button', { name: 'Inloggen' })).toBeNull();
  });

  it('a signed-in visitor keeps the avatar menu, in the dashboard\'s order, with sign out', async () => {
    auth = { isAuthenticated: true, user: { firstName: '', lastName: '', email: 'jan@example.test' } };
    headerConfig = {
      siteHeader: v2({
        account: {
          ...v2().account,
          enabled: false,
          fallbackName: t2('Jouw account'),
          menuItems: [
            { key: 'favourites', enabled: true, label: t2('Mijn lijstje') },
            { key: 'bookings', enabled: true, label: t2() },
            { key: 'profile', enabled: false, label: t2() },
          ],
        },
      }),
    };
    const { container } = renderNavbar();
    const avatar = screen.getByRole('button', { name: /Jouw account/ });
    await userEvent.click(avatar);
    const dropdown = container.querySelector(`.${styles.dropdown}`);
    const labels = within(dropdown).getAllByRole('button').map((b) => b.textContent.trim());
    expect(labels).toEqual(['Mijn lijstje', 'Mijn boekingen', 'Uitloggen']);
    await userEvent.click(within(dropdown).getByRole('button', { name: 'Mijn lijstje' }));
    expect(navigateSpy).toHaveBeenCalledWith('/account/favourites');

    const d = await openDrawer();
    expect(within(d).getByRole('button', { name: 'Mijn lijstje' })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Profiel' })).toBeNull();
    expect(within(d).getByRole('button', { name: 'Uitloggen' })).toBeInTheDocument();
  });
});

describe('the phone menu', () => {
  const mobile = () => ({
    siteHeader: v2({
      menus: withMenus({
        destinations: { ...v2().menus.destinations, showOn: 'desktop' },
        custom: [DEALS],
      }),
      menuOrder: ['destinations', 'custom:deals', 'holidayTypes'],
      language: { enabled: true, showOn: 'desktop' },
      mobileMenu: {
        items: [
          { id: 'holidays', key: 'holidays', active: true, label: t2(), icon: '', url: '/', newTab: false },
          { id: 'flights', key: 'flights', active: true, label: t2('Vliegtickets'), icon: '', url: '/flights', newTab: false },
          { id: 'hotels', key: 'hotels', active: false, label: t2(), icon: '', url: '/hotels', newTab: false },
          { id: 'blog', key: '', active: true, label: t2('Reisblog'), icon: 'luggage', url: 'https://blog.test/', newTab: true },
        ],
        showMenus: true,
        showSearch: false,
      },
    }),
  });

  it('draws the dashboard\'s rows: built-in names by default, its own rows as links', async () => {
    headerConfig = mobile();
    renderNavbar();
    const d = await openDrawer();
    // Holidays keeps its translated name and lights up on the home page, as before.
    expect(within(d).getByRole('button', { name: 'Vakanties' })).toHaveClass(styles.mobileLinkActive);
    expect(within(d).getByRole('button', { name: 'Vliegtickets' })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Hotels' })).toBeNull();
    const blog = within(d).getByRole('link', { name: 'Reisblog' });
    expect(blog).toHaveAttribute('href', 'https://blog.test/');
    expect(blog).toHaveAttribute('target', '_blank');
    expect(blog).toHaveAttribute('rel', 'noopener noreferrer');
    await hasIcon(blog, 'luggage');

    await userEvent.click(within(d).getByRole('button', { name: 'Vliegtickets' }));
    expect(navigateSpy).toHaveBeenCalledWith('/flights');
    expect(drawer()).toBeNull();
  });

  it('lists the browse menus as groups, leaving out the desktop-only ones', async () => {
    headerConfig = mobile();
    renderNavbar();
    const d = await openDrawer();
    const groups = within(d).getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
    expect(groups.map((b) => b.textContent.trim())).toEqual(['Deals', 'Vakantietypes']);

    const deals = within(d).getByRole('button', { name: 'Deals' });
    expect(deals).toHaveAttribute('aria-expanded', 'false');
    expect(within(d).queryByText('Last minutes')).toBeNull();
    await userEvent.click(deals);
    expect(deals).toHaveAttribute('aria-expanded', 'true');
    expect(within(d).getByRole('link', { name: /Cruises/ })).toHaveAttribute('target', '_blank');
    expect(within(d).getByRole('button', { name: /Alles bekijken/ })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: /Last minutes/ }));
    expect(navigateSpy).toHaveBeenCalledWith('/results?entry=last_minute');
    expect(drawer()).toBeNull();
  });

  it('leaves out the search and a desktop-only language switch when asked to', async () => {
    headerConfig = mobile();
    renderNavbar();
    const d = await openDrawer();
    expect(within(d).queryByLabelText('Zoek hotels en bestemmingen')).toBeNull();
    expect(within(d).queryByRole('group')).toBeNull();
  });

  it('no menu groups when the dashboard turns them off', async () => {
    headerConfig = { siteHeader: v2({ mobileMenu: { ...v2().mobileMenu, showMenus: false } }) };
    renderNavbar();
    const d = await openDrawer();
    expect(within(d).queryByRole('button', { name: 'Vakantietypes' })).toBeNull();
    expect(within(d).getByLabelText('Zoek hotels en bestemmingen')).toBeInTheDocument();
  });
});

// Production serves this today, and the website may deploy before the backend that serves
// version 2. Every case here passed against the version 1 header and must keep passing through
// the upgrade in utils/siteHeader.js.
describe('a version 1 payload (production today)', () => {
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

  beforeEach(() => {
    homepageConfig = { featuredHolidayTypes: HOMEPAGE.featuredHolidayTypes };
    headerConfig = { enableLanguageSelector: true, enableAccountMenu: true, siteHeader: site() };
  });

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

  // The hotel page used to be the one screen without it: its own form prices the stay that
  // is already open, which is no help to someone who wants a different destination.
  it('keeps the search in the header on the hotel detail page', () => {
    renderNavbar('/hotel/300984');
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

  it('follows the language column and the login URL column', () => {
    headerConfig = { enableLanguageSelector: false, enableAccountMenu: true, loginUrl: '/aanmelden', siteHeader: site() };
    renderNavbar();
    expect(document.querySelector(`.${styles.langSlot}`)).toBeNull();
    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/aanmelden');
  });
});

describe('the wordmark beside the logo (CMS → Layout → Header)', () => {
  it('without an uploaded wordmark the bar keeps the "SunSky" text', () => {
    renderNavbar();
    expect(screen.getAllByText(/Sky/).length).toBeGreaterThan(0);
    expect(screen.queryByAltText('SunSky wordmark')).toBeNull();
  });

  it('an uploaded wordmark replaces the text; a broken one falls back to it', async () => {
    headerConfig = { siteHeader: { ...v2(), wordmark: { url: '/uploads/header/wordmark.png', alt: 'SunSky wordmark' } } };
    renderNavbar();
    const img = screen.getByAltText('SunSky wordmark');
    expect(img.getAttribute('src')).toMatch(/\/uploads\/header\/wordmark\.png$/);
    expect(screen.queryByText('Sky')).toBeNull();
    act(() => { img.dispatchEvent(new Event('error')); });
    await waitFor(() => expect(screen.queryByAltText('SunSky wordmark')).toBeNull());
    expect(screen.getByText('Sky')).toBeInTheDocument();
  });
});

describe('the wordmark size', () => {
  it('uses the CMS height, clamped to 20–64px, 46px by default', () => {
    headerConfig = { siteHeader: { ...v2(), wordmark: { url: '/uploads/header/w.png', alt: 'WM', height: 52 } } };
    const { unmount } = renderNavbar();
    expect(screen.getByAltText('WM').style.getPropertyValue('--wordmark-h')).toBe('52px');
    unmount();
    headerConfig = { siteHeader: { ...v2(), wordmark: { url: '/uploads/header/w.png', alt: 'WM', height: 500 } } };
    const r2 = renderNavbar();
    expect(screen.getByAltText('WM').style.getPropertyValue('--wordmark-h')).toBe('64px');
    r2.unmount();
    headerConfig = { siteHeader: { ...v2(), wordmark: { url: '/uploads/header/w.png', alt: 'WM' } } };
    renderNavbar();
    expect(screen.getByAltText('WM').style.getPropertyValue('--wordmark-h')).toBe('46px');
  });
});

describe('the logo size', () => {
  it('automatic without a CMS height; the CMS height (20–80px) when set', () => {
    const { unmount } = renderNavbar();
    const auto = screen.getAllByRole('img').find((i) => i.className.includes(styles.logoImg));
    expect(auto.style.getPropertyValue('--logo-h')).toBe('');
    unmount();
    headerConfig = { siteHeader: { ...v2(), logo: { height: 56 } } };
    renderNavbar();
    const sized = screen.getAllByRole('img').find((i) => i.className.includes(styles.logoImg));
    expect(sized.style.getPropertyValue('--logo-h')).toBe('56px');
    expect(sized.className).toContain(styles.logoSized);
  });
});
