import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The consent gate and the four funnel events.
 *
 * CONFIGURED AS IF A CONTAINER EXISTED. Without this mock the whole file is theatre: no
 * VITE_GTM_CONTAINER_ID is set in a test run, so every function returns false at its FIRST
 * gate and the suite would pass just as happily with the consent check deleted. Forcing the
 * container on means the only thing between the visitor and Google here is consent, which is
 * the thing under test. The same trick the Trustpilot pre-consent suite uses, for the same
 * reason.
 */
vi.mock('./config', () => ({
  GTM_CONTAINER_ID: 'GTM-TEST123',
  GTM_ENABLED: true,
  GTM_SCRIPT_URL: 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST123',
  DATA_LAYER_NAME: 'dataLayer',
  TRACKING_ENV: 'uat',
}));

const load = async () => {
  const dl = await import('./dataLayer');
  const ev = await import('./events');
  const cm = await import('./consentMode');
  const gtm = await import('./gtm');
  return { ...dl, ...ev, ...cm, ...gtm };
};

let A;

beforeEach(async () => {
  vi.resetModules();
  A = await load();
  A.__resetDataLayerState();
  A.__resetGtmLoader();
  A.__resetPurchaseGuard();
  document.querySelectorAll('script[data-sunsky-gtm]').forEach((n) => n.remove());
});

afterEach(() => {
  document.querySelectorAll('script[data-sunsky-gtm]').forEach((n) => n.remove());
});

/** Only the funnel entries, not Consent Mode's `arguments` objects. */
const events = () => (window.dataLayer || []).filter((e) => !!e && typeof e === 'object' && 'event' in e);
const lastEvent = () => events()[events().length - 1];

const HOTEL = {
  transport: 'package',
  country: 'Turkey',
  destination: 'Antalya',
  hotelCode: '12345',
  hotelName: 'Example Resort',
  departureDate: '2026-10-15',
  departureAirport: 'BRU',
  duration: 8,
  adults: 2,
  children: 1,
  board: 'AI',
};

/* ════════════════════════ the gate ════════════════════════ */

describe('a visitor who has not consented', () => {
  it('has nothing pushed for any of the four events', () => {
    // Collection is off by default — setCollectionAllowed has not been called.
    A.trackSearch(HOTEL);
    A.trackViewItem(HOTEL);
    A.trackBeginCheckout({ ...HOTEL, value: 1847 });
    A.trackPurchase({ ...HOTEL, value: 1847, transactionId: 'SS-1' });

    expect(events()).toEqual([]);
  });

  /**
   * THE RETROACTIVE-UPLOAD TRAP. GTM replays the entire dataLayer array from index 0 when the
   * container boots. If pre-consent events were merely "not sent" but still buffered in the
   * array, a visitor who browsed and only then accepted would have that browsing uploaded
   * after the fact. They must not be in the array at all.
   */
  it('leaves no buffered event for GTM to replay after a later acceptance', () => {
    A.trackSearch(HOTEL);
    A.trackViewItem(HOTEL);
    expect(events()).toEqual([]);

    A.setCollectionAllowed(true);
    // Only what happens from here on is collected.
    A.trackSearch(HOTEL);
    expect(events().map((e) => e.event)).toEqual(['search']);
  });

  /**
   * The container must not merely be denied by Consent Mode - it must not be fetched.
   *
   * Asserted through the component rather than by calling `loadGtm()` directly, because
   * "does the page end up with a GTM script on it" is the question that matters, and
   * `<Analytics />` is the only thing that ever decides to load one.
   */
  it('gets no GTM container script on the page', async () => {
    const { render } = await import('@testing-library/react');
    const { ConsentProvider } = await import('../context/ConsentContext');
    const { default: Analytics } = await import('./Analytics');

    render(<ConsentProvider><Analytics /></ConsentProvider>);
    await new Promise((r) => setTimeout(r, 20));

    expect(document.querySelectorAll('script[data-sunsky-gtm]')).toHaveLength(0);
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(0);
  });

  it('still establishes the denied Consent Mode defaults', async () => {
    const { render } = await import('@testing-library/react');
    const { ConsentProvider } = await import('../context/ConsentContext');
    const { default: Analytics } = await import('./Analytics');

    render(<ConsentProvider><Analytics /></ConsentProvider>);
    await new Promise((r) => setTimeout(r, 20));

    // §23: the default state is established even for a visitor who has not answered, so a
    // container that loads later never boots unconstrained.
    const [cmd, action, payload] = window.dataLayer[0];
    expect([cmd, action]).toEqual(['consent', 'default']);
    expect(payload.ad_storage).toBe('denied');
  });
});

describe('Consent Mode (Tracking Master §23)', () => {
  it('defaults every Google signal to denied, and never hard-codes granted', () => {
    A.setConsentDefaults();
    const [cmd, action, payload] = window.dataLayer[0];
    expect(cmd).toBe('consent');
    expect(action).toBe('default');
    expect(payload.analytics_storage).toBe('denied');
    expect(payload.ad_storage).toBe('denied');
    expect(payload.ad_user_data).toBe('denied');
    expect(payload.ad_personalization).toBe('denied');
  });

  it('grants only what the visitor actually chose', () => {
    A.setConsentDefaults();
    A.updateConsent({ analytics: true, marketing: false });
    const [, action, payload] = window.dataLayer[1];
    expect(action).toBe('update');
    expect(payload.analytics_storage).toBe('granted');
    // Accepting measurement is not accepting advertising.
    expect(payload.ad_storage).toBe('denied');
    expect(payload.ad_user_data).toBe('denied');
    expect(payload.ad_personalization).toBe('denied');
  });

  it('puts the defaults in the array before anything else', () => {
    A.setConsentDefaults();
    A.setCollectionAllowed(true);
    A.trackSearch(HOTEL);
    // Index 0 is the default command. The container therefore reads it before any event,
    // which is what "established before Google measurement tags process user activity" means
    // when the container is injected rather than placed in <head>.
    expect(window.dataLayer[0][1]).toBe('default');
  });

  it('pushes consent commands even though collection is off', () => {
    // These are the commands that TELL Google permission is absent, so gating them behind
    // permission would be circular.
    expect(A.isCollectionAllowed()).toBe(false);
    A.setConsentDefaults();
    expect(window.dataLayer).toHaveLength(1);
  });
});

/* ════════════════════════ event shapes ════════════════════════ */

describe('with consent granted', () => {
  beforeEach(() => A.setCollectionAllowed(true));

  it('tags every event with the tracking environment (§25)', () => {
    A.trackSearch(HOTEL);
    // So GTM can hold the production GA4 and Ads tags back on UAT traffic.
    expect(lastEvent().tracking_environment).toBe('uat');
  });

  it('sends search with the §9 dimensions and no ecommerce block', () => {
    A.trackSearch(HOTEL);
    const e = lastEvent();
    expect(e).toMatchObject({
      event: 'search',
      product_type: 'FLIGHT_HOTEL',
      country: 'Turkey',
      destination: 'Antalya',
      departure_date: '2026-10-15',
      departure_airport: 'BRU',
      duration: 8,
      adults: 2,
      children: 1,
    });
    expect(e.ecommerce).toBeUndefined();
  });

  it('sends view_item with one item and no value (§10)', () => {
    A.trackViewItem(HOTEL);
    const e = lastEvent();
    expect(e.event).toBe('view_item');
    expect(e.ecommerce.items).toHaveLength(1);
    expect(e.ecommerce.items[0]).toMatchObject({
      item_id: '12345', item_name: 'Example Resort', item_category: 'FLIGHT_HOTEL', quantity: 1,
    });
    // A from-price for a party that may not be this visitor's would seed GA4 item revenue
    // with a number §11 explicitly calls obsolete.
    expect(e.ecommerce.value).toBeUndefined();
    expect(e.ecommerce.items[0].price).toBeUndefined();
  });

  it('clears the previous ecommerce object first (§29 rule 5)', () => {
    A.trackViewItem(HOTEL);
    A.trackBeginCheckout({ ...HOTEL, value: 1847 });
    const raw = window.dataLayer;
    const idx = raw.findIndex((x) => x && x.event === 'begin_checkout');
    // Without the null, GA4 merges the view_item items into the checkout event.
    expect(raw[idx - 1]).toEqual({ ecommerce: null });
  });

  it('makes ecommerce.value equal the single item price, quantity 1 (§29 rule 6 and 10)', () => {
    A.trackBeginCheckout({ ...HOTEL, value: 1847 });
    const { ecommerce } = lastEvent();
    expect(ecommerce.value).toBe(1847);
    expect(ecommerce.currency).toBe('EUR');
    expect(ecommerce.items).toHaveLength(1);
    expect(ecommerce.items[0].price).toBe(1847);
    expect(ecommerce.items[0].quantity).toBe(1);
  });

  it('maps the board code to a canonical family (§7)', () => {
    A.trackBeginCheckout({ ...HOTEL, value: 1847 });
    expect(lastEvent().board_type).toBe('ALL_INCLUSIVE');
  });

  /* ── product-specific shapes ── */

  it('sends no departure_airport for HOTEL_ONLY (§16)', () => {
    A.trackSearch({ ...HOTEL, transport: 'hotel_only', departureAirport: 'BRU' });
    const e = lastEvent();
    expect(e.product_type).toBe('HOTEL_ONLY');
    // Suppressed even though a value was available: the shape is part of the contract.
    expect(e.departure_airport).toBeUndefined();
  });

  it('sends no hotel fields or board for FLIGHT_ONLY (§17)', () => {
    A.trackPurchase({
      kind: 'flight',
      country: 'Spain',
      destination: 'Barcelona',
      hotelCode: '999', hotelName: 'Leftover Hotel', board: 'AI',
      departureDate: '2026-10-15', departureAirport: 'BRU',
      duration: 5, adults: 2, children: 0,
      value: 438, transactionId: 'SS-123458',
    });
    const e = lastEvent();
    expect(e.product_type).toBe('FLIGHT_ONLY');
    expect(e.hotel_id).toBeUndefined();
    expect(e.hotel_name).toBeUndefined();
    expect(e.board_type).toBeUndefined();
    // §17's fallback: no stable flight product id exists, so a descriptive name is used and
    // no item_id is invented.
    expect(e.ecommerce.items[0].item_name).toBe('BRU-Barcelona');
    expect(e.ecommerce.items[0].item_id).toBeUndefined();
  });

  it('tracks nothing at all for a transfer (§4)', () => {
    expect(A.trackPurchase({
      kind: 'transfer', value: 80, transactionId: 'SS-T1', destination: 'Antalya',
    })).toBe(false);
    expect(events()).toEqual([]);
  });

  it('omits fields that do not apply rather than sending blanks (§18)', () => {
    A.trackSearch({ transport: 'hotel_only', departureDate: '2026-10-15', adults: 2, children: 0 });
    const e = lastEvent();
    for (const k of ['country', 'destination', 'hotel_id', 'hotel_name', 'board_type']) {
      expect(e).not.toHaveProperty(k);
    }
    // 0 children is a real answer and survives.
    expect(e.children).toBe(0);
  });
});

/* ════════════════════════ purchase conditions ════════════════════════ */

describe('purchase (Tracking Master §12 and §15)', () => {
  beforeEach(() => A.setCollectionAllowed(true));

  const BOOKED = { ...HOTEL, value: 1847, transactionId: 'SS-123456' };

  it('fires once for a confirmed booking', () => {
    expect(A.trackPurchase(BOOKED)).toBe(true);
    const e = lastEvent();
    expect(e.event).toBe('purchase');
    expect(e.ecommerce.transaction_id).toBe('SS-123456');
    expect(e.ecommerce.value).toBe(1847);
  });

  /** "Refreshing or reopening the confirmation must not generate a new purchase." */
  it('does not fire a second time for the same booking reference', () => {
    A.trackPurchase(BOOKED);
    expect(A.trackPurchase(BOOKED)).toBe(false);
    expect(events().filter((e) => e.event === 'purchase')).toHaveLength(1);
  });

  it('survives a reload, because the guard is not in memory alone', async () => {
    A.trackPurchase(BOOKED);
    // A refresh: fresh modules, same browser storage.
    vi.resetModules();
    const fresh = await load();
    fresh.setCollectionAllowed(true);
    expect(fresh.purchaseAlreadySent('SS-123456')).toBe(true);
    expect(fresh.trackPurchase(BOOKED)).toBe(false);
  });

  it('still allows a genuinely different booking', () => {
    A.trackPurchase(BOOKED);
    expect(A.trackPurchase({ ...BOOKED, transactionId: 'SS-999999' })).toBe(true);
    expect(events().filter((e) => e.event === 'purchase')).toHaveLength(2);
  });

  it('refuses to fire without a SUNSKY booking reference', () => {
    // A client-generated placeholder is not a booking reference, so the call site passes
    // nothing rather than something that looks plausible.
    expect(A.trackPurchase({ ...BOOKED, transactionId: null })).toBe(false);
    expect(A.trackPurchase({ ...BOOKED, transactionId: '' })).toBe(false);
    expect(events()).toEqual([]);
  });

  it('refuses to fire without a value', () => {
    expect(A.trackPurchase({ ...BOOKED, value: null })).toBe(false);
    expect(events()).toEqual([]);
  });

  /**
   * The condition the call sites enforce, asserted here as the contract they rely on: a
   * purchase that was never pushed must not be remembered as sent, or a booking rescued by
   * hand could never be reported.
   */
  it('does not record a purchase it refused to send', () => {
    A.setCollectionAllowed(false);
    expect(A.trackPurchase(BOOKED)).toBe(false);
    expect(A.purchaseAlreadySent('SS-123456')).toBe(false);

    A.setCollectionAllowed(true);
    expect(A.trackPurchase(BOOKED)).toBe(true);
  });
});

/* ════════════════════════ search triggers ════════════════════════ */

describe('searchSignature (Tracking Master §9)', () => {
  it('changes when a real search criterion changes', () => {
    const a = { ...HOTEL };
    expect(A.searchSignature(a)).not.toBe(A.searchSignature({ ...a, destination: 'Bodrum' }));
    expect(A.searchSignature(a)).not.toBe(A.searchSignature({ ...a, adults: 3 }));
    expect(A.searchSignature(a)).not.toBe(A.searchSignature({ ...a, departureDate: '2026-11-01' }));
    expect(A.searchSignature(a)).not.toBe(A.searchSignature({ ...a, filterSignature: 'stars:5' }));
  });

  /**
   * §9 lists "changes sorting" among the things that must NOT fire a search. The Results
   * page re-runs its page-1 fetch on a sort change, so the signature is the only thing
   * stopping a spurious event.
   */
  it('is unchanged by sort order, which is not a search criterion', () => {
    const a = { ...HOTEL, sortBy: 'price_asc' };
    const b = { ...HOTEL, sortBy: 'stars_desc' };
    expect(A.searchSignature(a)).toBe(A.searchSignature(b));
  });

  it('is unchanged by paging', () => {
    expect(A.searchSignature({ ...HOTEL, page: 1 })).toBe(A.searchSignature({ ...HOTEL, page: 3 }));
  });
});

/* ════════════════════════ never block a booking ════════════════════════ */

describe('reliability (Tracking Master §25)', () => {
  it('cannot throw into a booking code path when the dataLayer is hostile', () => {
    A.setCollectionAllowed(true);
    // A real array - so `getDataLayer()` accepts it rather than quietly replacing it - whose
    // push throws. This is what a misbehaving third-party script or an over-eager consent
    // tool on the same page looks like.
    const hostile = [];
    hostile.push = () => { throw new Error('boom'); };
    window.dataLayer = hostile;

    expect(() => A.trackPurchase({ ...HOTEL, value: 1, transactionId: 'SS-X' })).not.toThrow();
    expect(() => A.trackSearch(HOTEL)).not.toThrow();
    expect(A.trackSearch(HOTEL)).toBe(false);
  });

  it('replaces a dataLayer that is not an array at all, rather than giving up', () => {
    A.setCollectionAllowed(true);
    // Some tools stub `dataLayer` as a plain object before GTM arrives. Taking it over is
    // the right move: measurement works, and nothing was in it to lose.
    window.dataLayer = { not: 'an array' };
    expect(A.trackSearch(HOTEL)).toBe(true);
    expect(Array.isArray(window.dataLayer)).toBe(true);
  });
});
