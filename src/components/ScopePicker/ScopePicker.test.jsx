import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScopePicker from './ScopePicker';

// Cities/areas are fetched per ticked country; Antalya (AYT) carries the two areas the
// hierarchy tests need, Istanbul (IST) is the sibling city, Spain the sibling country.
vi.mock('../../api/filters', () => ({
  fetchDestinations: vi.fn((countryCodes) => Promise.resolve([
    ...(countryCodes.includes('TR') ? [
      { code: 'AYT', name: 'Antalya',  countryCode: 'TR', countryName: 'Turkey' },
      { code: 'IST', name: 'Istanbul', countryCode: 'TR', countryName: 'Turkey' },
    ] : []),
    ...(countryCodes.includes('ES') ? [
      { code: 'PMI', name: 'Mallorca', countryCode: 'ES', countryName: 'Spain' },
    ] : []),
  ])),
  fetchZones: vi.fn((cityCodes) => Promise.resolve(
    cityCodes.includes('AYT')
      ? [
          { destinationCode: 'AYT', destinationName: 'Antalya', zoneCode: '16', name: 'Lara' },
          { destinationCode: 'AYT', destinationName: 'Antalya', zoneCode: '4',  name: 'Belek' },
        ]
      : []
  )),
}));

const COUNTRIES = [{ code: 'TR', name: 'Turkey' }, { code: 'ES', name: 'Spain' }];

const setup = () => {
  const onApply = vi.fn();
  render(
    <ScopePicker
      countries={COUNTRIES}
      value={{ countries: [], destinations: [], zones: [] }}
      onApply={onApply}
    />
  );
  return { user: userEvent.setup(), onApply };
};

const applyBtn = () => screen.getByRole('button', { name: /^(Search \d+ places?|Select a destination)$/ });
const tick = async (user, name) => user.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));

// The count on the Apply button is the number of places the search will actually cover.
// It is NOT the number of ticked boxes: an area lives inside its city and a city inside its
// country, so ticking "Antalya" and then the area "Lara" is ONE narrowed search, not two —
// the zone scope restricts the priced set to Lara. Summing the three tiers double-counted
// every ancestor of a refined pick.
describe('ScopePicker — how many places the search covers', () => {
  it('counts a whole country as one place', async () => {
    const { user } = setup();
    await tick(user, 'Turkey');
    await waitFor(() => expect(applyBtn()).toHaveTextContent('Search 1 place'));
  });

  it('does not count a country whose cities were narrowed down', async () => {
    const { user } = setup();
    await tick(user, 'Turkey');
    await tick(user, 'Antalya');
    await waitFor(() => expect(applyBtn()).toHaveTextContent('Search 1 place'));
  });

  it('does not count a city whose areas were narrowed down', async () => {
    const { user } = setup();
    await tick(user, 'Turkey');
    await tick(user, 'Antalya');
    await tick(user, 'Lara');
    await waitFor(() => expect(applyBtn()).toHaveTextContent('Search 1 place'));
  });

  it('counts each area of a narrowed city', async () => {
    const { user } = setup();
    await tick(user, 'Turkey');
    await tick(user, 'Antalya');
    await tick(user, 'Lara');
    await tick(user, 'Belek');
    await waitFor(() => expect(applyBtn()).toHaveTextContent('Search 2 places'));
  });

  it('counts sibling cities of the same country separately', async () => {
    const { user } = setup();
    await tick(user, 'Turkey');
    await tick(user, 'Antalya');
    await tick(user, 'Istanbul');
    await waitFor(() => expect(applyBtn()).toHaveTextContent('Search 2 places'));
  });

  it('keeps counting a country that has no city of its own picked', async () => {
    const { user } = setup();
    await tick(user, 'Turkey');
    await tick(user, 'Spain');
    await tick(user, 'Antalya');   // narrows Turkey only — Spain stays whole
    await waitFor(() => expect(applyBtn()).toHaveTextContent('Search 2 places'));
  });

  it('applies every tier it was given, whatever the headline count says', async () => {
    const { user, onApply } = setup();
    await tick(user, 'Turkey');
    await tick(user, 'Antalya');
    await tick(user, 'Lara');
    await waitFor(() => expect(applyBtn()).toHaveTextContent('Search 1 place'));
    await user.click(applyBtn());
    expect(onApply).toHaveBeenCalledWith({
      countries: ['TR'], destinations: ['AYT'], zones: ['AYT:16'],
    });
  });
});
