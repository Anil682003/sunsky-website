import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StayBar from './StayBar';

// The departure date on the hotel page. It used to open the BROWSER's calendar through a hidden
// <input type="date">, which can only be given a min and a max — so a day this search has no
// flight for looked exactly like a day it does (UI-01, Ch1 §7 §9A). It now opens the site's own
// calendar in the same popover the other fields use, and that one can refuse a day.

const base = {
  checkIn: '2027-03-10',
  formatDate: (iso) => iso,
  adults: 2,
  children: 0,
  rooms: 1,
  nights: 7,
  transport: 'package',
  onChange: () => {},
  onBoardChange: () => {},
  onChildAges: () => {},
  onChildDobs: () => {},
  onReset: () => {},
};

const openCalendar = async (user) => {
  await user.click(screen.getByRole('button', { name: /Vertrekdatum|Departure date/i }));
  return screen.getByRole('dialog', { name: /Vertrekdatum|Departure date/i });
};

const dayIn = (dialog, n) => within(dialog).getByRole('button', { name: new RegExp(`^${n} `) });

describe('StayBar departure date', () => {
  it('opens the site calendar rather than handing over to the browser picker', async () => {
    const user = userEvent.setup();
    const { container } = render(<StayBar {...base} />);

    // No hidden native input left behind: it was the thing that could not grey a day.
    expect(container.querySelector('input[type="date"]')).toBeNull();

    const dialog = await openCalendar(user);
    expect(within(dialog).getByRole('button', { name: /^10 / })).toBeTruthy();
  });

  it('refuses the days the search cannot fly, and leaves the rest alone', async () => {
    const user = userEvent.setup();
    // Only the 12th flies.
    const isUnavailable = (iso) => iso !== '2027-03-12';
    render(<StayBar {...base} isUnavailable={isUnavailable} />);

    const dialog = await openCalendar(user);
    expect(dayIn(dialog, 12)).not.toBeDisabled();
    expect(dayIn(dialog, 13)).toBeDisabled();
    expect(dayIn(dialog, 13).getAttribute('aria-label')).toMatch(/not available|niet beschikbaar/i);
  });

  it('greys nothing when the answer is unknown', async () => {
    // null is what the hook returns for a failed, incomplete or unaskable answer. Every day
    // must stay pickable: a greyed day the traveller could have flown is a sale lost in silence.
    const user = userEvent.setup();
    render(<StayBar {...base} isUnavailable={null} />);

    const dialog = await openCalendar(user);
    expect(dayIn(dialog, 12)).not.toBeDisabled();
    expect(dayIn(dialog, 13)).not.toBeDisabled();
    expect(dayIn(dialog, 20)).not.toBeDisabled();
  });

  it('reports the day that was picked and closes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StayBar {...base} onChange={onChange} />);

    const dialog = await openCalendar(user);
    await user.click(dayIn(dialog, 18));

    expect(onChange).toHaveBeenCalledWith({ checkIn: '2027-03-18' });
    expect(screen.queryByRole('dialog', { name: /Vertrekdatum|Departure date/i })).toBeNull();
  });

  it('a date already chosen stays on screen when it becomes unflyable', async () => {
    // Dropping it, or quietly moving it to the nearest working day, is how someone ends up
    // booking a week they never picked. It is shown, marked, and not selectable again.
    const user = userEvent.setup();
    render(<StayBar {...base} isUnavailable={(iso) => iso === '2027-03-10'} />);

    const dialog = await openCalendar(user);
    const chosen = dayIn(dialog, 10);
    expect(chosen).toBeDisabled();
    expect(chosen.getAttribute('aria-label')).toMatch(/not available|niet beschikbaar/i);
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
  });
});

/**
 * Exact trip lengths (UI-07 / Ch1 §9A, Ch3 §6). A length with no complete package cannot be
 * chosen, and one the traveller already chose is never silently swapped for one that works.
 */
describe('StayBar exact length', () => {
  const chip = (days) => screen.getByRole('button', { name: new RegExp(`^${days} (days|dagen)`) });

  it('refuses a length with no package and leaves the rest alone', async () => {
    render(<StayBar {...base} nights={6} durationUnavailable={(d) => d === 9} />);
    expect(chip(9)).toBeDisabled();
    expect(chip(9).getAttribute('aria-label')).toMatch(/not available|niet beschikbaar/i);
    expect(chip(7)).not.toBeDisabled();
  });

  it('refuses nothing while the answer is unknown', () => {
    // null is what the hook returns for a failed, incomplete or length-fixed question. Every
    // chip stays pickable: "an unknown length is not clickable but is not called sold out".
    render(<StayBar {...base} nights={6} durationUnavailable={null} />);
    for (const d of [7, 8, 9]) expect(chip(d)).not.toBeDisabled();
  });

  it('a length already chosen stays chosen when the new dates cannot do it', () => {
    // 7 days picked (6 nights), and nothing that long flies any more.
    render(<StayBar {...base} nights={6} durationUnavailable={(d) => d === 7} />);
    const c = chip(7);
    expect(c.getAttribute('aria-pressed')).toBe('true');
    expect(c).toBeDisabled();
    expect(c.getAttribute('aria-label')).toMatch(/not available|niet beschikbaar/i);
  });

  it('picking an available length reports the nights behind it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StayBar {...base} nights={6} onChange={onChange} durationUnavailable={() => false} />);
    await user.click(chip(8));
    expect(onChange).toHaveBeenCalledWith({ nights: 7 });
  });
});
