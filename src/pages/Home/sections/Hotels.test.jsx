import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Hotels from './Hotels';

// The "Popular with our holidaymakers" row. Cards are picked in the CMS from the real hotels
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
    const href = within(cardFor('Rixos Premium Belek')).getByRole('link', { name: /view deal/i })
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
      within(cardFor('Rixos Premium Belek')).getByRole('link', { name: /view deal/i })
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
      within(card).getByRole('link', { name: /view deal/i }).getAttribute('href'));
  });

  it('keeps Save-to-favourites a button, so it cannot navigate', () => {
    renderSection(cms([HOTEL]));
    const fav = within(cardFor('Rixos Premium Belek'))
      .getByRole('button', { name: /save rixos premium belek to favourites/i });
    expect(fav).toHaveAttribute('type', 'button');
  });

  it('renders the CMS content the card was configured with', () => {
    renderSection(cms([HOTEL]));
    const card = cardFor('Rixos Premium Belek');
    expect(within(card).getByText('🇹🇷 Antalya, Turkey')).toBeInTheDocument();
    expect(within(card).getByText('9.2')).toBeInTheDocument();
    expect(card.textContent).toMatch(/€899/);
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
    expect(within(card).getByRole('button', { name: /view deal/i })).toBeDisabled();
  });

  it('leaves the built-in demo cards unlinked', () => {
    renderSection({});   // no CMS hotels at all
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    for (const b of screen.getAllByRole('button', { name: /view deal/i })) expect(b).toBeDisabled();
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
      .toBe('Popular with our holidaymakers');
  });

  it('renders a card with no price without its voucher stub', () => {
    renderSection(cms([{ ...HOTEL, price: '' }]));
    const card = cardFor('Rixos Premium Belek');
    expect(within(card).queryByRole('link', { name: /view deal/i })).not.toBeInTheDocument();
    expect(card.textContent).not.toMatch(/From/);
  });
});
