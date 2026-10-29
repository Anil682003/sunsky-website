import { describe, it, expect } from 'vitest';
import {
  normalizeSiteHeader, pick, langOf, headerLink, newTabProps, showOnClass, inDrawer,
  announcementKey, safeUrl,
} from './siteHeader';

// The header settings as the bar reads them. The cases that matter most are the ones where the
// bar must look exactly as it did before it was configurable: no config at all, a backend that
// predates siteHeader, and production's version 1 payload, which the website may meet before
// the backend that serves version 2 is deployed.

describe('normalizeSiteHeader: no settings', () => {
  it('describes today\'s bar when the config is missing', () => {
    const s = normalizeSiteHeader(null);
    expect(s.version).toBe(2);
    expect(s.announcement.live).toBe(false);
    expect(s.menuOrder).toEqual(['destinations', 'holidayTypes']);
    expect(s.menus.destinations).toMatchObject({ enabled: true, source: 'homepage', maxItems: 7, showGroupAsSub: true });
    // null = the server resolved nothing, so the bar derives the list itself, as before.
    expect(s.menus.holidayTypes.resolved).toBeNull();
    expect(s.menus.holidayTypes).toMatchObject({ enabled: true, source: 'auto', maxItems: 5 });
    expect(s.menus.custom).toEqual([]);
    expect(s.search).toMatchObject({ enabled: true, showSuggestions: true, showOn: 'all' });
    expect(s.support).toMatchObject({ enabled: true, link: '/faq', icon: 'phone', showLabel: true });
    expect(s.trustpilot.enabled).toBe(true);
    expect(s.language.enabled).toBe(true);
    expect(s.account).toMatchObject({ enabled: true, signInUrl: '/login' });
    expect(s.account.register).toMatchObject({ enabled: true, url: '/register' });
    expect(s.account.menuItems.map((m) => m.key)).toEqual(['bookings', 'profile', 'favourites']);
    expect(s.mobileMenu.items.map((i) => i.key)).toEqual(['holidays', 'flights', 'hotels', 'transfers']);
    // The drawer stays the four services and nothing else until the dashboard says otherwise.
    expect(s.mobileMenu.showMenus).toBe(false);
    expect(s.mobileMenu.showSearch).toBe(true);
  });

  it('ignores the old language/account columns on a backend that predates siteHeader', () => {
    const s = normalizeSiteHeader({ enableLanguageSelector: false, enableAccountMenu: false, loginUrl: '/old' });
    expect(s.language.enabled).toBe(true);
    expect(s.account.enabled).toBe(true);
    expect(s.account.signInUrl).toBe('/login');
  });

  it('survives junk', () => {
    expect(() => normalizeSiteHeader('nope')).not.toThrow();
    expect(normalizeSiteHeader({ siteHeader: 'nope' }).version).toBe(2);
    expect(normalizeSiteHeader({ siteHeader: { menus: { custom: 'x' }, menuOrder: 'x' } }).menuOrder)
      .toEqual(['destinations', 'holidayTypes']);
  });
});

describe('normalizeSiteHeader: version 1 (production today)', () => {
  const v1 = {
    enableLanguageSelector: false,
    enableAccountMenu: false,
    loginUrl: '/sign-in',
    siteHeader: {
      search: { enabled: false },
      popularDestinations: { enabled: false, label: 'Top', maxItems: 4 },
      holidayTypes: {
        enabled: true, label: '', mode: 'manual', maxItems: 3, items: [{ holidayTypeId: 13, label: 'All-in' }],
        resolved: [{ id: 13, name: 'All Inclusive', label: 'All-in', slug: 'all-inclusive' }],
      },
      support: { enabled: true, label: 'Bel ons', link: '/contact' },
      trustpilot: { enabled: false },
      mobileMenu: { useCustomLinks: false },
    },
  };

  it('upgrades exactly as the backend does', () => {
    const s = normalizeSiteHeader(v1);
    expect(s.search.enabled).toBe(false);
    expect(s.menus.destinations.enabled).toBe(false);
    expect(s.menus.destinations.label).toEqual({ nl: 'Top', en: 'Top' });
    expect(s.menus.destinations.maxItems).toBe(4);
    expect(s.menus.holidayTypes.source).toBe('manual');
    expect(s.menus.holidayTypes.items[0].label).toEqual({ nl: 'All-in', en: 'All-in' });
    expect(s.support.label).toEqual({ nl: 'Bel ons', en: 'Bel ons' });
    expect(s.support.link).toBe('/contact');
    expect(s.trustpilot.enabled).toBe(false);
    expect(s.announcement.live).toBe(false);
  });

  it('keeps the server-resolved holiday types, labels read as both languages', () => {
    const [r] = normalizeSiteHeader(v1).menus.holidayTypes.resolved;
    expect(r).toEqual({
      id: 13, name: 'All Inclusive', slug: 'all-inclusive',
      label: { nl: 'All-in', en: 'All-in' }, sub: { nl: '', en: '' }, icon: '',
    });
  });

  it('falls back to the language/account columns once siteHeader exists', () => {
    const s = normalizeSiteHeader(v1);
    expect(s.language.enabled).toBe(false);
    expect(s.account.enabled).toBe(false);
    expect(s.account.signInUrl).toBe('/sign-in');
    // Version 1 had no say over the drawer's menus; the backend's default applies.
    expect(s.mobileMenu.showMenus).toBe(true);
  });
});

describe('normalizeSiteHeader: version 2', () => {
  const v2 = {
    version: 2,
    announcement: {
      enabled: true, text: { nl: 'Herfstkorting', en: 'Autumn sale' }, tone: 'blue', live: true,
      link: '/results', linkLabel: { nl: 'Bekijk', en: 'See' },
    },
    menus: {
      destinations: { enabled: true, source: 'manual', items: [{ id: 'tr', dest: { type: 'country', code: 'tr', name: 'Turkey' }, icon: 'Mosque' }] },
      holidayTypes: { enabled: true, resolved: [{ id: 1, name: 'Zonvakanties', slug: 'zonvakanties', label: { nl: '', en: 'Sun' } }] },
      custom: [
        { id: 'deals', label: { nl: 'Deals', en: '' }, glyph: 'tag', items: [{ id: 'a', label: { nl: 'A' }, url: 'https://x.test', newTab: true }] },
        { id: 'nolabel', label: { nl: '', en: '' }, items: [] },
      ],
    },
    menuOrder: ['custom:deals', 'bogus', 'destinations'],
    account: { register: { enabled: false } },
    mobileMenu: { items: [{ key: 'flights' }, { key: '', label: { nl: 'Blog' }, url: '/blog' }, { key: '', label: { nl: 'No url' } }], showMenus: false },
  };

  it('keeps what is set and fills every gap', () => {
    const s = normalizeSiteHeader({ siteHeader: v2 });
    expect(s.announcement).toMatchObject({ live: true, tone: 'blue', dismissible: true, showOn: 'all', link: '/results' });
    expect(s.menus.destinations.items[0]).toMatchObject({ id: 'tr', icon: 'mosque', dest: { type: 'country', code: 'TR' } });
    expect(s.menus.holidayTypes.resolved[0].label).toEqual({ nl: '', en: 'Sun' });
    expect(s.account.register).toEqual({ enabled: false, label: { nl: '', en: '' }, url: '/register' });
    expect(s.mobileMenu.items.map((i) => i.key || i.label.nl)).toEqual(['flights', 'Blog']);
    expect(s.mobileMenu.items[0].url).toBe('/flights');
    expect(s.mobileMenu.showMenus).toBe(false);
  });

  it('orders every menu exactly once and drops a custom menu with no name', () => {
    const s = normalizeSiteHeader({ siteHeader: v2 });
    expect(s.menus.custom.map((m) => m.id)).toEqual(['deals']);
    expect(s.menuOrder).toEqual(['custom:deals', 'destinations', 'holidayTypes']);
  });

  it('is stable: normalising its own output changes nothing', () => {
    const once = normalizeSiteHeader({ siteHeader: v2 });
    expect(normalizeSiteHeader({ siteHeader: once })).toEqual(once);
  });

  it('shows the announcement only when the server says it is live and it has words', () => {
    const live = (a) => normalizeSiteHeader({ siteHeader: { announcement: a } }).announcement.live;
    expect(live({ enabled: true, text: { nl: 'x' }, live: true })).toBe(true);
    expect(live({ enabled: true, text: { nl: 'x' } })).toBe(false);
    expect(live({ enabled: true, text: { nl: '', en: '' }, live: true })).toBe(false);
    expect(live({ enabled: false, text: { nl: 'x' }, live: true })).toBe(false);
  });

  it('never revives a switched-off holiday-type menu from a stale resolved list', () => {
    const s = normalizeSiteHeader({ siteHeader: { menus: { holidayTypes: { enabled: false, resolved: [{ id: 1, slug: 'x' }] } } } });
    expect(s.menus.holidayTypes.resolved).toEqual([]);
  });

  it('refuses links that run script', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,hi')).toBe('');
    expect(safeUrl('//evil.test/x')).toBe('https://evil.test/x');
    expect(safeUrl('#top')).toBe('#top');
    expect(safeUrl('tel:+32')).toBe('tel:+32');
    const s = normalizeSiteHeader({ siteHeader: { support: { link: 'javascript:alert(1)' } } });
    expect(s.support.link).toBe('/faq');
  });
});

describe('pick', () => {
  const both = { nl: 'Zon', en: 'Sun' };
  it('reads the visitor\'s language', () => {
    expect(pick(both, 'nl')).toBe('Zon');
    expect(pick(both, 'en')).toBe('Sun');
    expect(pick(both, 'en-GB')).toBe('Sun');
  });
  it('prefers the given fallback over the other language', () => {
    expect(pick({ nl: '', en: 'Sun' }, 'nl', 'Zonvakanties')).toBe('Zonvakanties');
  });
  it('falls back to the other language when there is no fallback', () => {
    expect(pick({ nl: '', en: 'Sun' }, 'nl')).toBe('Sun');
    expect(pick({ nl: '', en: 'Sun' }, 'nl', '')).toBe('Sun');
    expect(pick({ nl: '  ', en: '' }, 'nl')).toBe('');
  });
  it('reads a plain string as both languages', () => {
    expect(pick('Bel ons', 'en')).toBe('Bel ons');
    expect(pick(null, 'nl', 'Klantendienst')).toBe('Klantendienst');
  });
  it('treats anything that is not English as Dutch', () => {
    expect(langOf('fr')).toBe('nl');
    expect(langOf(undefined)).toBe('nl');
    expect(langOf('EN')).toBe('en');
  });
});

describe('links', () => {
  it('sends paths on this site through the router', () => {
    expect(headerLink('/faq')).toEqual({ href: '/faq', router: true, newTab: false });
    expect(headerLink('https://holidaybooking.be/p/terms')).toEqual({ href: '/p/terms', router: true, newTab: false });
  });
  it('gives everything else a real href', () => {
    expect(headerLink('https://partner.test/x')).toEqual({ href: 'https://partner.test/x', router: false, newTab: false });
    expect(headerLink('tel:+3212345678').router).toBe(false);
    expect(headerLink('#reviews')).toEqual({ href: '#reviews', router: false, newTab: false });
    // A path asked to open in a new tab cannot go through the router.
    expect(headerLink('/deals', true)).toEqual({ href: '/deals', router: false, newTab: true });
  });
  it('opens nothing it should not', () => {
    expect(headerLink('')).toBeNull();
    expect(headerLink('javascript:alert(1)')).toBeNull();
  });
  it('protects the opener on a new tab', () => {
    expect(newTabProps(true)).toEqual({ target: '_blank', rel: 'noopener noreferrer' });
    expect(newTabProps(false)).toEqual({});
  });
});

describe('showOn', () => {
  const styles = { onlyDesktop: 'od', onlyMobile: 'om' };
  it('maps to the stylesheet\'s classes', () => {
    expect(showOnClass('desktop', styles)).toBe('od');
    expect(showOnClass('mobile', styles)).toBe('om');
    expect(showOnClass('all', styles)).toBe('');
    expect(showOnClass(undefined, styles)).toBe('');
  });
  it('keeps desktop-only blocks out of the phone menu', () => {
    expect(inDrawer('desktop')).toBe(false);
    expect(inDrawer('mobile')).toBe(true);
    expect(inDrawer('all')).toBe(true);
  });
});

describe('announcementKey', () => {
  const a = { text: { nl: 'Herfst', en: 'Autumn' }, startDate: '2026-10-01', endDate: '2026-11-30', tone: 'orange' };
  it('is stable for the same announcement, whatever its styling', () => {
    expect(announcementKey(a)).toBe(announcementKey({ ...a, tone: 'blue' }));
  });
  it('changes with the words or the dates', () => {
    expect(announcementKey(a)).not.toBe(announcementKey({ ...a, text: { nl: 'Winter', en: 'Autumn' } }));
    expect(announcementKey(a)).not.toBe(announcementKey({ ...a, endDate: '2026-12-31' }));
  });
});

describe('trustpilot score (same rule as the backend normaliser)', () => {
  const score = (v) => normalizeSiteHeader({ siteHeader: { trustpilot: { score: v } } }).trustpilot.score;
  it('keeps a real 1.0 to 5.0 score, one decimal, and nothing else', () => {
    expect(score(4.9)).toBe(4.9);
    expect(score('4,9')).toBe(4.9);
    expect(score('4.86')).toBe(4.9);
    expect(score(8.8)).toBeNull();
    expect(score('')).toBeNull();
    expect(score(undefined)).toBeNull();
  });
});
