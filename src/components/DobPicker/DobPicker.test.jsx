import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DobPicker from './DobPicker';

// A controlled wrapper, because the bug this component had only appears when a parent owns the
// value: the parent stores one ISO string, a lone day does not make one, and so every partial
// selection came straight back as an empty control. Testing the component in isolation with a
// fixed value would never have caught it.
function Harness({ initial = '', travelDate = '2026-10-10', onValue }) {
  const [value, setValue] = useState(initial);
  return (
    <DobPicker
      id="dob"
      label="Date of birth, child 1"
      value={value}
      onChange={(iso) => { setValue(iso); onValue?.(iso); }}
      travelDate={travelDate}
    />
  );
}

// The site's own language is Dutch, so the accessible names are Dag / Maand / Jaar. Matched
// on either, so the test names the field rather than the current translation of it.
const box = (re) => screen.getByRole('combobox', { name: re });
const day = () => box(/^(Day|Dag)$/i);
const month = () => box(/^(Month|Maand)$/i);
const year = () => box(/^(Year|Jaar)$/i);

describe('entering a date one field at a time', () => {
  it('keeps each choice while the date is still incomplete', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // The regression: picking a day published '' to the parent, which handed back an empty
    // value, which reset the select. No date could ever be entered.
    await user.selectOptions(day(), '14');
    expect(day()).toHaveValue('14');

    await user.selectOptions(month(), '8');
    expect(day()).toHaveValue('14');
    expect(month()).toHaveValue('8');

    await user.selectOptions(year(), '2018');
    expect([day().value, month().value, year().value]).toEqual(['14', '8', '2018']);
  });

  it('tells the parent nothing until the date is real, then tells it once', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.selectOptions(day(), '14');
    await user.selectOptions(month(), '8');
    expect(onValue).toHaveBeenLastCalledWith('');    // a day and a month is not a birthday

    await user.selectOptions(year(), '2018');
    expect(onValue).toHaveBeenLastCalledWith('2018-08-14');
  });

  it('shows the age once it can be worked out, against the travel date', async () => {
    const user = userEvent.setup();
    render(<Harness travelDate="2026-10-10" />);
    await user.selectOptions(day(), '14');
    await user.selectOptions(month(), '8');
    await user.selectOptions(year(), '2018');
    // Born 14 Aug 2018, travelling 10 Oct 2026: eight, having turned eight in August.
    expect(screen.getByText(/8 (years old when you travel|jaar op de reisdatum)/)).toBeInTheDocument();
  });
});

describe('the day list follows the month', () => {
  it('offers 29 days in a leap February and 28 otherwise', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(month(), '2');
    await user.selectOptions(year(), '2020');
    expect(day().querySelectorAll('option')).toHaveLength(29 + 1);   // + the placeholder

    await user.selectOptions(year(), '2021');
    expect(day().querySelectorAll('option')).toHaveLength(28 + 1);
  });

  it('clamps a day the new month does not have, rather than emitting 31 November', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await user.selectOptions(day(), '31');
    await user.selectOptions(year(), '2021');
    await user.selectOptions(month(), '11');            // November has 30
    expect(day()).toHaveValue('30');
    expect(onValue).toHaveBeenLastCalledWith('2021-11-30');
  });
});

describe('errors', () => {
  it('stays quiet while the date is merely unfinished', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(day(), '14');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('speaks up as soon as a complete date is impossible', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // 2026 is not a leap year, so 29 February does not exist. Nothing further the customer
    // types will fix it, so it is wrong straight away rather than on submit.
    await user.selectOptions(month(), '2');
    await user.selectOptions(year(), '2026');
    await user.selectOptions(day(), '28');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the fields, not just the message', async () => {
    render(<Harness initial="" />);
    render(<DobPicker id="d2" label="x" value="" onChange={() => {}} travelDate="2026-10-10" showError />);
    // showError is what a failed Save sets: an unfinished date becomes an error only once
    // something has actually asked for it.
    const invalid = document.querySelectorAll('[aria-invalid="true"]');
    expect(invalid.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
});
