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

    await userEvent.click(dayIn('September 2026', 14));

    // The bug this guards: building the date and running it through toISOString() converts to
    // UTC first, so midnight in Brussels comes back as the 13th.
    expect(onChange).toHaveBeenCalledWith('2026-09-14');
  });

  it('shows two months side by side, the second following the first', () => {
    render(<DateCalendar value="2026-09-14" onChange={() => {}} min="2026-09-01" />);
    expect(screen.getByText('September 2026')).toBeInTheDocument();
    expect(screen.getByText('October 2026')).toBeInTheDocument();
  });

  it('opens on the month already chosen, not on the floor', () => {
    render(<DateCalendar value="2026-12-24" onChange={() => {}} min="2026-09-01" />);
    expect(screen.getByText('December 2026')).toBeInTheDocument();
  });

  it('refuses every day before the lead-time floor and offers the floor itself', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-09-16" />);

    const tooSoon = dayIn('September 2026', 15);
    expect(tooSoon).toBeDisabled();
    await userEvent.click(tooSoon);
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(dayIn('September 2026', 16));
    expect(onChange).toHaveBeenCalledWith('2026-09-16');
  });

  it('cannot page back past the month the floor sits in', async () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-16" />);

    const back = screen.getAllByRole('button', { name: 'Previous month' })[0];
    expect(back).toBeDisabled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Next month' })[0]);
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Previous month' })[0]).toBeEnabled();
  });

  it('pages through to a month a year out and still reports the right date', async () => {
    const onChange = vi.fn();
    render(<DateCalendar value="" onChange={onChange} min="2026-12-01" />);

    // December → January: the month rolls AND the year does.
    await userEvent.click(screen.getAllByRole('button', { name: 'Next month' })[0]);
    await userEvent.click(dayIn('January 2027', 3));
    expect(onChange).toHaveBeenCalledWith('2027-01-03');
  });

  it('keeps the panel open for the ± choice, and closes when the dates are the whole question', async () => {
    const onFlexChange = vi.fn();
    const onDone = vi.fn();
    const { rerender } = render(
      <DateCalendar value="" onChange={() => {}} min="2026-09-01"
        flex={0} onFlexChange={onFlexChange} onDone={onDone} />
    );

    await userEvent.click(dayIn('September 2026', 14));
    expect(onDone).not.toHaveBeenCalled();          // ± 2 days is still to be answered

    await userEvent.click(screen.getByRole('radio', { name: '± 2 days' }));
    expect(onFlexChange).toHaveBeenCalledWith(2);

    // Without the strip (the flights tab) the date IS the question, so picking one is the answer.
    rerender(<DateCalendar value="" onChange={() => {}} min="2026-09-01" onDone={onDone} />);
    await userEvent.click(dayIn('September 2026', 14));
    expect(onDone).toHaveBeenCalled();
  });

  it('hides the flexible strip when no handler is given', () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-01" />);
    expect(screen.queryByText('Exact dates')).not.toBeInTheDocument();
  });

  it('starts the week on Monday', () => {
    render(<DateCalendar value="" onChange={() => {}} min="2026-09-01" months={1} />);
    const heads = screen.getAllByText(/^(Mon|Sun)$/).map((e) => e.textContent);
    expect(heads[0]).toBe('Mon');
  });
});
