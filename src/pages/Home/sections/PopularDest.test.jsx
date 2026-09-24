import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../../i18n';
import PopularDest from './PopularDest';
import styles from './PopularDest.module.css';

/**
 * "Most popular destinations": one card per travel category, each link with its own emoji.
 *
 * Everything on a card can be set in the dashboard (Homepage Settings), and everything left
 * blank is filled in here, so a card typed in before the icons existed still looks finished.
 * These pin both halves: a dashboard choice always wins, and Automatic reads the words.
 */

const country = (code, name) => ({ type: 'country', code, name, countryName: '' });
const city = (code, name, countryName) => ({ type: 'city', code, name, countryName });

// The live cards when this was written, none of which had an icon or colour set.
const LIVE = [
  {
    title: 'Verre reizen',
    count: '480+ holidays',
    links: [
      { label: 'Bali', dest: city('BAI', 'Bali', 'Indonesia') },
      { label: 'Thailand', dest: country('TH', 'Thailand') },
      { label: 'Sri Lanka' },
    ],
  },
  {
    title: 'All Inclusive',
    count: '1,200+ holidays',
    links: [
      { label: 'Turkey All Inclusive', dest: country('TR', 'Turkey'), boardCode: 'AI' },
      { label: 'Egypt All Inclusive', dest: country('EG', 'Egypt'), boardCode: 'AI' },
    ],
  },
  {
    title: 'Last Minutes',
    count: '320+ deals',
    links: [{ label: 'Last Minute Canary Islands', dest: city('TFS', 'Tenerife', 'Spain'), holidayTypeId: 12 }],
  },
  { title: 'Cities', count: '890+ trips', links: [{ label: 'Paris', dest: city('PAR', 'Paris', 'France') }] },
];

const renderSection = (groups) =>
  render(
    <MemoryRouter>
      <PopularDest cms={groups ? { popularDestinationGroups: groups } : null} />
    </MemoryRouter>
  );

const card = (title) => screen.getByRole('heading', { level: 3, name: title }).closest('article');
const headerIcon = (el) => el.querySelector(`.${styles.tile} [data-icon]`).getAttribute('data-icon');
const linkIcon = (el, label) =>
  within(el).getByText(label).closest('li').querySelector('[data-icon]').getAttribute('data-icon');
const params = (href) => Object.fromEntries(new URL(href, 'https://x').searchParams);

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('Most popular destinations', () => {
  it('fills in each card from its title when the dashboard left it on Automatic', () => {
    renderSection(LIVE);
    expect(headerIcon(card('Verre reizen'))).toBe('island');
    expect(card('Verre reizen').querySelector(`.${styles.tile}`)).toHaveClass(styles.tone_blue);
    expect(headerIcon(card('All Inclusive'))).toBe('sun');
    // Plural in the dashboard, singular in the rules: still the discount card.
    expect(headerIcon(card('Last Minutes'))).toBe('sale');
    expect(card('Last Minutes').querySelector(`.${styles.tile}`)).toHaveClass(styles.tone_pink);
    expect(headerIcon(card('Cities'))).toBe('city');
  });

  it('gives each link an emoji from its text or place', () => {
    renderSection(LIVE);
    expect(linkIcon(card('Verre reizen'), 'Bali')).toBe('desert-island');
    expect(linkIcon(card('Verre reizen'), 'Thailand')).toBe('hindu-temple');
    expect(linkIcon(card('All Inclusive'), 'Turkey All Inclusive')).toBe('mosque');
    expect(linkIcon(card('Last Minutes'), 'Last Minute Canary Islands')).toBe('palm-tree');
    expect(linkIcon(card('Cities'), 'Paris')).toBe('tokyo-tower');
  });

  it('uses what the dashboard picked over anything automatic', () => {
    renderSection([
      {
        ...LIVE[0],
        icon: 'palm-tree',
        tone: 'purple',
        links: [{ label: 'Bali', dest: city('BAI', 'Bali', 'Indonesia'), icon: 'sunset' }],
      },
    ]);
    const c = card('Verre reizen');
    expect(headerIcon(c)).toBe('palm-tree');
    expect(c.querySelector(`.${styles.tile}`)).toHaveClass(styles.tone_purple);
    expect(linkIcon(c, 'Bali')).toBe('sunset');
  });

  it('ignores icon and colour names it does not know', () => {
    renderSection([{ ...LIVE[3], icon: 'no-such-glyph', tone: 'neon', links: [{ label: 'Paris', icon: 'nope' }] }]);
    const c = card('Cities');
    expect(headerIcon(c)).toBe('city');
    expect(c.querySelector(`.${styles.tile}`)).toHaveClass(styles.tone_green);
    expect(linkIcon(c, 'Paris')).toBe('tokyo-tower');
  });

  it('links each destination to its search, and leaves an unlinked one as text', () => {
    renderSection(LIVE);
    const c = card('Verre reizen');
    expect(params(within(c).getByRole('link', { name: /Bali/ }).getAttribute('href'))).toMatchObject({
      destinations: 'BAI',
    });
    expect(within(c).queryByRole('link', { name: /Sri Lanka/ })).toBeNull();
    expect(within(c).getByText('Sri Lanka')).toBeInTheDocument();
  });

  it('points "View all" at every place in the card, keeping a shared board type', () => {
    renderSection(LIVE);
    const viewAll = within(card('All Inclusive')).getByRole('link', { name: 'View all all inclusive' });
    expect(params(viewAll.getAttribute('href'))).toMatchObject({
      countries: 'TR,EG',
      boards: 'AI',
      destinationLabel: 'All Inclusive',
    });
  });

  it('takes the dashboard\'s own "View all" text and filters', () => {
    renderSection([
      { ...LIVE[0], viewAll: { label: 'View all destinations' } },
      { ...LIVE[3], viewAll: { label: '', holidayTypeId: 12 } },
    ]);
    // Text only: still searches every place in the card.
    const first = within(card('Verre reizen')).getByRole('link', { name: 'View all destinations' });
    expect(params(first.getAttribute('href'))).toMatchObject({ countries: 'TH', destinations: 'BAI' });
    // Filters only: the default text, the dashboard's search.
    const second = within(card('Cities')).getByRole('link', { name: 'View all cities' });
    expect(params(second.getAttribute('href'))).toEqual({ themes: '12', destinationLabel: 'Cities' });
  });

  it('leaves "View all" out when there is nowhere for it to go', () => {
    renderSection([{ title: 'Ideas', count: '', links: ['Somewhere', { label: 'Elsewhere' }] }]);
    expect(within(card('Ideas')).queryByRole('link', { name: /View all/ })).toBeNull();
  });

  it('shows four ready-made cards while the dashboard has none', () => {
    renderSection(null);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(headerIcon(card('Distant Destinations'))).toBe('island');
  });
});
