import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const fetchGeoPlaces = vi.fn();
vi.mock('../../api', () => ({ fetchGeoPlaces: (...a) => fetchGeoPlaces(...a) }));

const { default: DestinationModal } = await import('./DestinationModal');

/**
 * UI-05 / Ch1 §9A, case 19. After a departure airport is chosen, a destination no flight
 * reaches from it is shown greyed and cannot be picked, with the reason on it.
 *
 * The modal knows nothing about flights. It asks a predicate, exactly as DateCalendar does, so
 * the rule about what "unavailable" means lives in one place and this component stays a picker.
 */

const TR = { id: 1, code: 'TR', isoCode: 'TR', name: 'Turkije' };
const ANTALYA = { id: 11, code: 'AYT', name: 'Antalya' };
const BODRUM  = { id: 12, code: 'BJV', name: 'Bodrum' };

beforeEach(() => {
  fetchGeoPlaces.mockReset();
  fetchGeoPlaces.mockResolvedValue([{ countryId: 1, regions: [], cities: [ANTALYA, BODRUM] }]);
});

/**
 * Render with the country's chips on screen.
 *
 * The component only auto-expands a country when `open` CHANGES, so one mounted already-open
 * has nothing expanded. The traveller's first click is on the country block, so the test makes
 * it too rather than reaching into state.
 */
const open = async (props = {}) => {
  const view = render(
    <DestinationModal
      open
      countries={[TR]}
      value={{ countries: [TR], places: [] }}
      onApply={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  );
  await waitFor(() => expect(fetchGeoPlaces).toHaveBeenCalled());
  // Found by aria-expanded rather than by text: the header's accessible name is the whole
  // run-together header, and what it says changes once a place in that country is picked.
  const header = await waitFor(() => {
    const el = document.querySelector('[role="button"][aria-expanded="false"]');
    expect(el).toBeTruthy();
    return el;
  });
  fireEvent.click(header);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^Bodrum/ })[0]).toBeTruthy());
  return view;
};

const chip = (name) => screen.getAllByRole('button', { name: new RegExp(`^${name}`) })[0];

describe('destinations the chosen airport cannot reach', () => {
  it('greys the unreachable one and leaves the rest alone', async () => {
    await open({
      isUnavailable: (item) => item.code === 'BJV',
      unavailableReason: 'Niet beschikbaar vanaf Charleroi',
    });

    
    expect(chip('Bodrum')).toBeDisabled();
    expect(chip('Bodrum')).toHaveAttribute('title', 'Niet beschikbaar vanaf Charleroi');
    expect(chip('Antalya')).not.toBeDisabled();
  });

  it('a greyed destination cannot be picked', async () => {
    const onApply = vi.fn();
    await open({ onApply, isUnavailable: (item) => item.code === 'BJV' });

        fireEvent.click(chip('Bodrum'));

    // Still nothing selected: the click did not quietly add it.
    fireEvent.click(screen.getByRole('button', { name: /^(Sluiten|Close)$/ }));
    expect(onApply.mock.calls[0][0].places).toEqual([]);
  });

  it('a destination the traveller already picked is never greyed', async () => {
    // Ch1 §9A: a choice that stops being possible stays visible and keeps its tick, so the
    // traveller can see what no longer fits and decide. Removing or disabling it under them is
    // the one thing the contract rules out.
    await open({
      value: { countries: [TR], places: [{ key: 'city-12', type: 'city', id: 12, code: 'BJV', name: 'Bodrum', countryId: 1 }] },
      isUnavailable: () => true,
    });

        expect(chip('Bodrum')).not.toBeDisabled();
  });

  it('with no predicate, nothing is ever greyed', async () => {
    // Every caller without a departure airport renders the picker exactly as before.
    await open();
        expect(chip('Bodrum')).not.toBeDisabled();
    expect(chip('Antalya')).not.toBeDisabled();
  });
});
