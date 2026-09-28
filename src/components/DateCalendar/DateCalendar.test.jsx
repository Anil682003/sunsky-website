import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateCalendar from './DateCalendar';

// The search bar's calendar. What matters here is the arithmetic, not the paint: which day a
// click actually reports, which days the 24-hour lead time refuses, and whether paging months
// lands where a traveller expects. The browser's own picker used to answer all three and each
// browser answered differently.

const month = (name) => screen.getByText(name).closest('div').parentElement;
const dayIn = (monthName, n) =>
  within(month(monthName)).getByRole('button', { name: new RegExp(`^${n} `) });

describe('DateCalendar', () => {
  it('reports the day that was clicked, in the local calendar date', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-09-01" />);

    await userEvent.click(dayIn('september 2026', 14));

    // The bug this guards: building the date and running it through toISOString() converts to
    // UTC first, so midnight in Brussels comes back as the 13th.
    expect(onChange).toHaveBeenCalledWith('2026-09-14');
  });

  it('shows two months side by side, the second following the first', () => {
    render(<DateCalendar value="2026-09-14" onChange={() => {}} min="2026-09-01" />);
    expect(screen.getByText('september 2026')).toBeInTheDocument();
    expect(screen.getByText('oktober 2026')).toBeInTheDocument();
  });

  it('opens on the month already chosen, not on the floor', () => {
    render(<DateCalendar value="2026-12-24" onChange={() => {}} min="2026-09-01" />);
    expect(screen.getByText('december 2026')).toBeInTheDocument();
  });

  it('refuses every day before the lead-time floor and offers the floor itself', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-09-16" />);

    const tooSoon = dayIn('september 2026', 15);
    expect(tooSoon).toBeDisabled();
    await userEvent.click(tooSoon);
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(dayIn('september 2026', 16));
    expect(onChange).toHaveBeenCalledWith('2026-09-16');
  });

  it('cannot page back past the month the floor sits in', async () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-16" />);

    const back = screen.getAllByRole('button', { name: 'Vorige maand' })[0];
    expect(back).toBeDisabled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Volgende maand' })[0]);
    expect(screen.getByText('oktober 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Vorige maand' })[0]).toBeEnabled();
  });

  it('pages through to a month a year out and still reports the right date', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-12-01" />);

    // December → January: the month rolls AND the year does.
    await userEvent.click(screen.getAllByRole('button', { name: 'Volgende maand' })[0]);
    await userEvent.click(dayIn('januari 2027', 3));
    expect(onChange).toHaveBeenCalledWith('2027-01-03');
  });

  it('keeps the panel open for the ± choice, and closes when the dates are the whole question', async () => {
    const onFlexChange = vi.fn();
    const onDone = vi.fn();
    const { rerender } = render(
      <DateCalendar value="" onChange={() => {}} min="2026-09-01"
        flex={0} onFlexChange={onFlexChange} onDone={onDone} />
    );

    await userEvent.click(dayIn('september 2026', 14));
    expect(onDone).not.toHaveBeenCalled();          // the ± choice is still to be answered

    await userEvent.click(screen.getByRole('radio', { name: '± 2 dagen' }));
    expect(onFlexChange).toHaveBeenCalledWith(2);

    // Without the strip (the flights tab) the date IS the question, so picking one is the answer.
    rerender(<DateCalendar value="" onChange={() => {}} min="2026-09-01" onDone={onDone} />);
    await userEvent.click(dayIn('september 2026', 14));
    expect(onDone).toHaveBeenCalled();
  });

  it('hides the flexible strip when no handler is given', () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-01" />);
    expect(screen.queryByText('Exacte data')).not.toBeInTheDocument();
  });

  it('starts the week on Monday', () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-01" months={1} />);
    const heads = screen.getAllByText(/^(ma|zo)$/).map((e) => e.textContent);
    expect(heads[0]).toBe('ma');
  });
});

describe('dates that cannot produce a valid trip', () => {
  // The calendar knows nothing about flights. It asks a predicate, so feasibility can be
  // worked out somewhere that understands it and still reach the grid.
  const noWeekends = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    return wd === 0 || wd === 6;
  };

  it('greys them out and refuses the click', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-09-01" isUnavailable={noWeekends} />);

    const saturday = dayIn('september 2026', 5);    // 5 Sept 2026 is a Saturday
    expect(saturday).toBeDisabled();
    await userEvent.click(saturday);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the workable days alone', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-09-01" isUnavailable={noWeekends} />);

    const monday = dayIn('september 2026', 7);
    expect(monday).toBeEnabled();
    await userEvent.click(monday);
    expect(onChange).toHaveBeenCalledWith('2026-09-07');
  });

  it('says so to a screen reader, not only in grey', () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-01" isUnavailable={noWeekends} />);
    expect(dayIn('september 2026', 5)).toHaveAccessibleName(/not available|niet beschikbaar/i);
  });

  it('behaves exactly as before when no predicate is given', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-09-01" />);
    await userEvent.click(dayIn('september 2026', 5));
    expect(onChange).toHaveBeenCalledWith('2026-09-05');
  });
});

describe('a chosen date that something else has since invalidated', () => {
  // The rule: keep it visible, show its state, never silently replace it. Quietly moving a
  // traveller to the nearest working day is how someone books a week they did not pick.
  const only13Bad = (iso) => iso === '2026-09-14';

  it('stays exactly where the traveller left it', () => {
    render(<DateCalendar value="2026-09-14" onChange={() => {}} min="2026-09-01" isUnavailable={only13Bad} />);
    const day = dayIn('september 2026', 14);
    expect(day).toBeInTheDocument();
    expect(day).toHaveAttribute('aria-pressed', 'true');
  });

  it('is marked as no longer usable, and cannot be re-picked', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="2026-09-14" onChange={onChange} min="2026-09-01" isUnavailable={only13Bad} />);
    const day = dayIn('september 2026', 14);
    expect(day.className).toMatch(/daySelectedInvalid/);
    expect(day).toBeDisabled();
    await userEvent.click(day);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not wear the invalid mark while it is still valid', () => {
    render(<DateCalendar value="2026-09-14" onChange={() => {}} min="2026-09-01" />);
    const day = dayIn('september 2026', 14);
    expect(day.className).toMatch(/daySelected/);
    expect(day.className).not.toMatch(/daySelectedInvalid/);
    expect(day).toBeEnabled();
  });
});

describe('the legend', () => {
  it('is off unless asked for', () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-01" />);
    expect(screen.queryByText(/not available|niet beschikbaar/i)).not.toBeInTheDocument();
  });

  it('names the three states when shown', () => {
    const { container } = render(<DateCalendar value="" onChange={() => {}} min="2026-09-01" legend />);
    // Matched on the legend's own items rather than by text: "Available" is a substring of
    // "Not available", so a loose text query finds two of the three and fails on the ambiguity.
    const items = [...container.querySelectorAll('[class*="legendItem"]')].map((el) => el.textContent.trim());
    expect(items).toHaveLength(3);
    expect(items.join(' | ')).toMatch(/available|beschikbaar/i);
    expect(items.join(' | ')).toMatch(/selected|geselecteerd/i);
  });
});
