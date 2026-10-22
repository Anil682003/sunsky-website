import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../api', () => ({ fetchGeoPlaces: vi.fn(() => Promise.resolve({})) }));

const { default: DestinationModal } = await import('./DestinationModal');

/**
 * Closing the picker (X, Escape, backdrop) hands back what it shows. It used to discard the
 * draft, so a traveller who removed every country and closed still saw the old countries in the
 * search box, with no way to clear them: Apply is disabled while nothing is picked.
 */
const HR = { id: 1, code: 'HR', isoCode: 'HR', name: 'Kroatië' };
const TZ = { id: 2, code: 'TZ', isoCode: 'TZ', name: 'Tanzania' };
const open = (onApply, value = { countries: [HR, TZ], places: [] }) =>
  render(<DestinationModal open countries={[HR, TZ]} value={value} onApply={onApply} onClose={vi.fn()} />);
const removeFirst = (name) => fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`${name} verwijderen|Remove ${name}`) })[0]);

describe('DestinationModal: closing keeps what the picker shows', () => {
  it('every country removed, then X: the search gets an empty selection', () => {
    const onApply = vi.fn();
    open(onApply);
    removeFirst('Kroatië');
    removeFirst('Tanzania');
    fireEvent.click(screen.getByRole('button', { name: /^(Sluiten|Close)$/ }));
    expect(onApply).toHaveBeenCalledWith({ countries: [], places: [] });
  });

  it('one country removed, then Escape: the search keeps the other one', () => {
    const onApply = vi.fn();
    open(onApply);
    removeFirst('Kroatië');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].countries.map((c) => c.code)).toEqual(['TZ']);
  });

  it('closing without a change hands back the same selection', () => {
    const onApply = vi.fn();
    open(onApply);
    fireEvent.click(screen.getByRole('button', { name: /^(Sluiten|Close)$/ }));
    expect(onApply.mock.calls[0][0].countries.map((c) => c.code)).toEqual(['HR', 'TZ']);
  });
});

/**
 * A selection restored from the search store, in the shape an OLDER record has: a country with
 * no flagUrl, and a place with neither an id nor a key, because the store did not keep either
 * at the time it was written. This is what every returning traveller's browser actually holds,
 * and it is how the bug was reported: "1 place selected" in the footer, the country's flag
 * blank, and not one chip in the list showing as picked.
 */
const TR = { id: 3, code: 'TR', isoCode: 'TR', name: 'Turkije', flagUrl: 'https://flagcdn.com/tr.svg' };
const TR_STORED_OLD = { id: 3, code: 'TR', name: 'Turkije' };          // no flagUrl, no isoCode
const BODRUM_STORED_OLD = { type: 'city', code: 'BJV', name: 'Bodrum', countryId: 3 };  // no id, no key

const PLACES_TR = {
  countryId: 3, code: 'TR', isoCode: 'TR', name: 'Turkije', flagUrl: 'https://flagcdn.com/tr.svg',
  regions: [],
  cities: [
    // THEMED: a city with a theme renders through the grouped branch, not renderChips.
    // Bodrum is themed on the live data, and that branch kept the old id-based tick after the
    // other one was fixed, so the bug survived in exactly the place it was reported from.
    { id: 1470, code: 'BJV', name: 'Bodrum', themes: [{ id: 1, name: 'Zonvakanties', icon: '☀' }] },
    { id: 1471, code: 'DID', name: 'Didim' },
  ],
};

// Mounted shut, then opened — the way the homepage actually uses it. The picker re-seeds its
// draft and expands the last-picked country on the open TRANSITION, so a test that mounts it
// already open never gets a chip list at all.
const openRestored = (onApply = vi.fn(), places = [BODRUM_STORED_OLD]) => {
  const props = {
    countries: [TR],
    value: { countries: [TR_STORED_OLD], places },
    onApply,
    onClose: vi.fn(),
  };
  const view = render(<DestinationModal open={false} {...props} />);
  view.rerender(<DestinationModal open {...props} />);
  return view;
};

describe('DestinationModal: a selection restored from an older stored record', () => {
  beforeEach(async () => {
    const api = await import('../../api');
    api.fetchGeoPlaces.mockResolvedValue([PLACES_TR]);
  });

  it('ticks the place it remembers, on the first open, with no id stored', async () => {
    openRestored();
    const bodrum = await screen.findByRole('button', { name: /^Bodrum$/ });
    const didim = screen.getByRole('button', { name: /^Didim$/ });
    // The bug: both chips looked identical, because the tick was keyed by an id the record
    // never had. They must now differ.
    expect(bodrum.className).not.toBe(didim.className);
    expect(bodrum.className).toMatch(/chipActive/);
    expect(didim.className).not.toMatch(/chipActive/);
  });

  it('un-ticks that place rather than picking it a second time', async () => {
    const onApply = vi.fn();
    openRestored(onApply);
    const bodrum = await screen.findByRole('button', { name: /^Bodrum$/ });
    fireEvent.click(bodrum);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onApply.mock.calls[0][0].places).toHaveLength(0);
  });

  it('removes it from the footer without taking anything else with it', async () => {
    const onApply = vi.fn();
    // Two keyless places: removing one used to remove BOTH, because they filtered on a stored
    // key that was undefined for each of them.
    openRestored(onApply, [BODRUM_STORED_OLD, { type: 'city', code: 'DID', name: 'Didim', countryId: 3 }]);
    fireEvent.click(screen.getAllByRole('button', { name: /Bodrum verwijderen|Remove Bodrum/ })[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onApply.mock.calls[0][0].places.map((x) => x.code)).toEqual(['DID']);
  });
});

/**
 * The rail used to be plain alphabetical, so Albania and Aruba led while Spain and Turkey sat
 * below the fold. The dashboard now marks countries Popular and ranks them (GeoData →
 * Countries) and the API publishes that as `popular` / `popularOrder`.
 */
const ALB = { id: 10, code: 'AL', isoCode: 'AL', name: 'Albanië' };
const ESP = { id: 11, code: 'ES', isoCode: 'ES', name: 'Spanje', popular: true, popularOrder: 2 };
const TUR = { id: 12, code: 'TR', isoCode: 'TR', name: 'Turkije', popular: true, popularOrder: 1 };

const railNames = () =>
  screen.getAllByRole('button')
    .map((b) => b.textContent.trim())
    .filter((t) => /Albanië|Spanje|Turkije/.test(t));

describe('DestinationModal: the countries rail leads with the agency’s picks', () => {
  const openWith = (countries) => {
    const props = { countries, value: { countries: [], places: [] }, onApply: vi.fn(), onClose: vi.fn() };
    const view = render(<DestinationModal open={false} {...props} />);
    view.rerender(<DestinationModal open {...props} />);
    return view;
  };

  it('puts the popular countries first, in the dashboard’s rank', () => {
    openWith([ALB, ESP, TUR]);
    expect(railNames().map((t) => t.replace(/\s+/g, ' '))).toEqual(['Turkije', 'Spanje', 'Albanië']);
  });

  it('rules a line under the popular block so the list does not read as mis-sorted', () => {
    openWith([ALB, ESP, TUR]);
    expect(screen.getByText(/Alle landen|All countries/)).toBeInTheDocument();
  });

  it('draws no line when nothing is popular — a caption over the whole list labels nothing', () => {
    openWith([ALB, { ...ESP, popular: false, popularOrder: null }]);
    expect(screen.queryByText(/Alle landen|All countries/)).toBeNull();
  });

  it('lists every country exactly once', () => {
    openWith([ALB, ESP, TUR]);
    const names = railNames();
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(3);
  });
});
