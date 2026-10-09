import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Hotels from './Hotels';
import { fetchPackages } from '../../../api/filters';

// The card's price is the hotel's real package from-price (the precalculated default search),
// never the figure typed in the CMS.
vi.mock('../../../api/filters', () => ({ fetchPackages: vi.fn() }));
const PKG = {
  hotelCode: '32243', destination: 'AYT', sunskyPayableTotal: 1100.4, sunskyPayableTotalRounded: 1101, pricePerPerson: 551,
  stay: { checkin: '2026-11-10', checkout: '2026-11-17', nights: 7 }, departureAirport: 'BRU',
};
beforeEach(() => {
  fetchPackages.mockReset();
  fetchPackages.mockResolvedValue({ hotels: [PKG] });
});

// The "Populair bij onze vakantiegangers" row. Cards are picked in the CMS from the real hotels
// table, so each one carries the hotel's BOOKABLE identity (hotelCode + destinationCode) and
// links to that hotel's live-priced detail page.

const cms = (popularHotels) => ({ popularHotels });

const HOTEL = {
  hotelId: 412, hotelCode: '32243', destinationCode: 'AYT',
  name: 'Rixos Premium Belek', location: '🇹🇷 Antalya, Turkey',
  score: '9.2', stars: 5, price: '€899',
  imageUrl: 'https://photos.hotelbeds.com/giata/00/032243/a.jpg',
};

const renderSection = (config) =>
  render(<MemoryRouter><Hotels cms={config} /></MemoryRouter>);

const cardFor = (name) => screen.getByText(name).closest('article');

describe('a CMS-picked hotel card', () => {
  it('links to that hotel with a full search context', () => {
    renderSection(cms([HOTEL]));
    const href = within(cardFor('Rixos Premium Belek')).getByRole('link', { name: /bekijk de deal/i })
      .getAttribute('href');

    const [path, query] = href.split('?');
    const q = new URLSearchParams(query);
    expect(path).toBe('/hotel/32243');
    expect(q.get('destination')).toBe('AYT');
    expect(q.get('name')).toBe('Rixos Premium Belek');
    expect(q.get('stars')).toBe('5');
    // Without dates and occupancy the detail page cannot price anything.
    expect(q.get('adults')).toBe('2');
    expect(q.get('rooms')).toBe('1');
    expect(q.get('children')).toBe('0');
    expect(q.get('nights')).toBe('7');
    expect(q.get('checkIn')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.get('checkOut')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults to a seven-night stay a month out', () => {
    renderSection(cms([HOTEL]));
    const q = new URLSearchParams(
      within(cardFor('Rixos Premium Belek')).getByRole('link', { name: /bekijk de deal/i })
        .getAttribute('href').split('?')[1]);
    const days = (new Date(`${q.get('checkOut')}T00:00:00Z`) - new Date(`${q.get('checkIn')}T00:00:00Z`)) / 86400000;
    expect(days).toBe(7);
  });

  it('makes the whole card clickable, without a second announced link', () => {
    renderSection(cms([HOTEL]));
    const card = cardFor('Rixos Premium Belek');
    // Two anchors (the card overlay and the CTA) but only ONE in the accessibility tree.
    expect(card.querySelectorAll('a')).toHaveLength(2);
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    const overlay = [...card.querySelectorAll('a')].find((a) => a.getAttribute('aria-hidden') === 'true');
    expect(overlay).toHaveAttribute('tabindex', '-1');
    expect(overlay.getAttribute('href')).toBe(
      within(card).getByRole('link', { name: /bekijk de deal/i }).getAttribute('href'));
  });

  it('keeps Save-to-favourites a button, so it cannot navigate', () => {
    renderSection(cms([HOTEL]));
    const fav = within(cardFor('Rixos Premium Belek'))
      .getByRole('button', { name: /rixos premium belek bij favorieten bewaren/i });
    expect(fav).toHaveAttribute('type', 'button');
  });

  it('renders the CMS content the card was configured with (its price is the live one)', async () => {
    renderSection(cms([HOTEL]));
    const card = cardFor('Rixos Premium Belek');
    expect(within(card).getByText('🇹🇷 Antalya, Turkey')).toBeInTheDocument();
    expect(within(card).getByText('9.2')).toBeInTheDocument();
    await waitFor(() => expect(card.textContent).toMatch(/€551/));
    expect(card.textContent).not.toMatch(/€899/);
    expect(within(card).getByRole('img')).toHaveAttribute('src', HOTEL.imageUrl);
  });
});

describe('a card that cannot be linked', () => {
  it('is not clickable when the CMS entry has no hotelCode', () => {
    // Older CMS entries stored only the internal hotelId. The backend resolves those on read,
    // but a hotel that has since been deactivated resolves to nothing — better a dead card
    // than a link into an empty search.
    renderSection(cms([{ ...HOTEL, hotelCode: null, destinationCode: null }]));
    const card = cardFor('Rixos Premium Belek');
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(card.querySelector('a')).toBeNull();
    expect(within(card).getByRole('button', { name: /bekijk deal/i })).toBeDisabled();
  });

  it('leaves the built-in demo cards unlinked', () => {
    renderSection({});   // no CMS hotels at all
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    for (const b of screen.getAllByRole('button', { name: /bekijk deal/i })) expect(b).toBeDisabled();
  });
});

describe('section content', () => {
  it('uses the CMS headings when present', () => {
    renderSection({
      popularHotels: [HOTEL],
      sectionHeaders: { hotels: { tag: '★ Editors', title: 'Our best stays', subtitle: 'Hand-picked.' } },
    });
    expect(screen.getByText('★ Editors')).toBeInTheDocument();
    expect(screen.getByText('Hand-picked.')).toBeInTheDocument();
    // The last word carries the cursive accent, so the title renders across two elements.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Our best stays');
  });

  it('falls back to the default headings', () => {
    renderSection({ popularHotels: [HOTEL] });
    expect(screen.getByRole('heading', { level: 2 }).textContent)
      .toBe('Populair bij onze vakantiegangers');
  });

  it('a hotel without a package shows no price (never the CMS figure), the hotel link stays', async () => {
    fetchPackages.mockResolvedValue({ hotels: [] });
    renderSection(cms([HOTEL]));
    const card = cardFor('Rixos Premium Belek');
    await waitFor(() => expect(fetchPackages).toHaveBeenCalled());
    await waitFor(() => expect(card.querySelector('[aria-hidden="true"] > div')).toBeNull());
    expect(card.textContent).not.toMatch(/899/);
    expect(within(card).getByRole('link', { name: /bekijk de deal/i })).toBeInTheDocument();
  });
});

describe('the from-price', () => {
  it('is the package from-price, asked from the precalculated default search', async () => {
    renderSection(cms([HOTEL]));
    const card = cardFor('Rixos Premium Belek');
    expect(card.textContent).not.toMatch(/899/);                 // not the CMS price, not even while loading
    await waitFor(() => expect(card.textContent).toMatch(/551/));
    const body = fetchPackages.mock.calls[0][0];
    expect(body).toMatchObject({ destinations: ['AYT'], hotelCodes: ['32243'], nights: '7', adults: '2', children: '0', rooms: '1' });
    expect(body.from).toBeUndefined();
  });

  it('opens the hotel page on that package’s own stay and airport', async () => {
    renderSection(cms([HOTEL]));
    const card = cardFor('Rixos Premium Belek');
    await waitFor(() => expect(card.textContent).toMatch(/551/));
    const q = new URLSearchParams(within(card).getByRole('link', { name: /bekijk de deal/i }).getAttribute('href').split('?')[1]);
    expect([q.get('checkIn'), q.get('checkOut'), q.get('nights'), q.get('origin')]).toEqual(['2026-11-10', '2026-11-17', '7', 'BRU']);
  });

  it('the package search failing shows no price, never the CMS one', async () => {
    fetchPackages.mockRejectedValue(new Error('502'));
    renderSection(cms([HOTEL]));
    await waitFor(() => expect(fetchPackages).toHaveBeenCalled());
    expect(cardFor('Rixos Premium Belek').textContent).not.toMatch(/899/);
  });
});
