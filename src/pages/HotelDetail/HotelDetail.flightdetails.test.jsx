import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlightDetailsModal } from './HotelDetail';

// The flight-details dialog draws a JOURNEY, not a list of rows: each leg is a column, the
// wait between two legs sits in its own column between them, and every leg's airline sits
// under the leg that flew it. That geometry is built with explicit CSS-grid placement, and
// placement that is off by one column silently overlaps two legs on top of each other — the
// kind of break a snapshot of the text would sail straight past. So these assert the
// placement itself, plus the two shapes the dialog has to switch between:
//
//   connecting → rails across the top, one airline row per leg beneath a hairline
//   direct     → a single row, airline beside the times, no layover and no hairline
//
// The placement travels as the custom properties `--gc` / `--gr` rather than as an inline
// `grid-column`, because the narrow-viewport rule has to be able to collapse the whole grid
// to one column and an inline longhand would outrank it. Asserting on the custom property is
// therefore asserting on the thing that actually has to be right.

const leg = (o) => ({
  departure: '2026-09-13T08:30:00', arrival: '2026-09-13T12:40:00',
  from: 'DUS', to: 'SAW', airline: 'PC', flightNumber: '1006', duration: 250, ...o,
});

// DUS → SAW → AYT, with a 5h 30m wait at Sabiha Gökcen.
const OUT = [
  leg({}),
  leg({
    departure: '2026-09-13T18:10:00', arrival: '2026-09-13T19:30:00',
    from: 'SAW', to: 'AYT', flightNumber: '2016', duration: 80,
  }),
];
// AYT → DUS non-stop.
const RET = [
  leg({
    departure: '2026-09-19T05:30:00', arrival: '2026-09-19T08:30:00',
    from: 'AYT', to: 'DUS', airline: 'XQ', flightNumber: '282', duration: 180,
  }),
];

const BAGGAGE = { checkedKg: 20, handKg: 0 };

const open = (props) => render(
  <FlightDetailsModal
    flight={{ outLegs: OUT, retLegs: RET, baggage: BAGGAGE, ...props }}
    onClose={vi.fn()}
  />,
);

/** The two journey blocks the info tab renders, outbound first. */
const journeys = () => [...document.querySelectorAll('.fdm-journey')];
const styleOf = (el, prop) => el.style.getPropertyValue(prop).trim();

describe('the flight-details dialog', () => {
  it('lays a connecting journey out as leg | layover | leg, with each airline under its leg', () => {
    open();
    const [outbound] = journeys();

    // Row 1: leg in column 1, the wait in column 2, the second leg in column 3.
    const rails = [...outbound.querySelectorAll('.fdm-legrail')];
    expect(rails).toHaveLength(2);
    expect(styleOf(rails[0], '--gc')).toBe('1');
    expect(styleOf(rails[1], '--gc')).toBe('3');
    expect(rails.every((r) => styleOf(r, '--gr') === '1')).toBe(true);

    const layover = outbound.querySelector('.fdm-layover');
    expect(styleOf(layover, '--gc')).toBe('2');
    expect(styleOf(layover, '--gr')).toBe('1');
    expect(layover.textContent).toMatch(/5h 30m layover/i);
    // Named where it happens — the airport, not just the code.
    expect(layover.textContent).toMatch(/SAW/);

    // Row 2: the first airline spans its leg AND the layover beside it, so its hairline runs
    // the width of the leg above rather than stopping short of the amber pill. The last one
    // runs to the end of the grid.
    const carriers = [...outbound.querySelectorAll('.fdm-carrier')];
    expect(carriers).toHaveLength(2);
    expect(styleOf(carriers[0], '--gc')).toBe('1 / 3');
    expect(styleOf(carriers[1], '--gc')).toBe('3 / -1');
    expect(carriers.every((c) => styleOf(c, '--gr') === '2')).toBe(true);

    // One flight number per leg, each with its own airline.
    expect(carriers[0].textContent).toMatch(/PC\s?1006/);
    expect(carriers[1].textContent).toMatch(/PC\s?2016/);

    // The column track has to name a column for every leg AND every layover between them.
    const row = outbound.querySelector('.fdm-legrow');
    expect(styleOf(row, '--fdm-cols')).toBe('minmax(0,1fr) auto minmax(0,1fr)');
  });

  it('puts a direct flight on one line — airline beside the times, no layover', () => {
    open();
    const returnLeg = journeys()[1];

    expect(returnLeg.querySelector('.fdm-legrow').className).toMatch(/fdm-legrow-direct/);
    expect(returnLeg.querySelector('.fdm-layover')).toBeNull();
    expect(returnLeg.querySelectorAll('.fdm-legrail')).toHaveLength(1);
    expect(returnLeg.querySelectorAll('.fdm-carrier')).toHaveLength(1);
    // Said in words, not left to be inferred from the absence of a layover.
    expect(returnLeg.querySelector('.fdm-flag').textContent).toMatch(/direct/i);
  });

  it('summarises the fare\'s baggage on each journey, and never invents a cabin weight', () => {
    open();
    const chips = [...journeys()[0].querySelectorAll('.bp-chip')].map((c) => c.textContent);
    expect(chips.join(' ')).toMatch(/Checked baggage 20 kg/);
    // The supplier reports handLuggage 0, which means "not itemised" rather than "none" on a
    // fare that carries 20kg of hold baggage — so the chip says included and stops there.
    expect(chips.join(' ')).toMatch(/Cabin bag included/);
    expect(chips.join(' ')).not.toMatch(/Cabin bag \d/);
  });

  it('lists every flight in the baggage table, with a personal-item column', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('tab', { name: /baggage information/i }));

    // One table per direction; the columns are the same on both.
    expect(document.querySelectorAll('.fdm-table')).toHaveLength(2);
    const heads = [...document.querySelectorAll('.fdm-table thead th')]
      .slice(0, 6).map((th) => th.textContent);
    expect(heads.join('|')).toMatch(/Personal item/);
    expect(heads.join('|')).toMatch(/Cabin bag/);
    expect(heads.join('|')).toMatch(/Checked baggage/);

    // Three flights across both directions — the allowance belongs to the FARE, so every one
    // of them carries the same figures rather than the table implying they differ.
    const rows = [...document.querySelectorAll('.fdm-table tbody tr')];
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector('.fdm-td-flno').textContent))
      .toEqual(['PC 1006', 'PC 2016', 'XQ 282']);

    // The hold-baggage cell leads with the weight; the two cabin cells lead with "Included"
    // and put the size underneath. Both patterns share one cell component, so a regression in
    // it would flip every column to the same shape.
    const cells = [...rows[0].querySelectorAll('.fdm-allow')];
    expect(cells).toHaveLength(3);
    expect(cells[0].className).toMatch(/fdm-allow-inc/);      // personal item
    expect(cells[1].className).toMatch(/fdm-allow-inc/);      // cabin bag
    expect(cells[2].className).toMatch(/fdm-allow-weight/);   // checked
    expect(cells[2].textContent).toMatch(/20 kg/);
  });
});
