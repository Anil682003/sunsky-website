import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScopePicker from './ScopePicker';

// Cities/areas are fetched per chosen country; Antalya (AYT) carries the two areas the
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
  fetchDestinationCountries: vi.fn(() => Promise.resolve([])),
}));

const COUNTRIES = [
  { code: 'TR', name: 'Turkey' },
  { code: 'ES', name: 'Spain' },
  { code: 'GR', name: 'Greece' },
];

/**
 * The picker is controlled: it holds no draft of its own and re-reads `value` after
 * every change, exactly as the results page drives it through the URL. Testing it
 * against a stub parent that stores what it is given is the only way the selected
 * state on screen means anything.
 */
function Harness({ onApply, initial = { countries: [], destinations: [], zones: [] }, counts = null }) {
  const [value, setValue] = useState(initial);
  return (
    <ScopePicker
      countries={COUNTRIES}
      value={value}
      counts={counts}
      popular={{ countries: ['ES'], cities: [] }}
      onApply={(next) => { onApply?.(next); setValue(next); }}
    />
  );
}

const setup = (props = {}) => {
  const onApply = vi.fn();
  render(<Harness onApply={onApply} {...props} />);
  return { user: userEvent.setup(), onApply };
};

const field = (testId) => screen.getByTestId(testId);
const openField = async (user, testId) => { await user.click(field(testId)); };
const panel = () => document.querySelector('[role="listbox"]');
const rowNames = () => [...panel().querySelectorAll('[role="option"]')].map((b) => b.textContent.trim());
const pick = async (user, name) => user.click(await screen.findByRole('option', { name: new RegExp(`^${name}`) }));

describe('ScopePicker — choosing where to search', () => {
  it('applies the moment a country is picked, with no Apply step', async () => {
    const { user, onApply } = setup();
    await openField(user, 'scope-country');
    await pick(user, 'Turkije');
    expect(onApply).toHaveBeenCalledWith({ countries: ['TR'], destinations: [], zones: [] });
  });

  it('closes the list once something is picked', async () => {
    const { user } = setup();
    await openField(user, 'scope-country');
    await pick(user, 'Turkije');
    await waitFor(() => expect(panel()).toBeNull());
  });

  it('shows the popular countries above the rest, under their own headings', async () => {
    const { user } = setup();
    await openField(user, 'scope-country');
    const headings = [...panel().querySelectorAll('li')]
      .filter((li) => !li.querySelector('[role="option"]'))
      .map((li) => li.textContent.trim());
    expect(headings).toEqual(['Populair', 'Alle andere']);
    // Spain is the only country marked popular, so it leads the list.
    expect(rowNames()[0]).toMatch(/^Spanje/);
  });

  it('filters as you type, and drops the headings while searching', async () => {
    const { user } = setup();
    await openField(user, 'scope-country');
    await user.type(field('scope-country'), 'turk');
    await waitFor(() => expect(rowNames()).toEqual(['Turkije']));
    const headings = [...panel().querySelectorAll('li')].filter((li) => !li.querySelector('[role="option"]'));
    expect(headings).toHaveLength(0);
  });

  it('finds an accented name typed without its accent', async () => {
    const { user } = setup();
    await openField(user, 'scope-country');
    await user.type(field('scope-country'), 'griek');
    await waitFor(() => expect(rowNames()).toEqual(['Griekenland']));
  });

  it('summarises the closed field by name for one country and by count for several', async () => {
    const { user } = setup();
    await openField(user, 'scope-country');
    await pick(user, 'Turkije');
    await waitFor(() => expect(field('scope-country')).toHaveValue('Turkije'));

    await openField(user, 'scope-country');
    await pick(user, 'Spanje');
    await waitFor(() => expect(field('scope-country')).toHaveValue('2 landen'));
  });

  it('takes a country back off when its row is picked again', async () => {
    const { user, onApply } = setup({ initial: { countries: ['TR'], destinations: [], zones: [] } });
    await openField(user, 'scope-country');
    await pick(user, 'Turkije');
    expect(onApply).toHaveBeenCalledWith({ countries: [], destinations: [], zones: [] });
  });

  it('removes a country from the chips inside the panel', async () => {
    const { user, onApply } = setup({ initial: { countries: ['TR'], destinations: [], zones: [] } });
    await openField(user, 'scope-country');
    await user.click(screen.getByRole('button', { name: /Turkije verwijderen|Remove Turkije/i }));
    expect(onApply).toHaveBeenCalledWith({ countries: [], destinations: [], zones: [] });
  });

  it('offers only the cities of the chosen countries', async () => {
    const { user } = setup({ initial: { countries: ['TR'], destinations: [], zones: [] } });
    await openField(user, 'scope-city');
    await waitFor(() => expect(rowNames()).toEqual(['Antalya', 'Istanbul']));
  });

  it('says to choose a country before it can offer a city', async () => {
    const { user } = setup();
    await openField(user, 'scope-city');
    expect(await within(panel()).findByText('Kies eerst een land.')).toBeInTheDocument();
  });

  it('offers only the areas of the chosen cities, naming the city each sits in', async () => {
    const { user } = setup({ initial: { countries: ['TR'], destinations: ['AYT'], zones: [] } });
    await openField(user, 'scope-area');
    await waitFor(() => expect(rowNames()).toEqual(['LaraAntalya', 'BelekAntalya']));
  });

  // The scope has to stay internally consistent: a city the country list no longer
  // covers would keep narrowing a search that is no longer looking there.
  it('drops the cities and areas of a country that is taken off', async () => {
    const { user, onApply } = setup({
      initial: { countries: ['TR', 'ES'], destinations: ['AYT', 'PMI'], zones: ['AYT:16'] },
    });
    // Let the city list load, so the picker knows which cities belonged to Turkey.
    await openField(user, 'scope-city');
    await waitFor(() => expect(rowNames()).toContain('Antalya'));
    await user.keyboard('{Escape}');

    await openField(user, 'scope-country');
    await pick(user, 'Turkije');
    expect(onApply).toHaveBeenCalledWith({ countries: ['ES'], destinations: ['PMI'], zones: [] });
  });

  it('keeps a sibling country and its cities when another is taken off', async () => {
    const { user, onApply } = setup({
      initial: { countries: ['TR', 'ES'], destinations: ['PMI'], zones: [] },
    });
    await openField(user, 'scope-city');
    await waitFor(() => expect(rowNames()).toContain('Mallorca'));
    await user.keyboard('{Escape}');

    await openField(user, 'scope-country');
    await pick(user, 'Turkije');
    expect(onApply).toHaveBeenCalledWith({ countries: ['ES'], destinations: ['PMI'], zones: [] });
  });
});

/**
 * Hotels per place (UI-13, Ch 1 §5). A number next to a place is a claim, so it appears only
 * where the search can back it, and a country is the sum of ITS destinations so that a hotel
 * matched by both "Turkey" and "Antalya" is still counted once.
 */
describe('ScopePicker — hotels per place', () => {
  it('shows a destination count straight from the search', async () => {
    const { user } = setup({
      initial: { countries: ['TR'], destinations: [], zones: [] },
      counts: { AYT: 624, IST: 97 },
    });
    await openField(user, 'scope-city');
    const antalya = await screen.findByRole('option', { name: /^Antalya/ });
    expect(antalya.textContent).toMatch(/624/);
    expect((await screen.findByRole('option', { name: /^Istanbul/ })).textContent).toMatch(/97/);
  });

  it('a country totals its own destinations, so a hotel is never counted twice', async () => {
    // Turkey = Antalya + Istanbul = 721. Not a separate tally that could also include a hotel
    // already counted under Antalya.
    const { user } = setup({
      initial: { countries: ['TR'], destinations: [], zones: [] },
      counts: { AYT: 624, IST: 97, PMI: 500 },
    });
    await openField(user, 'scope-country');
    const turkey = await screen.findByRole('option', { name: /^Turkije/ });
    expect(turkey.textContent).toMatch(/721/);
  });

  it('shows no number for a country whose destinations are not loaded', async () => {
    // Spain is not selected, so its destinations are unknown here. A partial total would
    // understate it, and a zero would call it sold out.
    const { user } = setup({
      initial: { countries: ['TR'], destinations: [], zones: [] },
      counts: { AYT: 624, IST: 97 },
    });
    await openField(user, 'scope-country');
    const spain = await screen.findByRole('option', { name: /^Spanje/ });
    expect(spain.textContent).not.toMatch(/\d/);
  });

  it('shows no numbers at all when the search cannot say', async () => {
    // null is what the page passes while a group is still answering or the answer is
    // incomplete. Every row stays bare rather than claiming a figure that is still settling.
    const { user } = setup({
      initial: { countries: ['TR'], destinations: [], zones: [] },
      counts: null,
    });
    await openField(user, 'scope-city');
    const antalya = await screen.findByRole('option', { name: /^Antalya/ });
    expect(antalya.textContent).not.toMatch(/\d/);
  });

  it('a destination with nothing left shows zero rather than going blank', async () => {
    // Zero is an answer: this place has no hotels under the current filters.
    const { user } = setup({
      initial: { countries: ['TR'], destinations: [], zones: [] },
      counts: { AYT: 0, IST: 97 },
    });
    await openField(user, 'scope-city');
    expect((await screen.findByRole('option', { name: /^Antalya/ })).textContent).toMatch(/0/);
  });
});

describe('ScopePicker — the whole field opens the list', () => {
  it('a press on the arrow opens it and keeps it open (the arrow is swapped for the search icon on open)', async () => {
    const { user } = setup();
    const control = field('scope-country').parentElement;
    const arrow = control.querySelectorAll('svg')[1];
    await user.click(arrow);
    expect(field('scope-country')).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).not.toBeNull();
  });

  it('a press on the icon opens it too, and a press outside still closes it', async () => {
    const { user } = setup();
    const control = field('scope-country').parentElement;
    await user.click(control.querySelectorAll('svg')[0]);
    expect(field('scope-country')).toHaveAttribute('aria-expanded', 'true');
    await user.click(document.body);
    expect(field('scope-country')).toHaveAttribute('aria-expanded', 'false');
  });
});
