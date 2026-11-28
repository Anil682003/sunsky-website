import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SupplierRemarks from './SupplierRemarks';

const TEXT = 'Minimum age 18 years (Adults only).\nCheck-in from 14:00, check-out until 12:00.\n\n'
  + 'Cancellations and changes follow the conditions of the booked rate.';

const toggle = () => screen.getByRole('button', { name: /specifieke voorwaarden van het geselecteerde tarief/i });

describe('SupplierRemarks', () => {
  it('is titled in Dutch, open by default, and shows the whole text in the supplier paragraphs', () => {
    const { container } = render(<SupplierRemarks text={TEXT} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    const paras = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(paras).toEqual([
      'Minimum age 18 years (Adults only).\nCheck-in from 14:00, check-out until 12:00.',
      'Cancellations and changes follow the conditions of the booked rate.',
    ]);
  });

  it('has no bullets, no counts and no "show all"', () => {
    const { container } = render(<SupplierRemarks text={TEXT} />);
    expect(container.querySelector('ul, ol, li')).toBeNull();
    expect(container.textContent).not.toMatch(/punten|toon alle|show all|\(\d+\)/i);
  });

  it('folds away and opens again', async () => {
    const user = userEvent.setup();
    const { container } = render(<SupplierRemarks text={TEXT} />);
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[id]').hidden).toBe(true);
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('[id]').hidden).toBe(false);
  });

  it('new remarks (the rate changed) replace the old ones and open the section again', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<SupplierRemarks text={TEXT} />);
    await user.click(toggle());
    rerender(<SupplierRemarks text="Non-refundable rate. Breakfast served 07:00-10:00." />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(container.textContent).toContain('Non-refundable rate. Breakfast served 07:00-10:00.');
    expect(container.textContent).not.toContain('Minimum age 18');
  });

  it('lays out W2M remarks by what they say: headings, label/value pairs, run-together items (26 Nov 2026)', () => {
    const W2M = 'Fees:\n\nFee for continental breakfast: approximately USD 25 per personAirport shuttle fee: USD 200 per person (roundtrip)Airport shuttle fee per child: USD 199\n\n'
      + 'Checkin Time:\n\n3:00 PM\n\nCheckout Time:\n\n12:00 PM\n\nSpecial Checkin Instructions:\n\nCall ahead.Front desk staff will greet guests.';
    const { container } = render(<SupplierRemarks text={W2M} />);
    expect([...container.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['Fees', 'Special Checkin Instructions']);
    expect([...container.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Checkin Time', 'Checkout Time']);
    expect([...container.querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['3:00 PM', '12:00 PM']);
    const paras = [...container.querySelectorAll('p')].map((p) => p.textContent);
    expect(paras[0]).toBe('Fee for continental breakfast: approximately USD 25 per person\nAirport shuttle fee: USD 200 per person (roundtrip)\nAirport shuttle fee per child: USD 199');
    expect(paras[1]).toBe('Call ahead. Front desk staff will greet guests.');
    // Every word of the supplier's text is still there.
    for (const w of W2M.replace(/[:.\n]/g, ' ').split(/\s+/).filter(Boolean)) expect(container.textContent).toContain(w.replace(/personAirport/, 'person').replace(/\(roundtrip\)Airport/, '(roundtrip)'));
  });

  it('option A (26 Nov 2026): facts on top, every section open and foldable, lists as tags, money marked', () => {
    const TXT = 'Resort fee: USD 24 per night.\n\nFees:\n\nThe resort fee includes:Beach accessBeach loungersBeach towelsPool access\n\n'
      + 'Checkin Time:\n\n3:00 PM\n\nCheckin Instructions:\n\nBring photo ID.';
    const { container } = render(<SupplierRemarks text={TXT} />);
    const body = container.querySelector('[id]');
    // The label/value pair first, before the text and the sections.
    expect(body.firstElementChild.tagName).toBe('DL');
    expect(container.querySelector('dt').textContent).toBe('Checkin Time');
    // One section per heading, all open to start with.
    const secs = [...container.querySelectorAll('details')];
    expect(secs.map((d) => d.querySelector('h4').textContent)).toEqual(['Fees', 'Checkin Instructions']);
    expect(secs.every((d) => d.open)).toBe(true);
    // The glued list as tags; never a bulleted list.
    expect([...container.querySelectorAll('details span')].map((s) => s.textContent)).toEqual(expect.arrayContaining(['Beach loungers', 'Beach towels', 'Pool access']));
    expect(container.querySelector('ul, ol, li')).toBeNull();
    // The amount marked, the words unchanged.
    expect([...container.querySelectorAll('p span')].map((s) => s.textContent)).toContain('USD 24');
    for (const w of ['Resort', 'fee', 'USD', '24', 'night', 'includes', 'Beach', 'access', '3:00', 'PM', 'Bring', 'photo', 'ID']) expect(container.textContent).toContain(w);
  });

  it('renders nothing at all when the supplier sent no remarks', () => {
    const { container } = render(<SupplierRemarks text="  " />);
    expect(container.innerHTML).toBe('');
  });
});
