import { describe, it, expect, vi } from 'vitest';
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
