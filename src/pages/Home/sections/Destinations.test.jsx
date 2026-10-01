import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../../i18n';
import Destinations from './Destinations';

/**
 * The sun-destinations section: country tabs over photo cards. Its "Show all" searches every
 * place in the open tab at once, so it has to follow the tab the reader is looking at.
 */

const city = (code, name, countryName) => ({ type: 'city', code, name, countryName });

const cms = {
  destinationTabs: [
    {
      tab: 'Spanje',
      cards: [
        { name: 'Tenerife', dest: city('TFS', 'Tenerife', 'Spain') },
        { name: 'Gran Canaria', dest: city('LPA', 'Gran Canaria', 'Spain') },
        { name: 'Mallorca', dest: city('PMI', 'Mallorca', 'Spain') },
      ],
    },
    {
      tab: 'Turkije',
      cards: [
        { name: 'Antalya', dest: city('AYT', 'Antalya', 'Turkey') },
        { name: 'Bodrum', dest: city('BJV', 'Bodrum', 'Turkey') },
      ],
    },
    // A tab the dashboard has not linked to any place yet.
    { tab: 'Portugal', cards: [{ name: 'Algarve' }] },
  ],
};

const renderSection = () => render(
  <MemoryRouter>
    <Destinations cms={cms} />
  </MemoryRouter>
);
const showAll = () => screen.queryByRole('link', { name: /toon alles/i });
const query = (link) => new URL(link.getAttribute('href'), 'https://example.test').searchParams;

beforeAll(() => i18n.changeLanguage('nl'));

describe('Destinations "Show all"', () => {
  it("searches every place in the open tab, under the tab's name", () => {
    renderSection();
    const link = showAll();
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href').startsWith('/results?')).toBe(true);
    expect(query(link).get('destinations')).toBe('TFS,LPA,PMI');
    expect(query(link).get('destinationLabel')).toBe('Spanje');
  });

  it('follows the tab the reader picks', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('button', { name: 'Turkije' }));
    expect(query(showAll()).get('destinations')).toBe('AYT,BJV');
    expect(query(showAll()).get('destinationLabel')).toBe('Turkije');
  });

  it('shows no button for a tab with no linked places', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('button', { name: 'Portugal' }));
    expect(showAll()).toBeNull();
  });
});
